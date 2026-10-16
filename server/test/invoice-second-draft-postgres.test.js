import test from 'node:test';
import assert from 'node:assert/strict';
import * as common from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';

// Synthetic identities only; no production invoice or payment details.
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
const receipt={companyId:'c',storeId:'s',supplierTaxId:'099999999',documentNumber:'OCR-X 4252',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:18.46};
const cases=[
 {posNumber:'12 3456 789 01234',series:'0',number:'12345678901234',posGross:39.91,gross:39.91},
 {posNumber:'OCR-X 4252',series:'21ΤΧΒ',number:'8001',posGross:18.46,gross:18.43}
];
async function seed(f,variant,{pos=true,mydata=true}={}){
 await f.seed({pos,mydata,posLines:pos?1:0,mydataLines:mydata?1:0});
 await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "series"=${variant.series},"documentNumber"=${variant.number},"totalGross"=${variant.gross}`;
 await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "invoiceNumber"=CASE WHEN "id"='pos' THEN ${variant.posNumber} ELSE ${variant.series+' '+variant.number} END`;
 await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "documentNumber"=CASE WHEN "id"='d-pos' THEN ${variant.posNumber} ELSE ${variant.series+' '+variant.number} END,"totalGross"=CASE WHEN "id"='d-pos' THEN ${variant.posGross} ELSE ${variant.gross} END`;
 await f.db.$executeRaw`UPDATE "StoreTransaction" SET "amount"=${variant.posGross},"invoiceDocumentNumber"=${variant.posNumber}`;
}
async function snapshot(f){
 const data={financial:await f.snapshot()};
 for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','DocumentAttachment','DocumentInbox','AiReaderJob','MyDataInboundDocument','InvoiceDraftAlias','InvoiceStockPosting','PurchaseOrderPosting'])data[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);
 return JSON.stringify(data);
}

test('near receipt evidence is review only, never number identity or automatic reuse',()=>{
 const other={...receipt,documentNumber:'Different 8001',totalGross:18.43};
 assert.equal(common.sameSupplierReceiptForReview(receipt,other),true);
 assert.equal(common.sameInvoiceIdentityForReview(receipt,other),false);
 assert.equal(common.sameInvoiceNumber(receipt.documentNumber,'Different','8001'),false);
 for(const patch of [{supplierTaxId:''},{supplierTaxId:'011111111'},{documentDate:'2026-10-13'},{documentDate:null},{documentType:'CREDIT_NOTE'},{documentType:null},{totalGross:0},{totalGross:NaN},{totalGross:18.40}])assert.equal(common.sameSupplierReceiptForReview(receipt,{...other,...patch}),false,JSON.stringify(patch));
 assert.equal(common.sameSupplierReceiptForReview({...receipt,supplierTaxId:''},{...other,supplierTaxId:''}),false);
 // Existing numeric padding and series rules remain authoritative for exact reuse.
 assert.equal(common.sameInvoiceNumber('008001','21ΤΧΒ','8001'),true);
 assert.equal(common.sameInvoiceNumber('22ΤΧΒ 8001','21ΤΧΒ','8001'),false);
});

for(const [index,variant] of cases.entries())test('native number mismatch holds both arrival orders before creating a second draft: synthetic '+index,{skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['pos','mydata']){const f=await invoiceDbFixture();try{
  await seed(f,variant,{pos:first==='pos',mydata:first==='mydata'});const before=await snapshot(f);
  if(first==='pos'){
   const results=await Promise.all([0,1].map(()=>f.db.$transaction(async tx=>{await common.lockInvoiceStore(tx,'c','s');return common.attachInboundToExistingDraft(tx,scope,'owner')})));
   for(const result of results){assert.equal(result.reconciliationRequired,true);assert.deepEqual(result.candidateOrderIds,['pos']);assert.equal(result.purchaseOrderId,undefined)}
   const preview=await common.previewInvoiceReconciliation(f.db,scope),pos=preview.orders.find(o=>o.orderId==='pos');
   assert.equal(pos.exact,false);assert.equal(pos.headerReviewRequired,true);
   await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',automatic:true})),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
  }else{
   const identity={...receipt,documentNumber:variant.posNumber,totalGross:variant.posGross};
   await assert.rejects(common.assertNoUnresolvedInbound(f.db,identity),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
   const results=await Promise.allSettled([0,1].map(()=>f.db.$transaction(async tx=>{await common.lockInvoiceStore(tx,'c','s');return common.reuseInboundDraftForPosJob(tx,identity,{jobId:'j-pos',paymentTransactionId:'payment'})})));
   for(const result of results){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'INVOICE_HEADER_REVIEW_REQUIRED')}
  }
  assert.equal(await snapshot(f),before,'all drafts, original files/jobs/rows, payment, stock and control stay unchanged');
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrder"'))[0].n,1);
 }finally{await f.close()}}
});

test('native existing number-mismatched drafts require original review and block either source posting without changing records',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await seed(f,cases[1]);const before=await snapshot(f),preview=await common.previewInvoiceReconciliation(f.db,scope);
  assert.equal(preview.orders.length,2);assert.equal(preview.orders.find(o=>o.orderId==='pos').headerReviewRequired,true);assert.equal(preview.files.length,2);
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,reason:'Synthetic original review',selectedRowsOrderId:'pos'})),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
  for(const [orderId,sourceDocumentId] of [['pos','d-pos'],['mydata','d-mydata']]){
   await assert.rejects(f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId,orderId})),e=>e.code==='INVOICE_DUPLICATE_REVIEW_REQUIRED');
   await assert.rejects(f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId})),e=>e.code==='INVOICE_DUPLICATE_REVIEW_REQUIRED');
  }
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native receipt warning preserves scope, supplier, day, type, amount and cancelled boundaries',{skip:!isolatedInvoiceDb()},async()=>{
 const changes=[
  `UPDATE "MyDataInboundDocument" SET "companyId"='foreign'; UPDATE "PurchaseOrder" SET "companyId"='foreign' WHERE "id"='pos'; UPDATE "PurchaseDocument" SET "companyId"='foreign' WHERE "id"='d-pos'`,
  `UPDATE "MyDataInboundDocument" SET "storeId"='control'; UPDATE "PurchaseOrder" SET "storeId"='control' WHERE "id"='pos'; UPDATE "PurchaseDocument" SET "storeId"='control' WHERE "id"='d-pos'`,
  `UPDATE "MyDataInboundDocument" SET "issuerVat"='011111111'`,
  `UPDATE "MyDataInboundDocument" SET "issueDate"='2026-10-13'`,
  `UPDATE "MyDataInboundDocument" SET "invoiceType"='5.1'`,
  `UPDATE "MyDataInboundDocument" SET "totalGross"=18.40`,
  `UPDATE "PurchaseOrder" SET "status"='CANCELLED' WHERE "id"='pos'; UPDATE "PurchaseDocument" SET "status"='CANCELLED' WHERE "id"='d-pos'; DELETE FROM "MyDataInboundDocument"`
 ];
 for(const sql of changes){const f=await invoiceDbFixture();try{
  await seed(f,cases[1],{mydata:false});for(const statement of sql.split(';').filter(s=>s.trim()))await f.db.$executeRawUnsafe(statement);
  const before=await snapshot(f);await common.assertNoUnresolvedInbound(f.db,receipt);
  // Foreign inbound cannot be inspected in this scope. For the other negatives
  // there must be no POS candidate and no auto-merge, including same amount.
  if(!sql.includes('"companyId"=')&&!sql.includes('"storeId"=')&&!sql.includes('DELETE FROM'))assert.equal(await f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner')),null);
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}}
});
