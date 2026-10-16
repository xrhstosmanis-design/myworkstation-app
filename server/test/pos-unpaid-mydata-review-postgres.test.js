import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {unpaidMyDataHeaderReview} from '../src/lib/pos-unpaid-mydata-review.js';
import {assertNoUnresolvedInbound} from '../src/lib/invoice-common-draft.js';
import {attachMyDataPosReceipt} from '../src/lib/mydata-pos-receipt.js';

const identity={companyId:'c',storeId:'s',supplierId:'sup',supplierTaxId:'099999999',documentNumber:'OCR-X 9042',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:3.39};
async function fixture(options={}){
 const f=await invoiceDbFixture();
 await f.seed({pos:false,mydata:true,payment:false,mydataLines:1,...options});
 await f.db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentAllocation"("id" text,"companyId" text,"purchaseDocumentId" text,"settlementId" text)');
 await f.db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentSettlement"("id" text,"companyId" text,"transactionId" text,"status" text)');
 return f;
}
async function snapshot(f){
 const result={money:await f.snapshot()};
 for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','AiReaderJob','DocumentAttachment','MyDataInboundDocument','InvoiceDraftAlias'])result[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);
 return JSON.stringify(result);
}

test('native unpaid original proposes POS confirmation without payment or second draft; confirmed exact flow links one payment once',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  const before=await snapshot(f);
  await assert.rejects(assertNoUnresolvedInbound(f.db,identity),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
  const review=await unpaidMyDataHeaderReview(f.db,identity);
  assert.equal(review.myDataHeaderReviewRequired,true);assert.equal(review.canonicalDocumentNumber,'21-ΤΔΑ 6836');
  assert.equal(await snapshot(f),before,'proposing/cancelling the review changes no record');
  const confirmed={...identity,documentNumber:review.canonicalDocumentNumber};
  await assertNoUnresolvedInbound(f.db,confirmed);
  await f.db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","invoicePaymentKey") VALUES('first-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,${confirmed.documentNumber},'one-original')`;
  const financial=await f.snapshot(),lines=await f.db.$queryRawUnsafe('SELECT row_to_json(l) AS row FROM "PurchaseOrderLine" l');
  const payment={id:'first-payment'},page={filename:'photo.jpg',mimeType:'image/jpeg',checksum:'photo-hash',dataUrl:'data:image/jpeg;base64,cGhvdG8='};
  const first=await attachMyDataPosReceipt(f.db,confirmed,[page],payment,{id:'operator'});
  assert.equal(first.purchaseDocumentId,'d-mydata');assert.equal(first.purchaseOrderId,'mydata');
  const replays=await Promise.all([0,1].map(()=>attachMyDataPosReceipt(f.db,confirmed,[page],payment,{id:'operator'})));
  assert.ok(replays.every(r=>r.reused));assert.equal(await f.snapshot(),financial);
  assert.deepEqual(await f.db.$queryRawUnsafe('SELECT row_to_json(l) AS row FROM "PurchaseOrderLine" l'),lines);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrder"'))[0].n,1);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseDocument"'))[0].n,1);
  await assert.rejects(unpaidMyDataHeaderReview(f.db,identity),e=>e.code==='INVOICE_ALREADY_PAID');
 }finally{await f.close()}
});

test('native unique exact original remains payable when another number has coincident supplier/day/amount',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`INSERT INTO "MyDataInboundDocument"("id","companyId","storeId","inboxId","mark","issuerVat","series","documentNumber","issueDate","invoiceType","totalGross") VALUES('other','c','s','other-inbox','400002','099999999','OTHER','9000','2026-10-12','1.1',3.39)`);
  const before=await snapshot(f);
  assert.equal(await unpaidMyDataHeaderReview(f.db,identity),null,'coincident amounts must not choose an original');
  await assertNoUnresolvedInbound(f.db,{...identity,documentNumber:'21-ΤΔΑ 6836'});
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native paid, received, deleted and pre-existing POS candidates cannot become first-payment proposals',{skip:!isolatedInvoiceDb()},async()=>{
 const changes=[
  `UPDATE "PurchaseDocument" SET "paymentTransactionId"='existing-payment' WHERE "id"='d-mydata'`,
  `UPDATE "PurchaseDocument" SET "settlementMode"='PAID' WHERE "id"='d-mydata'`,
  `INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('unlinked','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`,
  `INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('ocr-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,'OCR-X 9042')`,
  `UPDATE "AiReaderJob" SET "resultJson"='{"mydataPosReceipt":{"receivedAt":"2026-10-12"}}' WHERE "id"='j-pdf'`,
  `UPDATE "MyDataInboundDocument" SET "rawPayload"='{"mydataDraftOrderId":"deleted","mydataDraftDocumentId":"deleted"}'`,
  `UPDATE "PurchaseOrder" SET "status"='CANCELLED' WHERE "id"='mydata'`
 ];
 for(const sql of changes){const f=await fixture();try{
  await f.db.$executeRawUnsafe(sql);const before=await snapshot(f);let result;
  try{result=await unpaidMyDataHeaderReview(f.db,identity)}catch(e){assert.equal(e.status,409)}
  assert.ok(!result);assert.equal(await snapshot(f),before);
 }finally{await f.close()}}
 const f=await fixture({pos:true,posLines:1});try{
  const before=await snapshot(f);assert.equal(await unpaidMyDataHeaderReview(f.db,identity),null);assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native wrong scope, VAT, date, type and amount cannot propose an original',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  const before=await snapshot(f);
  for(const patch of [{companyId:'foreign'},{storeId:'control'},{supplierTaxId:'011111111'},{supplierTaxId:''},{documentDate:'2026-10-13'},{documentType:'CREDIT_NOTE'},{totalGross:4}])assert.equal(await unpaidMyDataHeaderReview(f.db,{...identity,...patch}),null);
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});
