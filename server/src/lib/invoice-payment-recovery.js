// Read-only recovery projection. Inputs must come from scoped, canonical DB
// readers after authorization. This is not a grant, mutation or AI submission.
import crypto from 'node:crypto';

const unavailable=reason=>({state:'REVIEW_REQUIRED',reason,canCreatePayment:false,canPostStock:false});
const validId=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=200;
const cents=value=>{
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(value))return null;
  const n=Number(value),c=Math.round(n*100);
  return Number.isFinite(n)&&n>0&&n<=999999999&&Math.abs(n*100-c)<0.00001?c:null;
};
const sameScope=(row,scope)=>row?.companyId===scope.companyId&&row?.storeId===scope.storeId;
const result=(state,payment,extra={})=>({state,transactionId:payment.id,amountCents:cents(payment.amount),canCreatePayment:false,canPostStock:false,...extra});
const token=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,'');
const date=value=>{
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))return '';value=value.toISOString().slice(0,10);}
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return '';
  const day=value.slice(0,10),parsed=new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:'';
};

function verifiedOriginal(original){
  if(!original||!Array.isArray(original.pages)||original.pages.length<1||original.pages.length>5)return false;
  let bytes=0;
  for(const p of original.pages){
    if(!p||!['image/jpeg','image/png','image/webp','application/pdf'].includes(p.mimeType)||!/^([a-f0-9]{64})$/.test(p.checksum||''))return false;
    if(p.mimeType==='application/pdf'&&original.pages.length!==1)return false;
    if(typeof p.dataUrl!=='string')return false;
    const prefix=`data:${p.mimeType};base64,`;
    if(!p.dataUrl.startsWith(prefix))return false;
    const encoded=p.dataUrl.slice(prefix.length);
    if(!encoded||encoded.length>Math.ceil(6500000/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return false;
    const raw=Buffer.from(encoded,'base64');bytes+=raw.length;
    if(!raw.length||bytes>6500000||raw.toString('base64')!==encoded||crypto.createHash('sha256').update(raw).digest('hex')!==p.checksum)return false;
  }
  return true;
}

/** No side effects: report a prerequisite, never infer permission or payment. */
export function invoicePaymentRecoveryPlan({scope,payment,review,settlement,original,job,draft,retainedDraftId}={}){
  if(!validId(scope?.companyId)||!validId(scope?.storeId)||!validId(payment?.id)||!sameScope(payment,scope))return unavailable('PAYMENT_SCOPE');
  if(cents(payment.amount)===null||payment.reversedAt||!['OTHER_EXPENSE','SUPPLIER_PAYMENT'].includes(payment.type))return unavailable('PAYMENT_INELIGIBLE');
  // Every supplied record must be scoped even if another prerequisite is absent.
  for(const row of [review,settlement,original,job,draft])if(row&&!sameScope(row,scope))return unavailable('RELATED_SCOPE');
  if(payment.type==='OTHER_EXPENSE'){
    if(settlement||job||draft||retainedDraftId||payment.supplierId||payment.invoiceDocumentNumber||payment.invoicePaymentKey||payment.paymentMethod!=='CASH_SHIFT'||payment.subtractFromShift!==true||!validId(payment.sessionId))return unavailable('EXPENSE_ALREADY_LINKED');
    if(!review||review.transactionId!==payment.id||!['PENDING_REVIEW','DISCREPANCY'].includes(review.status))return unavailable('EXPENSE_REVIEW');
    return result('ASSOCIATE_SUPPLIER',payment);
  }
  if(!validId(payment.supplierId)||!settlement||settlement.transactionId!==payment.id||settlement.supplierId!==payment.supplierId||!validId(settlement.id)||!['PENDING_REVIEW','DISCREPANCY','CONFIRMED'].includes(settlement.status))return unavailable('SETTLEMENT_IDENTITY');
  if((job&&job.paymentTransactionId!==payment.id)||(draft&&draft.paymentTransactionId!==payment.id)||(original&&original.transactionId!==payment.id)||[job,draft,original].some(row=>row&&row.supplierId!==payment.supplierId))return unavailable('RELATED_IDENTITY');
  if(draft){
    if(!validId(draft.id)||!['DRAFT','APPROVED'].includes(draft.status)||draft.documentType!=='INVOICE'||cents(draft.totalGross)!==cents(payment.amount)||!token(draft.documentNumber)||token(draft.documentNumber)!==token(payment.invoiceDocumentNumber)||!date(payment.documentDate)||date(draft.documentDate)!==date(payment.documentDate))return unavailable('DRAFT_IDENTITY');
    if((retainedDraftId&&retainedDraftId!==draft.id)||(job?.purchaseDocumentId&&job.purchaseDocumentId!==draft.id))return unavailable('DRAFT_CONFLICT');
    return result('OPEN_EXISTING_DRAFT',payment,{purchaseDocumentId:draft.id});
  }
  // A remembered draft may have been intentionally deleted. Never resurrect it.
  if(retainedDraftId||job?.purchaseDocumentId)return unavailable('DRAFT_MISSING');
  if(job){
    if(!validId(job.id)||!['QUEUED','PROCESSING','AWAITING_APPROVAL'].includes(job.status))return unavailable('JOB_REVIEW');
    return result('OPEN_EXISTING_JOB',payment,{jobId:job.id});
  }
  if(settlement.status!=='CONFIRMED')return result('CONFIRM_ADVANCE',payment,{settlementId:settlement.id});
  if(!original)return result('UPLOAD_ORIGINAL',payment,{settlementId:settlement.id});
  if(original.sourceKind!=='PLAIN_CAPTURE'||!validId(original.proofId)||!verifiedOriginal(original))return unavailable('ORIGINAL_INTEGRITY');
  if(!token(payment.invoiceDocumentNumber)||!date(payment.documentDate)||token(original.documentNumber)!==token(payment.invoiceDocumentNumber)||date(original.documentDate)!==date(payment.documentDate)||cents(original.totalGross)!==cents(payment.amount))return unavailable('ORIGINAL_IDENTITY');
  return result('REQUEST_ASSISTANT',payment,{settlementId:settlement.id,proofId:original.proofId,pageChecksums:original.pages.map(p=>p.checksum)});
}
