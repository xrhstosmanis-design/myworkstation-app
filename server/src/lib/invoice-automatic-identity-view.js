import {invoiceNumberParts} from './invoice-common-draft.js';

const duplicateReason='Πιθανό διπλό παραστατικό· απαιτείται σύγκριση των πρωτοτύπων.';
const activeDocuments=new Set(['DRAFT','APPROVED']);
const text=(value,max=160)=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const tax=value=>typeof value==='string'?value.replace(/\D/g,''):'';
const amount=value=>{
 if(typeof value!=='string'||value.length>48||!/^\d{1,30}(?:\.\d{1,8})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
};
const near=(a,b)=>a!==null&&b!==null&&a>0n&&b>0n&&(a>b?a-b:b-a)<=5000000n;
const roundedCents=value=>value===null?null:Number((value+500000n)/1000000n);
const index=(rows,key)=>{const found=new Map();for(const row of rows){const value=row?.[key],list=found.get(value)||[];list.push(row);found.set(value,list)}return found};
const unique=(map,key)=>map.get(key)?.length===1?map.get(key)[0]:null;
const parts=value=>text(value)?invoiceNumberParts(value):{series:'',number:''};
const numberKey=value=>{const p=parts(value);return p.number?JSON.stringify([p.series,p.number]):null};
const header=row=>{
 const number=numberKey(row?.documentNumber),vat=tax(row?.supplierTaxId);
 return row?.documentType==='INVOICE'&&number&&/^\d{9}$/.test(vat)&&day(row.issueDay)?JSON.stringify([vat,number,row.issueDay,'INVOICE']):null;
};
const inboundHeader=row=>({documentNumber:[row?.series,row?.documentNumber].filter(Boolean).join(' '),supplierTaxId:row?.issuerVat,issueDay:row?.issueDay,documentType:/^[123]\.\d+$/.test(row?.invoiceType||'')?'INVOICE':null,totalGross:row?.totalGross});
const cleanWarnings=item=>Array.isArray(item.categories)&&Array.isArray(item.reasons)&&item.categories.every(category=>['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','POSSIBLE_DUPLICATE'].includes(category))&&item.reasons.every(reason=>reason===duplicateReason)&&(!item.reasons.length||item.categories.includes('POSSIBLE_DUPLICATE'));

/**
 * Authorized ordinary-reader composition only. The caller supplies complete
 * scoped metadata, the proven posting normalizer's view and its provenance.
 * No persisted pointer, raw fact, payment identity, stock or D1 is changed.
 * A match joins one unclaimed myDATA representation to one complete existing
 * document family; it does not certify an orphan payment or approve a draft.
 */
export function composeAutomaticInvoiceIdentity(items,facts,{companyId,storeId,projections=[],linkMetadata=[],linkMetadataAvailable=false}={}){
 const matches=[],exceptions=[];
 const arrays=['documents','orders','inbound','inbox','jobs','attachments','aliases','postings','stockPostings'];
 if(!Array.isArray(items)||!text(companyId)||!text(storeId)||!Array.isArray(linkMetadata)||!Array.isArray(projections)||!arrays.every(key=>Array.isArray(facts?.[key])&&facts[key].every(row=>row&&typeof row==='object'&&!Array.isArray(row))))return {items,matches,exceptions};
 const scoped=row=>Boolean(row&&['companyId','storeId'].every(key=>!Object.hasOwn(row,key)||row[key]===(key==='companyId'?companyId:storeId)));
 const documents=index(facts.documents,'id'),orders=index(facts.orders,'id'),ordersBySource=index(facts.orders,'sourceDocumentId'),incoming=index(facts.inbound,'id'),inboxes=index(facts.inbox,'id'),inboundByInbox=index(facts.inbound,'inboxId'),inboundByMark=index(facts.inbound,'mark'),metadata=index(linkMetadata,'id'),attachments=index(facts.attachments,'id'),itemIds=index(items,'id'),projectionTargets=index(projections,'projectionDocumentId');
 const postingsByDocument=index(facts.postings,'purchaseDocumentId'),postingsByOrder=index(facts.postings,'orderId'),stockBySource=index(facts.stockPostings,'sourceDocumentId'),stockByTarget=index(facts.stockPostings,'postedDocumentId'),stockByOrder=index(facts.stockPostings,'orderId');
 const documentOwners=new Map(),inboundOwners=new Map(),documentsByNumber=new Map(),ordersByNumber=new Map(),incomingByHeader=new Map(),jobsByAttachment=index(facts.jobs,'attachmentId'),documentClaims=new Map(),orderClaims=new Map(),aliasDocumentIds=new Set(),aliasOrderIds=new Set(),aliasInboxIds=new Set();
 for(const alias of facts.aliases){aliasDocumentIds.add(alias.aliasDocumentId);aliasDocumentIds.add(alias.canonicalDocumentId);aliasOrderIds.add(alias.aliasOrderId);aliasOrderIds.add(alias.canonicalOrderId);aliasInboxIds.add(alias.inboxId)}
 const add=(map,key,row)=>{const list=map.get(key)||[];list.push(row);map.set(key,list)};
 for(const document of facts.documents)add(documentsByNumber,numberKey(document.documentNumber),document);
 for(const order of facts.orders)add(ordersByNumber,numberKey(order.invoiceNumber),order);
 for(const row of facts.inbound){
  add(incomingByHeader,header(inboundHeader(row)),row);const meta=unique(metadata,row.id),inbox=unique(inboxes,row.inboxId);
  for(const id of [meta?.draftDocumentId,meta?.commonDraftDocumentId])if(id!=null)add(documentClaims,id,row.id);
  for(const id of [row.draftOrderId,meta?.commonDraftOrderId])if(id!=null)add(orderClaims,id,row.id);
  if(inbox?.attachmentId!=null)for(const job of jobsByAttachment.get(inbox.attachmentId)||[])if(job.purchaseDocumentId!=null)add(documentClaims,job.purchaseDocumentId,row.id);
 }
 for(const item of items)for(const source of item.sources||[]){if(source.kind==='DOCUMENT')add(documentOwners,source.id,item);else if(source.kind==='MYDATA')add(inboundOwners,source.id,item)}
 const coverage=linkMetadataAvailable===true&&linkMetadata.length===facts.inbound.length&&facts.inbound.every(row=>{
  const meta=unique(metadata,row.id);return scoped(row)&&scoped(meta)&&typeof meta.identityLinksPresent==='boolean'&&typeof meta.currencyAllowed==='boolean'&&['draftDocumentId','commonDraftDocumentId','commonDraftOrderId'].every(key=>meta[key]==null||text(meta[key]));
 });
 const families=[],familiesByHeader=new Map();
 for(const item of items){
  if(!text(item.id,200)||unique(itemIds,item.id)!==item||!cleanWarnings(item)||item.documentType!=='INVOICE'||!['POSTED','UNPOSTED'].includes(item.status))continue;
  if(!Array.isArray(item.sources)||!item.sources.length||item.sources.some(source=>!['DOCUMENT','ORDER'].includes(source.kind)))continue;
  const sourceDocs=item.sources.filter(source=>source.kind==='DOCUMENT');
  const docs=sourceDocs.map(source=>unique(documents,source.id));
  if(!docs.length||docs.some((document,i)=>!scoped(document)||!text(document.id)||!activeDocuments.has(document.status)||sourceDocs[i].status!==document.status||documentOwners.get(document.id)?.length!==1))continue;
  const originals=docs.filter(document=>document.sourceType!=='PURCHASE_ORDER');if(originals.length!==1)continue;
  const original=originals[0],key=header(original),value=amount(original.totalGross),documentIds=new Set(docs.map(document=>document.id));
  if(!key||value===null||value<=0n||header(item)!==key||!Number.isSafeInteger(item.totalCents)||item.totalCents!==roundedCents(value)||!text(original.supplierId))continue;
  if(docs.some(document=>header(document)!==key||document.supplierId!==original.supplierId||!near(amount(document.totalGross),value)))continue;
  const ownedOrders=item.sources.filter(source=>source.kind==='ORDER'),order=unique(ordersBySource,original.id);
  if(original.purchaseOrderId==null){
   if(original.status!=='APPROVED'||docs.length!==1||ownedOrders.length||ordersBySource.has(original.id)||item.status!=='POSTED')continue;
  }else{
   if(!scoped(order)||!text(order.id)||unique(orders,order.id)!==order||order.id!==original.purchaseOrderId||order.supplierId!==original.supplierId||numberKey(order.invoiceNumber)!==numberKey(original.documentNumber)||ownedOrders.length!==1||ownedOrders[0].id!==order.id||ownedOrders[0].status!==order.status)continue;
   if(docs.length===1){if(original.status!=='DRAFT'||!['NEW','FINAL'].includes(order.status)||item.status!=='UNPOSTED')continue}
   else{
    if(!['INVOICED','FINAL'].includes(order.status)||item.status!=='POSTED')continue;
    let valid=true;
    for(const target of docs.filter(document=>document!==original)){
     const proof=unique(projectionTargets,target.id);
     if(!proof||order.status==='FINAL'&&(proof.recordedOrderStatus!=='FINAL'||proof.effectivePurchaseOrderId!==order.id)||proof.sourceDocumentId!==original.id||target.status!=='APPROVED'||proof.sourceIssueDay!==original.issueDay||proof.sourceTotalGross!==original.totalGross||target.issueDay!==original.issueDay||target.totalGross!==original.totalGross||
      !(target.purchaseOrderId===order.id||target.purchaseOrderId==null&&target.id===order.id))valid=false;
    }
    if(!valid)continue;
   }
  }
  const orderIds=new Set(ownedOrders.map(source=>source.id));
  const postingRows=new Set(),stockRows=new Set();
  for(const id of documentIds){for(const posting of postingsByDocument.get(id)||[])postingRows.add(posting);for(const stock of [...(stockBySource.get(id)||[]),...(stockByTarget.get(id)||[])])stockRows.add(stock)}
  for(const id of orderIds){for(const posting of postingsByOrder.get(id)||[])postingRows.add(posting);for(const stock of stockByOrder.get(id)||[])stockRows.add(stock)}
  if([...postingRows].some(posting=>!scoped(posting)||!orderIds.has(posting.orderId)||!documentIds.has(posting.purchaseDocumentId))||
   [...stockRows].some(stock=>!scoped(stock)||!documentIds.has(stock.sourceDocumentId)||!documentIds.has(stock.postedDocumentId)||stock.orderId!=null&&!orderIds.has(stock.orderId)||
    stockBySource.get(stock.sourceDocumentId)?.length!==1||stockByTarget.get(stock.postedDocumentId)?.length!==1))continue;

  if([...documentIds].some(id=>aliasDocumentIds.has(id))||[...orderIds].some(id=>aliasOrderIds.has(id)))continue;
  const family={item,original,documentIds,orderIds,key,value};families.push(family);const bucket=familiesByHeader.get(key)||[];bucket.push(family);familiesByHeader.set(key,bucket);
 }
 const usedFamilies=new Set(),removed=new Set(),replacements=new Map();
 for(const item of items){
  if(!Array.isArray(item.sources)||item.sources.length!==1||item.sources[0].kind!=='MYDATA')continue;
  const reject=code=>exceptions.push({itemId:item.id,code});
  if(!coverage){reject('LINK_METADATA_UNAVAILABLE');continue}
  const source=item.sources[0],row=unique(incoming,source.id),official=row&&inboundHeader(row),key=official&&header(official),value=row&&amount(row.totalGross),meta=row&&unique(metadata,row.id);
  if(!scoped(row)||!text(row?.id)||inboundOwners.get(row.id)?.length!==1||unique(itemIds,item.id)!==item||!key||!text(row.mark,30)||!/^\d+$/.test(row.mark)||!text(row.inboxId)||typeof row.series!=='string'||!text(row.documentNumber)||item.status!=='UNPOSTED'||!cleanWarnings(item)||header(item)!==key||!Number.isSafeInteger(item.totalCents)||item.totalCents!==roundedCents(value)){
   reject('INBOUND_IDENTITY_UNCONFIRMED');continue;
  }
  if(meta.currencyAllowed!==true){reject('UNSUPPORTED_CURRENCY');continue}
  if(meta.identityLinksPresent!==false||row.draftOrderId!=null||[meta.draftDocumentId,meta.commonDraftDocumentId,meta.commonDraftOrderId].some(value=>value!=null)){
   reject('EXISTING_OR_DANGLING_LINK');continue;
  }
  const inbox=unique(inboxes,row.inboxId);
  if(!scoped(inbox)||!['RECEIVED','IN_REVIEW'].includes(inbox.status)||unique(inboundByInbox,row.inboxId)!==row||unique(inboundByMark,row.mark)!==row||aliasInboxIds.has(row.inboxId)){
   reject('INBOX_OR_MARK_CONFLICT');continue;
  }
  const candidates=familiesByHeader.get(key)||[];
  if(candidates.length!==1){reject(candidates.length?'MULTIPLE_CANONICAL_FAMILIES':'NO_PROVEN_CANONICAL_FAMILY');continue}
  if(!near(value,candidates[0].value)){reject('CANONICAL_AMOUNT_MISMATCH');continue}
  const family=candidates[0],{original,documentIds,orderIds}=family;
  // The entire stored set competes, not just eligible/page-local candidates.
  // Invalid or inactive representations may not disappear to make a match unique.
  const competingDocument=(documentsByNumber.get(numberKey(original.documentNumber))||[]).some(document=>{
   if(documentIds.has(document.id))return documents.get(document.id)?.length!==1;
   const sameSupplier=tax(document.supplierTaxId)===tax(original.supplierTaxId)||document.supplierId===original.supplierId;
   return sameSupplier&&document.documentType!=='CREDIT_NOTE'&&numberKey(document.documentNumber)===numberKey(original.documentNumber)&&(!day(document.issueDay)||document.issueDay===original.issueDay);
  });
  const competingOrder=(ordersByNumber.get(numberKey(original.documentNumber))||[]).some(order=>!orderIds.has(order.id)&&(order.supplierId===original.supplierId||order.supplierId==null)&&numberKey(order.invoiceNumber)===numberKey(original.documentNumber)&&
   (!unique(documents,order.sourceDocumentId)||!day(unique(documents,order.sourceDocumentId).issueDay)||unique(documents,order.sourceDocumentId).issueDay===original.issueDay));
  const competingInbound=(incomingByHeader.get(key)||[]).some(peer=>peer!==row)||[...documentIds].some(id=>(documentClaims.get(id)||[]).some(peerId=>peerId!==row.id))||[...orderIds].some(id=>(orderClaims.get(id)||[]).some(peerId=>peerId!==row.id));
  if(competingDocument||competingOrder||competingInbound||usedFamilies.has(family.item.id)){
   reject('COMPETING_STORED_SOURCE');continue;
  }
  if(inbox.attachmentId!=null){
   const attachment=unique(attachments,inbox.attachmentId);
   const claimed=jobsByAttachment.get(inbox.attachmentId)||[];
   if(!scoped(attachment)||claimed.some(job=>!scoped(job)||job.purchaseDocumentId!=null&&!documentIds.has(job.purchaseDocumentId))){reject('ATTACHMENT_JOB_CONFLICT');continue}
  }
  const match={inboundId:row.id,inboxId:row.inboxId,mark:row.mark,canonicalItemId:family.item.id,canonicalDocumentId:original.id,canonicalOrderId:[...orderIds][0]||null,basis:'UNIQUE_STORED_IDENTITY',documentNumber:official.documentNumber,issueDay:row.issueDay,totalGross:row.totalGross,canonicalTotalGross:original.totalGross,supplierTaxId:tax(row.issuerVat),documentType:'INVOICE'};
  const seen=new Set(),sources=[...family.item.sources,...item.sources].filter(source=>{const id=JSON.stringify([source.kind,source.id]);if(seen.has(id))return false;seen.add(id);return true});
  replacements.set(family.item.id,{...family.item,sources,categories:family.item.categories.filter(category=>category!=='POSSIBLE_DUPLICATE'),reasons:family.item.reasons.filter(reason=>reason!==duplicateReason),automaticMatches:[...(family.item.automaticMatches||[]),match]});
  removed.add(item.id);usedFamilies.add(family.item.id);matches.push(match);
 }
 return {items:items.filter(item=>!removed.has(item.id)).map(item=>replacements.get(item.id)||item),matches,exceptions};
}
