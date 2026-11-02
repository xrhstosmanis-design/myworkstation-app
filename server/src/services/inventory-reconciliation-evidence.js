// Read projections only: these sources never authorize a stock posting.
const numeric=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const stamp=x=>x&&Number.isFinite(new Date(x).getTime())?new Date(x).toISOString():null;
const text=(x,max=500)=>typeof x==='string'?x.slice(0,max):null;
const round=x=>Math.round((x+Number.EPSILON)*10000)/10000;
const within=(at,w)=>at&&w&&new Date(at)>new Date(w.from)&&new Date(at)<=new Date(w.to);
const knownConsumption=new Set(['WASTE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION']);
const nonStockActions=new Set(['CART_ITEM_ADD','CART_QTY_CHANGE','CART_ITEM_REMOVE','CART_CANCEL','PRICE_CHANGE','PERMANENT_PRICE_CHANGE','AUDIENCE_DISCOUNT_SELECTED','HOLD_SAVE','HOLD_RESTORE','BARCODE_CHANGE','PRODUCT_CODE_CHANGE']);
const evidenceLimit=()=>{throw Object.assign(new Error('Οι συνδέσεις πηγών υπερβαίνουν το όριο ασφαλούς αναφοράς. Δεν εκδόθηκε μερικό αποτέλεσμα.'),{status:413,code:'INVENTORY_EVIDENCE_LIMIT'});};

export function buildInventorySourceEvidence({movements,sales=[],invoiceLines=[],postings=[],aliases=[],actions=[],operatorEvents=[],capabilities={},windows=[]}){
  const byWindow=new Map(windows.map(x=>[x.productId,x]));
  const output=movements.map(x=>({...x})),findings=new Map();
  const flag=(productId,code)=>{if(!findings.has(productId))findings.set(productId,new Set());findings.get(productId).add(code);};
  const evidenceSales=[],physicalBySource=new Map();
  const auditsBySale=new Map();for(const a of actions){if(!auditsBySale.has(a.saleId))auditsBySale.set(a.saleId,[]);auditsBySale.get(a.saleId).push(a);}
  for(const m of output){
    if(!physicalBySource.has(m.sourceId))physicalBySource.set(m.sourceId,[]);
    physicalBySource.get(m.sourceId).push(m);
  }
  const saleGroups=new Map();
  for(const s of sales){const key=JSON.stringify([s.saleId,s.productId]);if(!saleGroups.has(key))saleGroups.set(key,[]);saleGroups.get(key).push(s);}
  for(const lines of saleGroups.values()){
    const s=lines[0],window=byWindow.get(s.productId),existing=(physicalBySource.get(s.saleId)||[]).filter(m=>m.productId===s.productId&&['POS_SALE','POS_REVERSAL','SALE','SELF_CONSUMPTION','PRODUCT_DESTRUCTION','WASTE'].includes(m.sourceType));
    const relevant=within(s.createdAt,window)||within(s.occurredAt,window);
    const sourceFlag=code=>{if(relevant)flag(s.productId,code);};
    const quantity=lines.every(x=>numeric(x.quantity)!==null)?round(-lines.reduce((sum,x)=>sum+numeric(x.quantity),0)):null;
    const audits=auditsBySale.get(s.saleId)||[];
    const restoration=audits.filter(a=>['RETURN','CANCEL','RETURN_ITEMS'].includes(a.actionType)&&Array.isArray(a.details?.stockRestoredProductIds));
    const restored=restoration.some(a=>a.details.stockRestoredProductIds.includes(s.productId));
    const late=within(s.occurredAt,window)!==within(s.createdAt,window);
    const checks=[];
    if(late){checks.push('TRANSACTION_CROSSES_COUNT_TIME');sourceFlag('TRANSACTION_CROSSES_COUNT_TIME');}
    if(s.status!=='COMPLETED')checks.push('TRANSACTION_NOT_COMPLETED');
    if(quantity===null){checks.push('INVALID_TRANSACTION_QUANTITY');if(s.status==='COMPLETED')sourceFlag('INVALID_TRANSACTION_QUANTITY');}
    let disposition='CONTEXT_ONLY';
    if(existing.length){
      disposition='RECORDED_POSTINGS';
      if(s.status!=='COMPLETED'){checks.push('STOCK_POSTING_FOR_INCOMPLETE_TRANSACTION');sourceFlag('STOCK_POSTING_FOR_INCOMPLETE_TRANSACTION');}
      const total=existing.every(x=>numeric(x.quantity)!==null)?round(existing.reduce((sum,x)=>sum+numeric(x.quantity),0)):null;
      if(total!==quantity){checks.push('TRANSACTION_POSTING_QUANTITY_MISMATCH');sourceFlag('TRANSACTION_POSTING_QUANTITY_MISMATCH');}
      for(const m of existing){m.transactionId=s.saleId;m.transactionOccurredAt=stamp(s.occurredAt);m.transactionRecordedAt=stamp(s.createdAt);m.actorName=m.actorName||s.actorName||audits[0]?.actorName||null;m.actorId=m.actorId||s.actorId||audits[0]?.actorId||null;m.sourceLineIds=lines.map(x=>x.lineId);}
    }else if(s.status==='COMPLETED'&&quantity!==null){
      const consumption=knownConsumption.has(s.source)&&lines.every(x=>numeric(x.quantity)>0);
      const reversal=s.source==='POS_REVERSAL'&&restored&&lines.every(x=>numeric(x.quantity)<0);
      if(consumption||reversal){
        disposition='DERIVED_IMMUTABLE_TRANSACTION';
        for(const line of lines)output.push({id:`sale-line:${line.lineId}`,productId:line.productId,movementType:reversal?s.reversalKind==='CANCEL'?'CANCEL':'RETURN':s.source,
          quantity:-numeric(line.quantity),unitCost:null,sourceType:'SALE_LINE',sourceId:s.saleId,transactionId:s.saleId,sourceLineIds:[line.lineId],
          createdAt:s.createdAt,transactionOccurredAt:stamp(s.occurredAt),transactionRecordedAt:stamp(s.createdAt),physicalAt:late?null:stamp(s.occurredAt),
          actorName:s.actorName||audits[0]?.actorName||null,actorId:s.actorId||audits[0]?.actorId||null,sourceEvidenceIds:audits.map(x=>x.id),quantityBasis:reversal?'AUDITED_STOCK_RESTORATION':'COMPLETED_CONSUMPTION',note:'Ανάγνωση υπάρχουσας συναλλαγής, χωρίς νέα καταχώρηση αποθήκης.'});
      }else if(s.source==='POS_REVERSAL'&&restoration.length&&!restored){disposition='EXPLICIT_NON_STOCK_LINE';}
      else{checks.push('TRANSACTION_WITHOUT_VERIFIED_STOCK_EFFECT');sourceFlag('TRANSACTION_WITHOUT_VERIFIED_STOCK_EFFECT');}
    }
    evidenceSales.push({id:s.saleId,productId:s.productId,lineIds:lines.map(x=>x.lineId),source:s.source,status:s.status,quantity,
      lines:lines.map(x=>({id:x.lineId,quantity:numeric(x.quantity),unitPrice:numeric(x.unitPrice),discount:numeric(x.discount),lineTotal:numeric(x.lineTotal)})),
      occurredAt:stamp(s.occurredAt),recordedAt:stamp(s.createdAt),originalSaleId:s.originalSaleId||null,reversalKind:s.reversalKind||null,
      actorName:s.actorName||audits[0]?.actorName||null,actorId:s.actorId||audits[0]?.actorId||null,postingIds:existing.map(x=>x.id),auditIds:audits.map(x=>x.id),disposition,findings:checks});
  }
  const documents=new Map();
  const invoiceMovementIndex=new Map(),indexMovement=(key,m)=>{if(!key)return;if(!invoiceMovementIndex.has(key))invoiceMovementIndex.set(key,[]);invoiceMovementIndex.get(key).push(m);};
  for(const m of output){if(m.documentId)indexMovement(m.documentId,m);if(['PURCHASE_DOCUMENT','PURCHASE_ORDER','CREDIT_NOTE_APPROVAL','CREDIT_NOTE','INVOICE','SUPPLIER_RETURN'].includes(m.sourceType))indexMovement(m.sourceId,m);}
  for(const line of invoiceLines){if(!documents.has(line.documentId))documents.set(line.documentId,[]);documents.get(line.documentId).push(line);}
  const identities=new Map(),invoiceChecks=[];
  const aliasMap=new Map(aliases.map(x=>[x.aliasDocumentId,x])),receiptMap=new Map();
  for(const p of postings)for(const key of new Set([p.sourceDocumentId&&`D:${p.sourceDocumentId}`,p.postedDocumentId&&`D:${p.postedDocumentId}`,p.orderId&&`O:${p.orderId}`].filter(Boolean))){if(!receiptMap.has(key))receiptMap.set(key,[]);receiptMap.get(key).push(p);}
  for(const [id,lines]of documents){
    const d=lines[0],checks=[],productIds=[...new Set(lines.map(x=>x.productId).filter(Boolean))];
    const related=[...new Map([...(invoiceMovementIndex.get(id)||[]),...(invoiceMovementIndex.get(d.purchaseOrderId)||[]).filter(m=>m.sourceType==='PURCHASE_ORDER')].map(m=>[m.id,m])).values()];
    const receipts=[...new Set([...(receiptMap.get(`D:${id}`)||[]),...(receiptMap.get(`O:${d.purchaseOrderId}`)||[])])];
    const alias=aliasMap.get(id);
    const normalized=lines.map(l=>{
      const qty=numeric(l.quantity),factor=numeric(l.unitsPerPackage),pack=l.unit==='PACKAGE';
      const baseQuantity=qty===null||pack&&!(factor>0)?null:round(qty*(pack?factor:1));
      const flags=[];
      if(baseQuantity===null)flags.push('INVALID_PACKAGE_CONVERSION');
      if(!l.productId)flags.push('UNMAPPED_PRODUCT');
      if(qty>0&&numeric(l.netAmount)===0)flags.push('GIFT_OR_FREE_LINE');
      return {id:l.lineId,productId:l.productId||null,quantity:qty,unit:l.unit,unitsPerPackage:factor,baseQuantity,unitCost:numeric(l.unitCost),netAmount:numeric(l.netAmount),findings:flags};
    });
    for(const l of normalized)for(const f of l.findings)if(f!=='GIFT_OR_FREE_LINE'&&!checks.includes(f))checks.push(f);
    const normalizedByProduct=new Map(),stockByProduct=new Map();
    for(const l of normalized){if(!normalizedByProduct.has(l.productId))normalizedByProduct.set(l.productId,[]);normalizedByProduct.get(l.productId).push(l);}
    for(const m of related){if(!stockByProduct.has(m.productId))stockByProduct.set(m.productId,[]);stockByProduct.get(m.productId).push(m);}
    for(const productId of productIds){
      const documentRows=normalizedByProduct.get(productId),stockRows=stockByProduct.get(productId)||[];
      const relevant=stockRows.some(m=>within(m.createdAt,byWindow.get(productId)));
      if(documentRows.some(x=>x.baseQuantity===null)){if(relevant)flag(productId,'INVOICE_QUANTITY_CHECK_UNRESOLVED');continue;}
      if(stockRows.length&&d.status==='APPROVED'){
        const expected=round(documentRows.reduce((sum,x)=>sum+x.baseQuantity,0)*(d.documentType==='CREDIT_NOTE'?-1:1));
        const actual=stockRows.every(x=>numeric(x.quantity)!==null)?round(stockRows.reduce((sum,x)=>sum+numeric(x.quantity),0)):null;
        if(actual!==expected){checks.push('INVOICE_POSTING_QUANTITY_MISMATCH');if(relevant)flag(productId,'INVOICE_QUANTITY_CHECK_UNRESOLVED');}
      }
    }
    if(!['APPROVED','MERGED'].includes(d.status))checks.push('UNPOSTED_OR_CANCELLED_DOCUMENT');
    if(alias)checks.push('CANONICAL_DOCUMENT_ALIAS');
    if(receipts.length>1)checks.push('MULTIPLE_INVOICE_POSTING_RECEIPTS');
    if(d.documentType==='CREDIT_NOTE'&&!normalized.some(x=>x.productId&&x.baseQuantity>0))checks.push('VALUE_CREDIT_NO_MERCHANDISE_QUANTITY');
    if(d.documentType==='CREDIT_NOTE'&&related.length&&!normalized.some(x=>x.productId&&x.baseQuantity>0))checks.push('VALUE_CREDIT_WITH_STOCK_POSTING_REQUIRES_REVIEW');
    if(['CANCELLED','VOID','MERGED'].includes(d.status)&&related.length)checks.push('INACTIVE_DOCUMENT_HAS_STOCK_POSTING');
    for(const productId of productIds){const w=byWindow.get(productId);if(w&&new Date(d.documentDate)<new Date(w.from)&&related.some(m=>m.productId===productId&&within(m.createdAt,w))){checks.push('LATE_DOCUMENT_PHYSICAL_TIME_UNKNOWN');flag(productId,'LATE_DOCUMENT_PHYSICAL_TIME_UNKNOWN');}}
    const identity=d.documentNumber&&d.supplierId&&stamp(d.documentDate)?JSON.stringify([d.supplierVat||d.supplierId,d.documentType,String(d.documentNumber).trim().toLocaleUpperCase('el-GR'),stamp(d.documentDate).slice(0,10)]):null;
    if(identity){if(!identities.has(identity))identities.set(identity,[]);identities.get(identity).push(id);}else checks.push('INVOICE_IDENTITY_INCOMPLETE');
    invoiceChecks.push({id,documentNumber:d.documentNumber||null,documentType:d.documentType,status:d.status,sourceType:d.sourceType,supplierId:d.supplierId||null,supplierName:d.supplierName||null,
      issueDate:stamp(d.documentDate),recordedAt:stamp(d.createdAt),lastChangedAt:stamp(d.updatedAt),purchaseOrderId:d.purchaseOrderId||null,
      canonicalDocumentId:alias?.canonicalDocumentId||null,postingIds:receipts.map(x=>x.sourceDocumentId),movementIds:related.map(x=>x.id),productIds,lines:normalized,findings:[...new Set(checks)]});
  }
  const invoiceMap=new Map(invoiceChecks.map(x=>[x.id,x]));
  for(const ids of identities.values())if(ids.length>1){
    const active=ids.filter(id=>!aliasMap.has(id)&&!['CANCELLED','VOID','MERGED'].includes(documents.get(id)[0].status));
    if(active.length>100)evidenceLimit();
    if(active.length>1)for(const id of active){const row=invoiceMap.get(id);row.findings.push('POSSIBLE_DUPLICATE_INVOICE_IDENTITY');row.matchingDocumentIds=active.filter(x=>x!==id);}
  }
  const transactionsById=new Map();for(const s of evidenceSales){if(!transactionsById.has(s.id))transactionsById.set(s.id,[]);transactionsById.get(s.id).push(s);}
  let edgeBudget=0;
  const systemEvents=[...actions.map(x=>({...x,eventType:x.actionType,origin:'POS_ACTION'})),...operatorEvents.map(x=>({...x,origin:x.origin||'STORE_AUDIT'}))].map(e=>{
    const details=e.details||{},ids=new Set([e.productId,details.productId,details.sourceProductId,details.targetProductId,...(Array.isArray(details.productIds)?details.productIds:[]),...(Array.isArray(details.items)?details.items.map(x=>x.productId):[])].filter(x=>typeof x==='string'&&byWindow.has(x)));
    const saleId=e.saleId||details.saleId||null;
    const linked=[...(transactionsById.get(saleId)||[]),...(transactionsById.get(details.reversalSaleId)||[])];
    edgeBudget+=ids.size+linked.reduce((sum,s)=>sum+s.postingIds.length,0);if(edgeBudget>100000)evidenceLimit();
    return {id:e.id,origin:e.origin,eventType:e.eventType,productIds:[...ids],saleId,relatedSaleId:e.relatedSaleId||details.reversalSaleId||null,
      recordedAt:stamp(e.createdAt),actorName:text(e.actorName||details.actorName,200),actorId:text(e.actorId,160),reason:text(e.reason||details.reason),
      stockImpact:nonStockActions.has(e.eventType)||e.origin==='PRICE_HISTORY'||e.eventType==='PRODUCT_BARCODE_TRANSFERRED'?'NONE':'TRANSACTION_EVIDENCE_ONLY',
      movementIds:[...new Set(linked.flatMap(x=>x.postingIds))],
      changes:{oldPrice:numeric(details.oldPrice),newPrice:numeric(details.newPrice),quantity:numeric(details.quantity),discount:numeric(details.discount),oldCode:text(details.oldCode,120),newCode:text(details.newCode,120),oldBarcode:text(details.oldBarcode,120),newBarcode:text(details.newBarcode||details.barcode,120)}};
  }).filter(e=>e.productIds.length||transactionsById.has(e.saleId)||transactionsById.has(e.relatedSaleId)).sort((a,b)=>(a.recordedAt||'').localeCompare(b.recordedAt||'')||a.id.localeCompare(b.id));
  const coverage={...capabilities,invoiceOriginalsVerified:false,historicalStockEligibilityComplete:false,physicalReceiptTimesAvailable:false};
  const result={movements:output,sourceFindings:Object.fromEntries([...findings].map(([id,codes])=>[id,[...codes]])),
    evidence:{transactions:evidenceSales,invoices:invoiceChecks,systemEvents,coverage,checkedCounts:{transactions:evidenceSales.length,invoices:invoiceChecks.length,invoiceLines:invoiceLines.length,systemEvents:systemEvents.length},
      explanation:'Αναγνωστική διασταύρωση αποθηκευμένων πηγών. Δεν αποτελεί έλεγχο του φυσικού πρωτοτύπου ή αυτόματη επιβεβαίωση απώλειας. Τα συμβάντα καλαθιού και τιμών δεν προστίθενται ως κίνηση εμπορεύματος.'}};
  if(Buffer.byteLength(JSON.stringify(result.evidence),'utf8')>8*1024*1024)evidenceLimit();return result;
}
