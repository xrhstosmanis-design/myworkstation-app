import test from 'node:test';
import assert from 'node:assert/strict';
import * as reconciliation from '../src/lib/invoice-common-draft.js';

// Synthetic query responses exercise the real preview, proof and reconciliation
// functions. They do NOT stand in for the native PostgreSQL preservation tests.
function fixture(){
 const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
 const common={completed:true,orderId:'root',documentId:'d-root',inboxId:'inbox',mark:'synthetic',aliasOrderIds:['old'],paymentTransactionId:'negative'};
 const row={...scope,mark:'synthetic',invoiceType:'5.1',issuerVat:'099999999',series:'CN',documentNumber:'40',issueDate:'2026-10-12',totalGross:7,attachmentId:'pdf',mimeType:'application/pdf',jobDocumentId:'d-root',rawPayload:{mydataDraftOrderId:'root',mydataDraftDocumentId:'d-root',commonDraft:common}};
 const root={...scope,orderId:'root',documentId:'d-root',status:'NEW',documentStatus:'DRAFT',documentType:'CREDIT_NOTE',invoiceNumber:'CN 0040',documentNumber:'CN 0040',documentDate:row.issueDate,totalGross:7,supplierId:'sup',documentSupplierId:'sup',taxId:row.issuerVat,settlementMode:'PAID',lineCount:1,paymentTransactionId:'negative',paymentAmount:-7,paymentType:'SUPPLIER_PAYMENT',paymentStoreId:'s',paymentTaxId:row.issuerVat,paymentSupplierId:'sup',paymentInvoiceNumber:'CN 0040',reversedAt:null,isMyData:true,exact:true,headerReviewRequired:false,supplierReviewRequired:false,creditPaymentVerified:true,creditProofVersion:'a'.repeat(64)};
 const extra={...root,orderId:'third',documentId:'d-third',invoiceNumber:'OCR 00040',documentNumber:'OCR 00040',settlementMode:'CREDIT',paymentTransactionId:null,paymentAmount:null,paymentType:null,paymentStoreId:null,paymentTaxId:null,paymentSupplierId:null,paymentInvoiceNumber:null,isMyData:false,exact:false,headerReviewRequired:true,creditPaymentVerified:false,creditProofVersion:null};
 const payment={id:'negative',companyId:'c',storeId:'s',supplierId:'sup',type:'SUPPLIER_PAYMENT',amount:-7,reversedAt:null,invoiceDocumentNumber:'CN 0040',attachmentFilename:'d-root',sessionId:'shift',subtractFromShift:true,paymentMethod:'CASH_SHIFT',actorId:'operator'};
 const document={id:'d-root',companyId:'c',storeId:'s',supplierId:'sup',purchaseOrderId:'root',documentType:'CREDIT_NOTE',documentNumber:'CN 0040',documentDate:row.issueDate,totalGross:7,status:'DRAFT',settlementMode:'PAID'};
 const result={ok:true,transactionId:'negative',creditDocumentId:'d-root',mode:'CASH_RETURN',creditAmount:7,negativePaymentAmount:-7,invoicePaymentId:null};
 const audit={id:'audit',actorId:'operator',details:{...result,supplierId:'sup',creditDocumentNumber:'CN 0040',invoiceGrossPayment:null,previousAppliedAmount:0,confirmOriginal:true,sessionId:'shift',idempotencyKey:'key',requestHash:'hash',result:{...result}}};
 const alias={aliasOrderId:'old',aliasDocumentId:'d-old',companyId:'c',storeId:'s',canonicalOrderId:'root',canonicalDocumentId:'d-root',inboxId:'inbox',mark:'synthetic',aliasOrderStatus:'MERGED',aliasDocumentStatus:'MERGED',aliasOrderDocumentId:'d-old',aliasDocumentOrderId:'old',aliasOrderPosted:false,aliasStockPosted:false,details:structuredClone(common)};
 const f={scope,row,root,extra,payment,document,audit,alias,writes:[],queries:[],afterLocks:null};
 const copy=value=>structuredClone(value);
 f.db={
  async $queryRaw(strings,...values){
   const sql=strings.join('?');f.queries.push(sql);
   if(sql.includes('pg_advisory_xact_lock'))return [{locked:true}];
   if(sql.includes('SELECT m.*,i.'))return [copy(row)];
   if(sql.includes('SELECT * FROM "InvoiceDraftAlias"'))return [];
   if(sql.includes('jsonb_agg(to_jsonb(l)'))return [];
   if(sql.includes('SELECT o."id" AS "orderId"'))return copy([root,extra]);
   if(sql.includes('to_regclass'))return [{auditExists:true}];
   if(sql.includes('row_to_json(d) AS "document"'))return copy([{payment,document}]);
   if(sql.includes('row_to_json(a) AS "audit"'))return copy([{audit}]);
   if(sql.includes('SELECT "id","name","taxId"'))return [{id:'sup',taxId:row.issuerVat,name:'Synthetic'}];
   if(sql.includes('SELECT row_to_json(l)'))return [{row:{id:'line',orderId:'root',quantity:1,grossAmount:7}}];
   if(sql.includes('SELECT DISTINCT a.'))return [];
   if(sql.includes('SELECT "id" FROM "StoreTransaction"')&&sql.includes('FOR UPDATE')){f.afterLocks?.();return [{id:'negative'}]}
   if(sql.includes('SELECT "id" FROM "PurchaseOrder"')||sql.includes('SELECT "id" FROM "PurchaseDocument"'))return [];
   if(sql.includes('SELECT "id","purchaseOrderId","sourceType"'))return [{id:'d-root',purchaseOrderId:'root',sourceType:'POS_OCR_DRAFT'},{id:'d-third',purchaseOrderId:'third',sourceType:'POS_OCR_DRAFT'}];
   if(sql.includes('SELECT a.*,o.'))return copy([alias]);
   if(sql.includes('FROM "PurchaseOrderPosting"')||sql.includes('FROM "InvoiceStockPosting"'))return [];
   if(sql.includes('SELECT j."id",j."attachmentId"'))return [{id:'job',attachmentId:'pdf',purchaseDocumentId:'d-root',mimeType:'application/pdf',resultJson:{},createdAt:'2026-10-12T00:00:00Z'}];
   if(sql.includes('SELECT row_to_json(t) AS "row"'))return copy([{row:payment}]);
   throw Error('Unexpected query: '+sql);
  },
  async $executeRaw(strings,...values){
   const sql=strings.join('?');
   assert.doesNotMatch(sql,/"(?:StoreTransaction|StoreOperatorAudit|SupplierPaymentSettlement|SupplierPaymentAllocation|StockMovement|StoreProduct)"/);
   f.writes.push({sql,values});return 1;
  }
 };
 f.input=preview=>({posOrderId:'third',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:'synthetic',confirmHeaderCorrection:true,selectedRowsOrderId:'root',reason:'Compared the originals: only the unpaid extra series is wrong'});
 return f;
}

test('series-only capability is read-only and limited to the established paid root plus an unpaid extra',()=>{
 const f=fixture(),before=JSON.stringify([f.row,f.root,f.extra]);
 assert.equal(reconciliation.canReviewAdditionalCreditSeries(f.row,f.root,f.extra),true);
 assert.equal(JSON.stringify([f.row,f.root,f.extra]),before);
 for(const invoiceNumber of ['OCR 40','OCR 00000040'])assert.equal(reconciliation.canReviewAdditionalCreditSeries(f.row,f.root,{...f.extra,invoiceNumber}),true);
});
const denied={
 'different store':f=>f.extra.storeId='other',
 'different company':f=>f.extra.companyId='other',
 'different supplier':f=>f.extra.supplierId='other',
 'document supplier drift':f=>f.extra.documentSupplierId='other',
 'different VAT':f=>f.extra.taxId='088888888',
 'different issue day':f=>f.extra.documentDate='2026-10-13',
 'missing issue date':f=>f.extra.documentDate=null,
 'invalid issue date':f=>f.extra.documentDate='invalid',
 'one cent difference':f=>f.extra.totalGross=7.01,
 'subcent total':f=>f.extra.totalGross=7.001,
 'unknown total':f=>f.extra.totalGross=NaN,
 'different suffix':f=>f.extra.documentNumber='OCR 41',
 'missing suffix':f=>f.extra.documentNumber='OCR',
 'order number drift':f=>f.extra.invoiceNumber='OTHER 40',
 'same series is not the exception':f=>f.extra.documentNumber=f.extra.invoiceNumber='CN 40',
 'different type':f=>f.extra.documentType='INVOICE',
 'paid extra':f=>f.extra.paymentTransactionId='another-payment',
 'shared existing payment on extra':f=>f.extra.paymentTransactionId='negative',
 'unlinked payment amount':f=>f.extra.paymentAmount=0,
 'paid extra without link':f=>f.extra.settlementMode='PAID',
 'unknown settlement mode':f=>f.extra.settlementMode='UNKNOWN',
 'posted extra':f=>f.extra.documentStatus='APPROVED',
 'final extra':f=>f.extra.status='FINAL',
 'posted root':f=>f.root.documentStatus='APPROVED',
 'unverified applied credit':f=>f.root.creditPaymentVerified=false,
 'changed root series':f=>f.root.documentNumber='OTHER 40',
 'changed root order spelling identity':f=>f.root.invoiceNumber='OTHER 40',
 'empty root table':f=>f.root.lineCount=0,
 'reversed root':f=>f.root.reversedAt='2026-11-04',
 'positive payment':f=>f.root.paymentAmount=7,
 'foreign payment store':f=>f.root.paymentStoreId='other',
 'changed recorded payment':f=>f.row.rawPayload.commonDraft.paymentTransactionId='other',
 'initial pair is not continuation':f=>delete f.row.rawPayload.commonDraft,
 'missing old family':f=>f.row.rawPayload.commonDraft.aliasOrderIds=[],
 'self alias':f=>f.row.rawPayload.commonDraft.aliasOrderIds=['root'],
 'already included extra':f=>f.row.rawPayload.commonDraft.aliasOrderIds=['third'],
 'duplicate aliases':f=>f.row.rawPayload.commonDraft.aliasOrderIds=['old','old'],
 'root document drift':f=>f.row.rawPayload.mydataDraftDocumentId='other',
 'original-job drift':f=>f.row.jobDocumentId='other',
 'different MARK':f=>f.row.rawPayload.commonDraft.mark='other',
 'different inbox':f=>f.row.rawPayload.commonDraft.inboxId='other',
 'missing original':f=>f.row.attachmentId=null,
 'not a credit':f=>f.row.invoiceType='1.1'
};
for(const [name,change] of Object.entries(denied))test('series capability rejects '+name,()=>{
 const f=fixture();change(f);assert.equal(reconciliation.canReviewAdditionalCreditSeries(f.row,f.root,f.extra),false);
});

test('actual preview supplies the capability and binds extra settlement and common-root evidence to its version',async()=>{
 const f=fixture(),p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);
 assert.equal(p.additionalCreditSeriesReviewSupported,true);assert.equal(p.orders.find(o=>o.orderId==='third').additionalCreditSeriesReviewEligible,true);
 assert.equal(p.orders.find(o=>o.orderId==='root').additionalCreditSeriesReviewEligible,false);assert.equal(f.writes.length,0);
 f.extra.settlementMode='PAID';const paid=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);assert.notEqual(p.version,paid.version);assert.equal(paid.orders.find(o=>o.orderId==='third').additionalCreditSeriesReviewEligible,false);
 f.extra.settlementMode='CREDIT';f.row.rawPayload.commonDraft.paymentTransactionId='different';const drift=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);assert.notEqual(p.version,drift.version);
});
test('actual writer admits reviewed third-series correction without changing original financial inputs',async()=>{
 const f=fixture(),p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope),before=structuredClone([f.payment,f.document,f.audit,f.root,f.extra]);
 const r=await reconciliation.reconcileInvoiceDrafts(f.db,f.scope,f.input(p));
 assert.equal(r.orderId,'root');assert.equal(r.documentId,'d-root');assert.deepEqual(r.aliasOrderIds,['old','third']);assert.equal(r.paymentChanged,false);assert.equal(r.stockUpdated,false);
 assert.deepEqual([f.payment,f.document,f.audit,f.root,f.extra],before);assert.ok(f.writes.length>0);
 const inserted=f.writes.find(w=>w.sql.includes('INSERT INTO "InvoiceDraftAlias"'));const audit=JSON.parse(inserted.values.find(v=>typeof v==='string'&&v.startsWith('{')));
 assert.equal(audit.reviewedAdditionalCreditSeries,true);assert.equal(audit.selectedRowsOrderId,'root');assert.equal(audit.paymentTransactionId,'negative');
 for(const w of f.writes.filter(w=>/UPDATE "Purchase(?:Order|Document)"/.test(w.sql))){assert.match(w.sql,/"status"='MERGED'/);assert.ok(w.values.includes('third')||w.values.includes('d-third'))}
});
test('actual writer keeps confirmations, canonical table, fresh version and automatic-merge fences',async()=>{
 for(const patch of [{confirmHeaderCorrection:false},{confirmHeaderCorrection:'true'},{confirmSameInvoice:false},{selectedRowsOrderId:null},{selectedRowsOrderId:'third'},{expectedVersion:null},{expectedVersion:'stale'},{confirmMark:'other'},{reason:'short'},{automatic:true}]){
  const f=fixture(),p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);
  await assert.rejects(reconciliation.reconcileInvoiceDrafts(f.db,f.scope,{...f.input(p),...patch}));assert.equal(f.writes.length,0,JSON.stringify(patch));
 }
});
test('actual writer denies forged capability and recomputes after row locks before the first write',async()=>{
 const f=fixture(),p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);f.afterLocks=()=>{f.extra.totalGross=7.01};
 await assert.rejects(reconciliation.reconcileInvoiceDrafts(f.db,f.scope,{...f.input(p),additionalCreditSeriesReviewEligible:true}),e=>e.code==='INVOICE_RECONCILIATION_STALE');assert.equal(f.writes.length,0);
});
test('actual writer refuses an unsafe flat family even when the advisory capability is true',async()=>{
 const f=fixture(),p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);assert.equal(p.orders.find(o=>o.orderId==='third').additionalCreditSeriesReviewEligible,true);
 f.alias.canonicalDocumentId='other';await assert.rejects(reconciliation.reconcileInvoiceDrafts(f.db,f.scope,f.input(p)),e=>e.code==='INVOICE_COMMON_FAMILY_REVIEW_REQUIRED');assert.equal(f.writes.length,0);
});
test('actual writer denies other header differences even when the old receipt heuristic would not flag them',async()=>{
 for(const [name,change] of Object.entries({date:f=>f.extra.documentDate='2026-10-13',amount:f=>f.extra.totalGross=9,cent:f=>f.extra.totalGross=7.01,number:f=>f.extra.documentNumber=f.extra.invoiceNumber='OCR 41',supplier:f=>f.extra.documentSupplierId='other',paid:f=>f.extra.paymentTransactionId='negative'})){
  const f=fixture();change(f);const p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);
  await assert.rejects(reconciliation.reconcileInvoiceDrafts(f.db,f.scope,f.input(p)),undefined,name);assert.equal(f.writes.length,0,name);
 }
});
test('existing positive-invoice manual continuation is unchanged and does not receive the credit exception',async()=>{
 const f=fixture();f.row.invoiceType='1.1';f.root.documentType=f.extra.documentType='INVOICE';f.root.paymentAmount=7;f.payment.amount=7;
 const p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);assert.equal(p.documentType,'INVOICE');assert.equal(p.orders.find(o=>o.orderId==='third').additionalCreditSeriesReviewEligible,false);
 const before=structuredClone(f.payment),result=await reconciliation.reconcileInvoiceDrafts(f.db,f.scope,f.input(p));
 assert.equal(result.orderId,'root');assert.equal(result.paymentChanged,false);assert.equal(result.stockUpdated,false);assert.deepEqual(f.payment,before);
});
test('an initial paid-credit pair still refuses series correction even after confirmations',async()=>{
 const f=fixture();delete f.row.rawPayload.commonDraft;const p=await reconciliation.previewInvoiceReconciliation(f.db,f.scope);
 assert.equal(p.orders.find(o=>o.orderId==='third').additionalCreditSeriesReviewEligible,false);
 await assert.rejects(reconciliation.reconcileInvoiceDrafts(f.db,f.scope,f.input(p)),e=>e.code==='INVOICE_CREDIT_REVIEW_REQUIRED');assert.equal(f.writes.length,0);
});
