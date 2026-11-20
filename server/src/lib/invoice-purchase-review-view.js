import {standaloneZeroDelivery} from './invoice-payment-observation.js';
import {invoiceNumberParts} from './invoice-common-draft.js';

const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const vat=value=>String(value||'').replace(/\D/g,'');
const amount=value=>{if(typeof value!=='string'||!/^\d{1,30}(?:\.\d{1,8})?$/.test(value))return null;const[a,b='']=value.split('.');return BigInt(a)*100000000n+BigInt(b.padEnd(8,'0'))};
const near=(a,b)=>a!==null&&b!==null&&a>0n&&b>0n&&(a>b?a-b:b-a)<=5000000n;
const index=(rows,key)=>{const result=new Map();for(const row of rows){const list=result.get(row[key])||[];list.push(row);result.set(row[key],list)}return result};
const unique=(map,key)=>map.get(key)?.length===1?map.get(key)[0]:null;
const headerKey=row=>{
 const number=invoiceNumberParts(row.documentNumber),tax=vat(row.supplierTaxId);
 return ['INVOICE','CREDIT_NOTE'].includes(row.documentType)&&number.number&&/^\d{9}$/.test(tax)&&day(row.issueDay)?JSON.stringify([tax,row.documentType,number.series,number.number,row.issueDay]):null;
};

/** Ordinary presentation/navigation only. Never merges sources, certifies a
 * payment, authorizes editing, or changes the raw classifier/D1 contract. */
export function composeOrdinaryPurchaseReview(items,facts,{companyId,storeId}){
 const docs=index(facts.documents||[],'id'),orders=index(facts.orders||[],'id'),ordersBySource=index(facts.orders||[],'sourceDocumentId'),inbound=index(facts.inbound||[],'id'),candidatesByHeader=new Map();
 const scoped=row=>row&&text(companyId)&&text(storeId)&&['companyId','storeId'].every(key=>!Object.hasOwn(row,key)||row[key]===(key==='companyId'?companyId:storeId));
 const pairs=[];
 for(const order of facts.orders||[]){
  const source=unique(docs,order.sourceDocumentId),sourceKey=source&&headerKey(source),orderNumber=invoiceNumberParts(order.invoiceNumber),sourceNumber=invoiceNumberParts(source?.documentNumber);
  if(!scoped(order)||!scoped(source)||!text(order.id)||!text(source.id)||unique(orders,order.id)!==order||unique(ordersBySource,source.id)!==order||
   !['NEW','FINAL','INVOICED'].includes(order.status)||!['DRAFT','APPROVED'].includes(source.status)||source.sourceType==='PURCHASE_ORDER'||
   source.purchaseOrderId!==order.id||!text(source.supplierId)||source.supplierId!==order.supplierId||!sourceKey||amount(source.totalGross)===null||amount(source.totalGross)<=0n||
   !orderNumber.number||orderNumber.series!==sourceNumber.series||orderNumber.number!==sourceNumber.number)continue;
  const pair={order,source,key:sourceKey,value:amount(source.totalGross)};pairs.push(pair);
  const list=candidatesByHeader.get(sourceKey)||[];list.push(pair);candidatesByHeader.set(sourceKey,list);
 }
 const pairsByOrder=new Map(pairs.map(pair=>[pair.order.id,pair]));
 const result=items.map(item=>{
  if(item.nonFinancialBasis==='STANDALONE_ZERO_MYDATA_9_3_V1'&&item.documentType==='DELIVERY_NOTE'&&item.payment?.status==='NOT_APPLICABLE'&&standaloneZeroDelivery(item,facts)){
   return {...item,categories:item.categories.filter(category=>!['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','PURCHASE_LINK_REVIEW'].includes(category)),purchaseReview:{status:'NON_FINANCIAL',reason:'Δελτίο αποστολής μηδενικής αξίας· δεν αποτελεί εκκρεμή αγορά ή οφειλή.'},openTarget:{kind:'PREVIEW',rowId:item.id,storeId}};
  }
  const documentSources=(item.sources||[]).filter(source=>source.kind==='DOCUMENT'),activeDocumentSources=documentSources.filter(source=>source.status!=='MERGED'),orderSources=(item.sources||[]).filter(source=>source.kind==='ORDER'&&source.status!=='MERGED');
  const originals=documentSources.map(source=>unique(docs,source.id)).filter(Boolean),incoming=(item.sources||[]).filter(source=>source.kind==='MYDATA').map(source=>unique(inbound,source.id)).filter(Boolean);
  const original=originals.find(document=>document.sourceType!=='PURCHASE_ORDER'&&document.status!=='MERGED')||originals.find(document=>document.status!=='MERGED')||incoming[0]||originals[0];
  const key=headerKey(item),value=amount(original?.totalGross),explicit=orderSources.map(source=>pairsByOrder.get(source.id)).filter(pair=>pair&&activeDocumentSources.some(source=>source.id===pair.source.id)&&key===pair.key&&near(value,pair.value));
  // Candidate matching is only a navigation suggestion. Bound work/output for
  // repeated ambiguous headers; more than20 candidates never yield an order.
  const bucket=key?candidatesByHeader.get(key)||[]:[],headerCandidates=bucket.length>20?[]:bucket.filter(pair=>near(value,pair.value));
  const suggested=explicit.length===1?explicit[0]:explicit.length===0&&headerCandidates.length===1?headerCandidates[0]:null;
  const basis=explicit.length===1?'EXPLICIT':'HEADER_CANDIDATE';
  const openTarget=suggested?{kind:'ORDER',orderId:suggested.order.id,storeId,basis}:{kind:'PREVIEW',rowId:item.id,storeId};
  const wasUnposted=item.categories.includes('UNPOSTED_DOCUMENT'),inactive=(item.sources||[]).length>0&&(item.sources||[]).every(source=>['MERGED','CANCELLED','DELETED','REJECTED','REVERSED'].includes(source.status));
  const eligible=wasUnposted&&item.documentType==='INVOICE'&&!inactive&&explicit.length===1&&explicit[0].source.status==='DRAFT'&&['NEW','FINAL'].includes(explicit[0].order.status)&&
   !item.categories.some(category=>['IDENTITY_OR_LINK_REVIEW','POSSIBLE_DUPLICATE'].includes(category))&&item.reasons.length===0&&
   !activeDocumentSources.some(source=>source.status==='APPROVED');
  let status,reason;
  if(inactive){status='INACTIVE';reason='Συγχωνευμένη ή ανενεργή εγγραφή· δεν αποτελεί νέα πρόχειρη αγορά.'}
  else if(item.documentType==='CREDIT_NOTE'){status='CREDIT';reason='Πιστωτικό παραστατικό· δεν αποτελεί πρόχειρη νέα αγορά.'}
  else if(eligible){status='DRAFT_PURCHASE';reason='Υπάρχει ενεργό πρόχειρο τιμολογίου με επιβεβαιωμένη σύνδεση αγοράς. Η πληρωμή ελέγχεται χωριστά.'}
  else if(wasUnposted||item.status!=='POSTED'){status='LINK_REVIEW';reason='Δεν επιβεβαιώνεται ενιαία ενεργή πρόχειρη αγορά. Απαιτείται αντιστοίχιση ή έλεγχος των υπαρχουσών εγγραφών.'}
  else{status='POSTED_PURCHASE';reason='Η ένδειξη καταχώρισης προέρχεται από τις ελεγμένες αποθηκευμένες πηγές· η πληρωμή ελέγχεται χωριστά.'}
  const excluded=wasUnposted&&!eligible,categories=excluded?[...item.categories.filter(category=>!['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','PURCHASE_LINK_REVIEW'].includes(category)),'PURCHASE_LINK_REVIEW']:item.categories;
  const related=(explicit.length?explicit:headerCandidates).slice(0,20).map(pair=>({orderId:pair.order.id,storeId,sourceDocumentId:pair.source.id,documentNumber:pair.source.documentNumber,issueDay:pair.source.issueDay,totalGross:pair.source.totalGross,status:pair.order.status,basis:explicit.length?'EXPLICIT':'HEADER_CANDIDATE'}));
  return {...item,categories,purchaseReview:{status,reason},openTarget,...(related.length?{relatedOrders:related}:{}),...(bucket.length>20?{relatedOrderCount:bucket.length}:related.length>1?{relatedOrderCount:related.length}:{})};
 });
 return {items:result,summary:{unposted:result.filter(item=>item.categories.includes('UNPOSTED_DOCUMENT')).length,uploadedAwaitingReview:result.filter(item=>item.categories.includes('UPLOADED_AWAITING_REVIEW')).length,purchaseLinkReview:result.filter(item=>item.categories.includes('PURCHASE_LINK_REVIEW')).length}};
}
