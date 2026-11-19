import {invoiceNumberParts} from './invoice-common-draft.js';

const active=new Set(['DRAFT','APPROVED']),mime='application/vnd.myworkstation.purchase-document';
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);
const vat=value=>String(value||'').replace(/\D/g,'');
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const cents=value=>{
 if(typeof value!=='string'||value.length>48||!/^\-?\d+(?:\.\d+)?$/.test(value))return null;
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');if(fraction.slice(2).replace(/0/g,''))return null;
 const result=(BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2)))*(negative?-1n:1n);return result<=BigInt(Number.MAX_SAFE_INTEGER)&&result>=BigInt(Number.MIN_SAFE_INTEGER)?Number(result):null;
};
const index=(rows,key)=>{const map=new Map();for(const row of rows||[]){const list=map.get(row[key])||[];list.push(row);map.set(row[key],list)}return map};
const unique=(map,key)=>map.get(key)?.length===1?map.get(key)[0]:null;
const sameNumber=(a,b)=>{const x=invoiceNumberParts(a),y=invoiceNumberParts(b);return Boolean(x.number&&x.number===y.number&&x.series===y.series)};
const sameSet=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&a.every(value=>text(value)&&b.includes(value));

// The first canonical-merge writer saved its locked pair in details.before,
// before paymentBefore existed. Recover only that complete, explicitly scoped
// pair audit. A present but malformed modern field must never fall back here.
function legacyPaymentBefore(receipt,{source,order,actualAliases,transaction,companyId,storeId}){
 const rows=receipt.legacyBefore;
 if(receipt.paymentBeforeFieldPresent!==false||receipt.paymentBefore!=null||receipt.legacyBeforeValid!==true||!Array.isArray(rows)||!rows.length||rows.length>20||rows.length!==actualAliases.length+1)return null;
 const expected=new Map([[order.id,source.id],...actualAliases.map(alias=>[alias.aliasOrderId,alias.aliasDocumentId])]);
 const orderIds=new Set(),documentIds=new Set();let paid=null;
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||!text(row.orderId)||!text(row.documentId)||expected.get(row.orderId)!==row.documentId||orderIds.has(row.orderId)||documentIds.has(row.documentId)||
   row.paymentTransactionIdPresent!==true||row.reversedAtPresent!==true||row.reversedAt!==null||
   (row.companyId!=null&&row.companyId!==companyId)||(row.storeId!=null&&row.storeId!==storeId))return null;
  orderIds.add(row.orderId);documentIds.add(row.documentId);
  if(row.paymentTransactionId===null){
   if(row.orderId===order.id||['paymentAmount','paymentStoreId','paymentSupplierId','paymentType','paymentTaxId'].some(field=>!Object.hasOwn(row,field)||row[field]!==null))return null;
   continue;
  }
  if(paid||row.orderId!==order.id||row.documentId!==source.id||row.paymentTransactionId!==transaction.id||row.paymentStoreId!==storeId||row.paymentSupplierId!==source.supplierId||row.supplierId!==source.supplierId||
   (row.documentSupplierId!=null&&row.documentSupplierId!==source.supplierId)||row.paymentType!=='SUPPLIER_PAYMENT'||cents(row.paymentAmount)!==cents(transaction.amount)||
   vat(row.taxId)!==vat(source.supplierTaxId)||vat(row.paymentTaxId)!==vat(source.supplierTaxId))return null;
  if(row.paymentInvoiceNumberPresent===true){if(row.paymentInvoiceNumber!==transaction.invoiceDocumentNumber)return null}
  else if(row.paymentInvoiceNumberPresent!==false||row.paymentInvoiceNumber!=null||!text(row.invoiceNumber)||row.invoiceNumber!==transaction.invoiceDocumentNumber||row.documentNumber!==transaction.invoiceDocumentNumber)return null;
  paid=row;
 }
 return paid?{id:paid.paymentTransactionId,companyId,storeId:paid.paymentStoreId,supplierId:paid.paymentSupplierId,type:paid.paymentType,amount:paid.paymentAmount,invoiceDocumentNumber:transaction.invoiceDocumentNumber,reversedAt:null}:null;
}

/**
 * Restore only a number interpretation already supported by a completed,
 * unchanged canonical-merge payment receipt. This never discovers orphan
 * payments, changes money, writes a pointer, or changes the payment observer.
 */
export function normalizeCanonicalPaymentObservations(items,facts,transactions,receipts,{companyId,storeId,allocationsAvailable=false}={}){
 const unchanged=()=>({transactions,proofs:[]});
 if(!text(companyId)||!text(storeId)||allocationsAvailable!==true||!Array.isArray(facts.paymentAllocations)||!Array.isArray(receipts)||!receipts.length)return unchanged();
 const scoped=row=>row&&['companyId','storeId'].every(key=>!Object.hasOwn(row,key)||row[key]===(key==='companyId'?companyId:storeId));
 const docs=index(facts.documents,'id'),orders=index(facts.orders,'id'),txs=index(transactions,'id'),aliases=index(facts.aliases,'aliasOrderId'),receiptAliases=index(receipts,'aliasOrderId');
 const aliasesByOrder=index(facts.aliases,'canonicalOrderId'),aliasesByDocument=index(facts.aliases,'canonicalDocumentId'),officialByMark=index(facts.inbound,'mark'),officialByInbox=index(facts.inbound,'inboxId'),inboxes=index(facts.inbox,'id');
 const allocationByTransaction=index(facts.paymentAllocations,'transactionId'),allocationByDocument=index(facts.paymentAllocations,'documentId'),itemsByDocument=new Map(),claimsByPayment=new Map(),attachedByDocument=new Map();
 for(const item of items)for(const source of item.sources||[])if(source.kind==='DOCUMENT'){const list=itemsByDocument.get(source.id)||[];list.push(item);itemsByDocument.set(source.id,list)}
 for(const document of facts.documents||[])if(active.has(document.status)&&text(document.paymentTransactionId)){const list=claimsByPayment.get(document.paymentTransactionId)||[];list.push(document.id);claimsByPayment.set(document.paymentTransactionId,list)}
 for(const transaction of transactions)if(transaction.attachmentMimeType===mime){const list=attachedByDocument.get(transaction.attachmentFilename)||[];list.push(transaction.id);attachedByDocument.set(transaction.attachmentFilename,list)}
 const families=new Map(),transactionFamilies=new Map();
 for(const receipt of receipts){
  const key=JSON.stringify([receipt.canonicalOrderId,receipt.canonicalDocumentId,receipt.inboxId,receipt.mark]),list=families.get(key)||[];list.push(receipt);families.set(key,list);
  if(text(receipt.paymentTransactionId)){const keys=transactionFamilies.get(receipt.paymentTransactionId)||new Set();keys.add(key);transactionFamilies.set(receipt.paymentTransactionId,keys)}
 }
 const replacements=new Map(),proofs=[];
 for(const family of families.values()){
  if(family.length>20)continue;
  const receipt=family[0],source=unique(docs,receipt.canonicalDocumentId),order=unique(orders,receipt.canonicalOrderId),transaction=unique(txs,receipt.paymentTransactionId);
  if(![source,order,transaction].every(scoped)||!text(receipt.mark)||!text(receipt.inboxId)||!text(receipt.paymentTransactionId)||transactionFamilies.get(receipt.paymentTransactionId)?.size!==1||
   !text(source.id)||!text(order.id)||!active.has(source.status)||source.sourceType==='PURCHASE_ORDER'||source.documentType!=='INVOICE'||
   !['NEW','FINAL','INVOICED'].includes(order.status)||source.purchaseOrderId!==order.id||order.sourceDocumentId!==source.id||
   !text(source.supplierId)||source.supplierId!==order.supplierId||source.paymentTransactionId!==transaction.id||!sameNumber(source.documentNumber,order.invoiceNumber)||
   !day(source.issueDay)||!/^\d{9}$/.test(vat(source.supplierTaxId)))continue;
  const matchingItems=itemsByDocument.get(source.id)||[];
  if(matchingItems.length!==1)continue;
  const item=matchingItems[0],documentSources=item.sources.filter(row=>row.kind==='DOCUMENT'),orderSources=item.sources.filter(row=>row.kind==='ORDER'),documentIds=documentSources.map(row=>row.id),orderIds=orderSources.map(row=>row.id);
  const invoiceCents=cents(source.totalGross),paidCents=cents(transaction.amount);
  if(item.documentType!=='INVOICE'||item.issueDay!==source.issueDay||item.totalCents!==invoiceCents||!sameNumber(item.documentNumber,source.documentNumber)||vat(item.supplierTaxId)!==vat(source.supplierTaxId)||
   item.categories.some(category=>['IDENTITY_OR_LINK_REVIEW','POSSIBLE_DUPLICATE'].includes(category))||new Set(documentIds).size!==documentIds.length||new Set(orderIds).size!==orderIds.length||!orderIds.includes(order.id)||
   invoiceCents===null||invoiceCents<=0||paidCents===null||paidCents<=0||transaction.type!=='SUPPLIER_PAYMENT'||transaction.companyId!==companyId||transaction.storeId!==storeId||transaction.supplierId!==source.supplierId||
   transaction.reversedAt!==null||transaction.settlementConfirmed!==true||transaction.settlementScopeValid!==true||transaction.hasSettlement!==false||transaction.settlementCount!==0||!text(transaction.invoiceDocumentNumber)||
   (transaction.attachmentMimeType===mime&&!documentIds.includes(transaction.attachmentFilename)))continue;
  const difference=paidCents-invoiceCents,needsReview=Math.abs(difference)>5;
  const documentIdSet=new Set(documentIds);
  if(allocationByTransaction.has(transaction.id)||documentIds.some(id=>allocationByDocument.has(id))||
   (claimsByPayment.get(transaction.id)||[]).some(id=>!documentIdSet.has(id))||
   orderSources.some(row=>{const current=unique(orders,row.id);return !current||!scoped(current)||current.status!==row.status})||
   documentSources.some(row=>{const document=unique(docs,row.id);return !document||!scoped(document)||document.status!==row.status||
    (text(document.paymentTransactionId)&&document.paymentTransactionId!==transaction.id)||
    (active.has(document.status)&&(document.documentType!=='INVOICE'||document.supplierId!==source.supplierId||!sameNumber(document.documentNumber,source.documentNumber)||document.issueDay!==source.issueDay||cents(document.totalGross)!==invoiceCents))})||
   documentIds.some(id=>(attachedByDocument.get(id)||[]).some(attached=>attached!==transaction.id)))continue;
  const actualAliases=aliasesByOrder.get(order.id)||[],documentAliases=aliasesByDocument.get(source.id)||[];
  if(!actualAliases.length||actualAliases.length!==family.length||documentAliases.length!==family.length||actualAliases.some(alias=>alias.canonicalDocumentId!==source.id)||documentAliases.some(alias=>alias.canonicalOrderId!==order.id))continue;
  const aliasOrderIds=actualAliases.map(alias=>alias.aliasOrderId);if(new Set(aliasOrderIds).size!==aliasOrderIds.length)continue;
  const incoming=[...new Set([...(officialByMark.get(receipt.mark)||[]),...(officialByInbox.get(receipt.inboxId)||[])])];
  if(incoming.length!==1)continue;
  const official=incoming[0],officialNumber=[official.series,official.documentNumber].filter(Boolean).join(' '),inbox=inboxes.get(receipt.inboxId)||[];
  if(!scoped(official)||official.currencyAllowed!==true||!text(official.id)||official.inboxId!==receipt.inboxId||String(official.mark)!==String(receipt.mark)||!/^([123])\.\d+$/.test(String(official.invoiceType))||
   vat(official.issuerVat)!==vat(source.supplierTaxId)||official.issueDay!==source.issueDay||cents(official.totalGross)!==invoiceCents||!sameNumber(officialNumber,source.documentNumber)||
   !item.sources.some(row=>row.kind==='MYDATA'&&row.id===official.id)||inbox.length!==1||!scoped(inbox[0])||['CANCELLED','DELETED','REJECTED','REVERSED'].includes(inbox[0].status))continue;
  let valid=true,usedLegacy=false;
  for(const row of family){
   const alias=unique(aliases,row.aliasOrderId),aliasOrder=unique(orders,row.aliasOrderId),aliasDocument=unique(docs,row.aliasDocumentId);
   const legacy=row.paymentBefore==null?legacyPaymentBefore(row,{source,order,actualAliases,transaction,companyId,storeId}):null,before=row.paymentBefore||legacy;
   if(legacy)usedLegacy=true;
   if(row.companyId!==companyId||row.storeId!==storeId||!text(row.aliasOrderId)||!text(row.aliasDocumentId)||receiptAliases.get(row.aliasOrderId)?.length!==1||
    (row.paymentBefore!=null&&Object.hasOwn(row,'paymentBeforeFieldPresent')&&row.paymentBeforeFieldPresent!==true)||
    row.completed!==true||row.auditOrderId!==order.id||row.auditDocumentId!==source.id||row.auditInboxId!==receipt.inboxId||String(row.auditMark)!==String(receipt.mark)||
    !sameSet(row.auditAliasOrderIds,aliasOrderIds)||row.paymentTransactionId!==transaction.id||cents(row.paymentDifference)!==difference||row.requiresPaymentReview!==needsReview||
    (!legacy&&row.beforeReversedAtPresent!==true)||!before||!Object.hasOwn(before,'reversedAt')||before.reversedAt!==null||
    ['id','companyId','storeId','supplierId','type','invoiceDocumentNumber'].some(field=>before[field]!==transaction[field])||cents(before.amount)!==paidCents||
    ![alias,aliasOrder,aliasDocument].every(scoped)||alias.canonicalOrderId!==order.id||alias.canonicalDocumentId!==source.id||alias.inboxId!==receipt.inboxId||String(alias.mark)!==String(receipt.mark)||
    alias.aliasDocumentId!==row.aliasDocumentId||alias.completed!==true||alias.auditOrderId!==order.id||alias.auditDocumentId!==source.id||alias.auditInboxId!==receipt.inboxId||String(alias.auditMark)!==String(receipt.mark)||!sameSet(alias.auditAliasOrderIds,aliasOrderIds)||
    aliasOrder.status!=='MERGED'||aliasDocument.status!=='MERGED'||aliasOrder.sourceDocumentId!==aliasDocument.id||aliasDocument.purchaseOrderId!==aliasOrder.id||
    !documentIds.includes(aliasDocument.id)||!orderIds.includes(aliasOrder.id)||aliasOrder.id===order.id||aliasDocument.id===source.id)valid=false;
  }
  if(!valid||sameNumber(transaction.invoiceDocumentNumber,source.documentNumber))continue;
  replacements.set(transaction.id,{...transaction,invoiceDocumentNumber:source.documentNumber});
  proofs.push({itemId:item.id,transactionId:transaction.id,canonicalDocumentId:source.id,canonicalOrderId:order.id,inboxId:receipt.inboxId,mark:String(receipt.mark),recordedInvoiceDocumentNumber:transaction.invoiceDocumentNumber,effectiveInvoiceDocumentNumber:source.documentNumber,paidCents,invoiceCents,paymentDifferenceCents:difference,requiresPaymentReview:needsReview,...(usedLegacy?{receiptBasis:'LEGACY_BEFORE_PAIR'}:{})});
 }
 return {transactions:replacements.size?transactions.map(transaction=>replacements.get(transaction.id)||transaction):transactions,proofs};
}
