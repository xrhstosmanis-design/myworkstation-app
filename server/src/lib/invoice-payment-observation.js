import {invoiceNumberParts} from './invoice-common-draft.js';

const purchaseDocumentMime='application/vnd.myworkstation.purchase-document';
const activeDocuments=new Set(['DRAFT','APPROVED']);
const pendingStates=new Set(['PARTIALLY_PAID','OVERPAID','REVERSED']);
const reviewStates=new Set(['REVIEW_REQUIRED','UNCONFIRMED','UNAVAILABLE']);
const text=value=>typeof value==='string'&&value.trim()!=='';
const exactCents=value=>{
 if(typeof value!=='string'||value.length>48||!/^\d+(?:\.\d+)?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 if(fraction.slice(2).replace(/0/g,''))return null;
 const result=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
 return result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null;
};
const sameNumber=(a,b)=>{
 const left=invoiceNumberParts(a),right=invoiceNumberParts(b);
 return Boolean(left.number&&left.number===right.number&&left.series===right.series);
};
const result=(status,extra={})=>({status,paidCents:null,remainingCents:null,overpaymentCents:null,paymentCount:null,transactionIds:[],...extra});
const scopeConflict=(a,b)=>['companyId','storeId'].some(key=>text(a[key])&&text(b[key])&&a[key]!==b[key]);
// The workflow classifier also puts this posting-only warning in the identity
// category. It does not contradict an independently proven payment. Exempt
// only this exact, sole reason; absent, malformed or mixed reasons fail closed.
const postingOnlyReason='Η καταχώριση αγοράς δεν διαθέτει επιβεβαιωμένο εγκεκριμένο παραστατικό και σύνδεση αποθήκης.';
const financialIdentityReview=item=>(item.categories||[]).includes('IDENTITY_OR_LINK_REVIEW')&&
 !(Array.isArray(item.reasons)&&item.reasons.length===1&&item.reasons[0]===postingOnlyReason);

/**
 * Payment observation for already scoped, classified monthly invoice facts.
 * This is not an authorization or source reader. Its caller must load all
 * transaction/settlement facts in the same authorized read-only snapshot.
 * Payment observation never changes purchase approval, source grouping or stock.
 */
export function observeInvoicePayments(items,facts,transactions,{available=false,allocationsAvailable=false,toleranceCents=0}={}){
 if(!Number.isSafeInteger(toleranceCents)||toleranceCents<0||toleranceCents>5)throw new RangeError('Payment observation tolerance must be an integer from zero to five cents.');
 const documents=new Map(),duplicateDocuments=new Set(),transactionRows=new Map(),transactionsByDocument=new Map(),documentClaimsByPayment=new Map(),allocationsByPayment=new Map(),allocatedTransactionsByDocument=new Map(),allocationIdCounts=new Map();
 for(const document of facts.documents||[]){
  if(documents.has(document.id))duplicateDocuments.add(document.id);
  documents.set(document.id,document);
  // Source facts cover every month. A payment claimed by another active
  // document must not appear unique merely because that invoice is off-page.
  if(activeDocuments.has(document.status)&&text(document.paymentTransactionId)){
   const ids=documentClaimsByPayment.get(document.paymentTransactionId)||new Set();
   ids.add(document.id);documentClaimsByPayment.set(document.paymentTransactionId,ids);
  }
 }
 for(const transaction of transactions||[]){
  const rows=transactionRows.get(transaction.id)||[];rows.push(transaction);transactionRows.set(transaction.id,rows);
  if(transaction.attachmentMimeType===purchaseDocumentMime){
   const documentId=transaction.attachmentFilename,ids=transactionsByDocument.get(documentId)||new Set();
   ids.add(transaction.id);transactionsByDocument.set(documentId,ids);
  }
 }
 for(const allocation of facts.paymentAllocations||[]){
  const rows=allocationsByPayment.get(allocation.transactionId)||[];rows.push(allocation);allocationsByPayment.set(allocation.transactionId,rows);
  allocationIdCounts.set(allocation.id,(allocationIdCounts.get(allocation.id)||0)+1);
  const ids=allocatedTransactionsByDocument.get(allocation.documentId)||new Set();ids.add(allocation.transactionId);allocatedTransactionsByDocument.set(allocation.documentId,ids);
 }
 const groups=items.map(item=>{
  const sources=(item.sources||[]).filter(source=>source.kind==='DOCUMENT');
  const allIds=new Set(sources.map(source=>source.id));
  const docs=sources.filter(source=>source.status!=='MERGED').map(source=>documents.get(source.id)).filter(document=>document&&activeDocuments.has(document.status));
  const paymentIds=new Set(docs.map(document=>document.paymentTransactionId).filter(text));
  // Index the bounded source once, rather than rescan every transaction for
  // every invoice. Duplicate/conflicting rows remain in transactionRows and
  // therefore still fail the proof below.
  const candidateIds=new Set([...paymentIds].filter(id=>transactionRows.has(id)));
  for(const document of docs)for(const id of transactionsByDocument.get(document.id)||[])candidateIds.add(id);
  for(const documentId of allIds)for(const id of allocatedTransactionsByDocument.get(documentId)||[])candidateIds.add(id);
  return {item,allIds,docs,paymentIds,candidates:[...candidateIds]};
 });
 const claims=new Map(),documentGroupClaims=new Map();
 for(const group of groups){
  for(const id of group.candidates)claims.set(id,(claims.get(id)||0)+1);
  for(const id of group.allIds)documentGroupClaims.set(id,(documentGroupClaims.get(id)||0)+1);
 }
 // Validate the complete allocation set once per transaction, including
 // off-month targets. A valid current target cannot hide a foreign or missing
 // other target, an unconfirmed settlement or an overallocated transaction.
 const allocationProofs=new Map();
 for(const [id,allocations]of allocationsByPayment){
  const rows=transactionRows.get(id),transaction=rows?.[0],amount=exactCents(transaction?.amount);
  const amountsByDocument=new Map();let total=0,unconfirmed=false;
  let valid=allocationsAvailable&&rows?.length===1&&amount!==null&&amount>0&&text(transaction?.companyId)&&text(transaction?.storeId);
  for(const allocation of allocations){
   const allocated=exactCents(allocation.amount),target=documents.get(allocation.documentId);
   if(!text(allocation.id)||allocationIdCounts.get(allocation.id)!==1||!text(allocation.documentId)||allocated===null||allocated<=0||
    !target||duplicateDocuments.has(target.id)||!activeDocuments.has(target.status)||target.documentType!=='INVOICE'||
    !text(allocation.companyId)||!text(allocation.storeId)||!text(allocation.supplierId)||
    allocation.companyId!==transaction?.companyId||allocation.storeId!==transaction?.storeId||allocation.supplierId!==transaction?.supplierId||
    target.supplierId!==transaction?.supplierId||scopeConflict(target,allocation)||
    (Object.hasOwn(allocation,'allocationCompanyId')&&allocation.allocationCompanyId!==transaction?.companyId)||
    (documentGroupClaims.get(allocation.documentId)||0)>1){valid=false;continue}
   total+=allocated;if(!Number.isSafeInteger(total))valid=false;
   const next=(amountsByDocument.get(allocation.documentId)||0)+allocated;
   if(!Number.isSafeInteger(next))valid=false;
   amountsByDocument.set(allocation.documentId,next);
   if(allocation.settlementStatus!=='CONFIRMED')unconfirmed=true;
  }
  if(total>amount)valid=false;
  const unallocatedClaimantIds=[...(documentClaimsByPayment.get(id)||[])].filter(documentId=>!amountsByDocument.has(documentId));
  allocationProofs.set(id,{valid,unconfirmed,amountsByDocument,unallocatedClaimantIds});
 }
 const enriched=groups.map(({item,allIds,docs,paymentIds,candidates})=>{
  let payment;
  if(item.documentType==='CREDIT_NOTE')payment=result('NOT_APPLICABLE');
  else if(item.documentType!=='INVOICE')payment=result('REVIEW_REQUIRED');
  else if(!available)payment=result('UNAVAILABLE');
  else if(!docs.length)payment=result('NOT_LINKED');
  else if(!candidates.length)payment=result(paymentIds.size?'REVIEW_REQUIRED':'NOT_LINKED');
  else{
   const allocatedAmounts=new Map();
   for(const documentId of allIds)for(const id of allocatedTransactionsByDocument.get(documentId)||[]){
    const portion=allocationProofs.get(id)?.amountsByDocument.get(documentId)||0;
    allocatedAmounts.set(id,(allocatedAmounts.get(id)||0)+portion);
   }
   const gross=exactCents(docs[0].totalGross);
   let invalid=gross===null||gross<=0||(Number.isSafeInteger(item.totalCents)&&item.totalCents!==gross)||
    financialIdentityReview(item)||
    docs.some(document=>duplicateDocuments.has(document.id)||!text(document.supplierId)||document.documentType!=='INVOICE'||exactCents(document.totalGross)!==gross||
     !sameNumber(document.documentNumber,docs[0].documentNumber)||document.supplierId!==docs[0].supplierId||scopeConflict(document,docs[0])||
     (document.issueDay&&docs[0].issueDay&&document.issueDay!==docs[0].issueDay));
   let paid=0,reversed=0,unconfirmed=false;const ids=[];
   for(const id of candidates){
    const rows=transactionRows.get(id),transaction=rows?.[0],allocationProof=allocationProofs.get(id);
    if(rows?.length!==1||!text(id)||transaction.type!=='SUPPLIER_PAYMENT'||transaction.supplierId!==docs[0].supplierId||scopeConflict(transaction,docs[0])||
     (Object.hasOwn(transaction,'settlementScopeValid')&&transaction.settlementScopeValid!==true)||
     (Object.hasOwn(transaction,'settlementCount')&&(!Number.isSafeInteger(transaction.settlementCount)||transaction.settlementCount<0||transaction.settlementCount>1))){invalid=true;continue}
    const wholeAmount=exactCents(transaction.amount);
    if(wholeAmount===null||wholeAmount<=0){invalid=true;continue}
    let amount=wholeAmount,allocationUnconfirmed=false;
    if(allocationProof){
     // A source pointer/attachment is not an extra whole payment when explicit
     // allocations exist. Only this logical invoice's allocated portion counts.
     amount=allocatedAmounts.get(id)||0;
     if(!allocationProof.valid||!Number.isSafeInteger(amount)||amount<=0||
      allocationProof.unallocatedClaimantIds.some(documentId=>!allIds.has(documentId))||
      (transaction.attachmentMimeType===purchaseDocumentMime&&!allocationProof.amountsByDocument.has(transaction.attachmentFilename))){invalid=true;continue}
     allocationUnconfirmed=allocationProof.unconfirmed;
    }else{
     if((transaction.hasSettlement===true&&!allocationsAvailable)||claims.get(id)!==1||
      [...(documentClaimsByPayment.get(id)||[])].some(documentId=>!allIds.has(documentId))||
      (text(transaction.invoiceDocumentNumber)&&!sameNumber(transaction.invoiceDocumentNumber,docs[0].documentNumber))||
      (transaction.attachmentMimeType===purchaseDocumentMime&&!allIds.has(transaction.attachmentFilename))){invalid=true;continue}
    }
    ids.push(id);
    if(transaction.reversedAt){reversed++;continue}
    if(transaction.settlementConfirmed!==true||allocationUnconfirmed){unconfirmed=true;continue}
    paid+=amount;if(!Number.isSafeInteger(paid))invalid=true;
   }
   // A dangling direct reference is not evidence of zero paid or full coverage.
   if([...paymentIds].some(id=>!transactionRows.has(id)))invalid=true;
   if(invalid)payment=result('REVIEW_REQUIRED');
   else if(unconfirmed)payment=result('UNCONFIRMED');
   else if(paid===0&&reversed)payment=result('REVERSED',{paidCents:0,remainingCents:gross,overpaymentCents:0,paymentCount:0,transactionIds:ids.sort()});
   else if(paid>0){
    const difference=paid-gross,withinTolerance=difference!==0&&Math.abs(difference)<=toleranceCents;
    // Explicit presentation policy only, after every proof gate. Preserve the
    // recorded cents even when the ordinary caller accepts a small variance.
    payment=result(difference===0||withinTolerance?'PAID':difference<0?'PARTIALLY_PAID':'OVERPAID',{
     paidCents:paid,remainingCents:Math.max(0,-difference),overpaymentCents:Math.max(0,difference),paymentCount:ids.length-reversed,transactionIds:ids.sort(),
     ...(withinTolerance?{withinTolerance:true,toleranceCents,paymentDifferenceCents:difference}:{})
    });
   }else payment=result('REVIEW_REQUIRED');
  }
  return {...item,payment};
 });
 const summary={paid:0,financialPending:0,reviewRequired:0,notLinked:0,notApplicable:0};
 for(const item of enriched){
  const status=item.payment.status;
  if(status==='PAID')summary.paid++;
  else if(pendingStates.has(status))summary.financialPending++;
  else if(reviewStates.has(status))summary.reviewRequired++;
  else if(status==='NOT_LINKED')summary.notLinked++;
  else summary.notApplicable++;
 }
 return {items:enriched,summary};
}
