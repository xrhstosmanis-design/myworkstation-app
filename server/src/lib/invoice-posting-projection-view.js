import {invoiceNumberParts} from './invoice-common-draft.js';

const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const vat=value=>String(value||'').replace(/\D/g,'');
const amount=value=>{
 if(typeof value!=='string'||value.length>48||!/^\d{1,30}(?:\.\d{1,8})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
};
const index=(rows,key)=>{const result=new Map();for(const row of rows){const value=row[key],list=result.get(value)||[];list.push(row);result.set(value,list)}return result};
const unique=(rows,key)=>rows.get(key)?.length===1?rows.get(key)[0]:null;
const sameNumber=(left,right)=>{const a=invoiceNumberParts(left),b=invoiceNumberParts(right);return Boolean(a.number&&a.number===b.number&&a.series===b.series)};

/**
 * Ordinary read-only report view, never a writer or D1 source adapter.
 * Only a uniquely corroborated stock-posting projection inherits its original
 * invoice header. Recorded projection values remain available as provenance.
 * Caller supplies complete, authorized store facts, not a monthly subset.
 */
export function normalizePostingProjections(facts,{companyId,storeId}={}){
 if(!text(companyId)||!text(storeId))return {facts,projections:[]};
 const documents=index(facts.documents||[],'id'),orders=index(facts.orders||[],'id'),ordersBySource=index(facts.orders||[],'sourceDocumentId'),documentsByOrder=index(facts.documents||[],'purchaseOrderId');
 const postingsByOrder=index(facts.postings||[],'orderId'),postingsByTarget=index(facts.postings||[],'purchaseDocumentId');
 const stockByOrder=index(facts.stockPostings||[],'orderId'),stockBySource=index(facts.stockPostings||[],'sourceDocumentId'),stockByTarget=index(facts.stockPostings||[],'postedDocumentId');
 const inScope=row=>row&&['companyId','storeId'].every(key=>!Object.hasOwn(row,key)||row[key]===(key==='companyId'?companyId:storeId));
 const replacements=new Map(),projections=[];
 for(const order of facts.orders||[]){
  const source=unique(documents,order.sourceDocumentId),posting=unique(postingsByOrder,order.id),target=unique(documents,posting?.purchaseDocumentId),stock=unique(stockByOrder,order.id);
  if(![order,source,posting,target,stock].every(inScope)||!text(order.id)||unique(orders,order.id)!==order||!['INVOICED','FINAL'].includes(order.status)||
   (order.status==='FINAL'&&Object.hasOwn(order,'reopenVersion')&&order.reopenVersion!==0&&order.reopenVersion!=='0')||
   !text(source.id)||!text(target.id)||source.id===target.id||source.sourceType==='PURCHASE_ORDER'||!['DRAFT','APPROVED'].includes(source.status)||
   !['INVOICE','CREDIT_NOTE'].includes(source.documentType)||target.documentType!==source.documentType||target.status!=='APPROVED'||target.sourceType!=='PURCHASE_ORDER'||
   source.purchaseOrderId!==order.id||unique(ordersBySource,source.id)!==order||ordersBySource.has(target.id)||
   !(target.purchaseOrderId===order.id||target.purchaseOrderId==null&&target.id===order.id)||
   !text(source.supplierId)||source.supplierId!==order.supplierId||source.supplierId!==target.supplierId||
   !/^\d{9}$/.test(vat(source.supplierTaxId))||vat(source.supplierTaxId)!==vat(target.supplierTaxId)||
   !sameNumber(source.documentNumber,order.invoiceNumber)||!sameNumber(source.documentNumber,target.documentNumber)||
   !validDay(source.issueDay)||!validDay(target.issueDay)||
   unique(postingsByTarget,target.id)!==posting||postingsByTarget.has(source.id)||
   stock.path!=='PURCHASE_ORDER'||stock.sourceDocumentId!==source.id||stock.postedDocumentId!==target.id||
   unique(stockBySource,source.id)!==stock||unique(stockByTarget,target.id)!==stock||stockByTarget.has(source.id)||stockBySource.has(target.id)||
   (documentsByOrder.get(order.id)||[]).some(document=>document!==source&&document!==target))continue;
  const originalAmount=amount(source.totalGross),recordedAmount=amount(target.totalGross);
  if(originalAmount===null||recordedAmount===null||originalAmount<=0n||recordedAmount<=0n||
   (originalAmount>recordedAmount?originalAmount-recordedAmount:recordedAmount-originalAmount)>5000000n)continue;
  // Legacy FINAL orders can already have both posting receipts. A null target
  // backlink in the recorded id===order.id shape needs an effective backlink
  // for the unchanged classifier; the raw order status/document stay intact.
  const legacyFinal=order.status==='FINAL',effectivePurchaseOrderId=legacyFinal&&target.purchaseOrderId==null?order.id:target.purchaseOrderId;
  replacements.set(target.id,{...target,issueDay:source.issueDay,totalGross:source.totalGross,...(legacyFinal?{purchaseOrderId:effectivePurchaseOrderId}:{})});
  projections.push({sourceDocumentId:source.id,projectionDocumentId:target.id,sourceIssueDay:source.issueDay,sourceTotalGross:source.totalGross,recordedIssueDay:target.issueDay,recordedTotalGross:target.totalGross,
   ...(legacyFinal?{recordedOrderStatus:order.status,recordedPurchaseOrderId:target.purchaseOrderId??null,effectivePurchaseOrderId}:{})});
 }
 return {facts:replacements.size?{...facts,documents:facts.documents.map(document=>replacements.get(document.id)||document)}:facts,projections};
}

export function withPostingProjectionProvenance(items,projections){
 const byDocument=new Map();for(const projection of projections)for(const id of [projection.sourceDocumentId,projection.projectionDocumentId]){const list=byDocument.get(id)||[];list.push(projection);byDocument.set(id,list)}
 return items.map(item=>{
  const found=new Map();for(const source of item.sources||[])if(source.kind==='DOCUMENT')for(const projection of byDocument.get(source.id)||[])found.set(projection.projectionDocumentId,projection);
  return found.size?{...item,postingProjections:[...found.values()]}:item;
 });
}
