import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {unpaidMyDataHeaderReview} from '../src/lib/pos-unpaid-mydata-review.js';
import {findUnlinkedMyDataOriginal,bindUnlinkedMyDataOriginal} from '../src/lib/pos-unlinked-mydata.js';
import {lockInvoiceStore,assertNoUnresolvedInbound,reuseInboundDraftForPosJob} from '../src/lib/invoice-common-draft.js';
import {findInvoicePayment,assertReusableInvoicePayment} from '../src/lib/invoice-payment-reuse.js';
import {findMyDataPurchase} from '../src/lib/mydata-pos-receipt.js';

const identity={companyId:'c',storeId:'s',supplierId:'sup',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ 6836',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:3.39};
async function fixture(){
 const f=await invoiceDbFixture();await f.seed({pos:false,mydata:false,payment:false});
 await f.db.$executeRawUnsafe('CREATE TABLE "Company"("id" text PRIMARY KEY,"taxId" text)');
 await f.db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','088888888')`);
 await f.db.$executeRawUnsafe(`ALTER TABLE "MyDataInboundDocument" ADD COLUMN "currency" text DEFAULT 'EUR'`);
 await f.db.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN "attachmentMimeType" text`);
 await f.db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "attachmentId"=NULL,"status"='RECEIVED'`);
 await f.db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentAllocation"("id" text,"companyId" text,"purchaseDocumentId" text,"settlementId" text)');
 await f.db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentSettlement"("id" text,"companyId" text,"transactionId" text,"status" text)');
 return f;
}
const native={skip:!isolatedInvoiceDb()};
function actualDraftRoute(db){
 const source=fs.readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');
 const a=source.indexOf('router.post("/ai-reader/jobs/:jobId/pos-draft"'),b=source.indexOf('\n});',a)+4;
 const body=source.slice(a,b),handler=body.slice(body.indexOf('async(req,res,next)=>'),-2).trim();
 const d=source.indexOf('async function duplicateInvoice('),e=source.indexOf('\nasync function productsForLines',d);
 const duplicateInvoice=new Function('normalizeDocumentNumber',source.slice(d,e)+';return duplicateInvoice;')(value=>String(value).trim().toUpperCase().replace(/\s+/g,''));
 const deps={z,prisma:db,id:randomUUID,ensureInvoiceCommonDraftSchema:async()=>{},lockInvoiceStore,assertNoUnresolvedInbound,findInvoicePayment,assertReusableInvoicePayment,reuseInboundDraftForPosJob,findUnlinkedMyDataOriginal,bindUnlinkedMyDataOriginal,duplicateInvoice};
 const route=new Function(...Object.keys(deps),'return '+handler)(...Object.values(deps));
 return async(jobId='j-pos')=>{
  let result,error;const req={params:{jobId},user:{companyId:'c',id:'operator',fullName:'Synthetic operator'},body:{...identity,settlementMode:'PAID',paymentTransactionId:'payment'}};
  const res={status:()=>res,json:value=>{result=value;return res}};
  await route(req,res,e=>error=e);if(error)throw error;return result;
 };
}
test('native missing PDF/draft proposes read-only confirmation, actual draft route binds both photos once and preserves cash/stock on retry',native,async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "resultJson"='{"posHandoff":{"pageJobIds":["j-pos","j-second"]}}' WHERE "id"='j-pos'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES('second','c','s','page2.jpg','image/jpeg','data:image/jpeg;base64,cGFnZTI=','second-hash')`);
  await f.db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId") VALUES('j-second','c','s','second')`);
  const before=await f.snapshot();const review=await unpaidMyDataHeaderReview(f.db,{...identity,documentNumber:'OCR-X 9042'});
  assert.equal(review.myDataUnlinked,true);assert.equal(review.canonicalDocumentNumber,identity.documentNumber);assert.equal(await f.snapshot(),before);
  const exact=await findUnlinkedMyDataOriginal(f.db,identity);assert.equal(exact.inboxId,'inbox');
  await f.db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","invoicePaymentKey") VALUES('payment','c','s','sup','SUPPLIER_PAYMENT',3.39,${identity.documentNumber},'one-canonical-payment')`;
  const ledger=JSON.parse(await f.snapshot());
  const results=await Promise.all([actualDraftRoute(f.db)(),actualDraftRoute(f.db)()]);
  assert.equal(results[0].documentId,results[1].documentId);assert.ok(results.some(r=>r.reused));
  const match=await findMyDataPurchase(f.db,identity);assert.equal(match.documentId,results[0].documentId);assert.equal(match.paymentTransactionId,'payment');
  const rows=await f.db.$queryRawUnsafe('SELECT "id","storeId","attachmentId","purchaseDocumentId" FROM "AiReaderJob" WHERE "id" IN (\'j-pos\',\'j-second\')');
  assert.equal(rows.find(r=>r.id==='j-pos').purchaseDocumentId,match.documentId);
  assert.equal(rows.find(r=>r.id==='j-second').purchaseDocumentId,null,'secondary page must remain eligible for the normal intake');
  const core=fs.readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');
  const guardStart=core.indexOf('if(additionalPageJobs.length!==pageJobIds.length'),guardEnd=core.indexOf('){const error=',guardStart);
  assert.ok(guardStart>=0&&guardEnd>guardStart);
  const rejectsPages=new Function('pageJobIds','additionalPageJobs','lockedReplacement','skeletonDocumentId','job','return '+core.slice(guardStart+3,guardEnd));
  assert.equal(rejectsPages(['j-second'],rows.filter(r=>r.id==='j-second'),false,match.documentId,{storeId:'s'}),false,'actual intake guard must accept page 2');
  const raw=(await f.db.$queryRawUnsafe('SELECT "rawPayload" FROM "MyDataInboundDocument"'))[0].rawPayload;assert.deepEqual(new Set(raw.mydataPosReceipt.attachmentIds),new Set(['photo','second']));
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseDocument"'))[0].n,1);assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrder"'))[0].n,1);
  const after=JSON.parse(await f.snapshot());assert.deepEqual(after.StoreProduct,ledger.StoreProduct);assert.deepEqual(after.StockMovement,ledger.StockMovement);assert.equal(after.StoreTransaction.length,1);assert.equal(after.StoreTransaction[0].row.amount,ledger.StoreTransaction[0].row.amount);assert.equal(after.StoreTransaction[0].row.id,'payment');
  await assert.rejects(unpaidMyDataHeaderReview(f.db,{...identity,documentNumber:'OCR-X 9042'}));
 }finally{await f.close()}
});

test('native unlinked header rejects paid, tombstoned, wrong recipient/currency/type, processed and competing drafts without writes',native,async()=>{
 const changes=[
  `UPDATE "MyDataInboundDocument" SET "rawPayload"='{"mydataDraftDocumentId":"deleted"}'`,
  `UPDATE "MyDataInboundDocument" SET "rawPayload"='{"mydataPosReceipt":{}}'`,
  `UPDATE "MyDataInboundDocument" SET "counterpartVat"='011111111'`,
  `UPDATE "MyDataInboundDocument" SET "currency"='USD'`,
  `UPDATE "MyDataInboundDocument" SET "invoiceType"='5.1'`,
  `UPDATE "DocumentInbox" SET "status"='CONFIRMED'`,
  `INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('already','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`,
  `INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('padded','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 006836')`,
  `INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","sourceType","purchaseOrderId") VALUES('old','c','s','sup','INVOICE','OCR 9000','2026-10-12',3.39,'DRAFT','POS_OCR_DRAFT','old'); INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","sourceType","sourceDocumentId") VALUES('old','c','s','sup','NEW','POS_OCR_DRAFT','old')`
 ];
 for(const sql of changes){const f=await fixture();try{
  for(const statement of sql.split(';').filter(Boolean))await f.db.$executeRawUnsafe(statement);
  const before=await f.snapshot();await assert.rejects(findUnlinkedMyDataOriginal(f.db,identity));assert.equal(await f.snapshot(),before);
 }finally{await f.close()}}
 const f=await fixture();try{
  for(const patch of [{companyId:'other'},{storeId:'control'},{supplierTaxId:'011111111'},{documentDate:'2026-10-13'},{documentNumber:'OTHER 6836'},{documentType:'CREDIT_NOTE'}])assert.equal(await findUnlinkedMyDataOriginal(f.db,{...identity,...patch}),null);
  await assert.rejects(findUnlinkedMyDataOriginal(f.db,{...identity,totalGross:8}));
 }finally{await f.close()}
});

test('native failed original binding rolls back the entire new draft while retaining the existing payment',native,async()=>{
 const f=await fixture();try{
  await f.db.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('payment','c','s','sup','SUPPLIER_PAYMENT',3.39,${identity.documentNumber})`;
  await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "resultJson"='{"posHandoff":{"pageJobIds":["j-pos","missing"]}}' WHERE "id"='j-pos'`);
  const before=await f.snapshot();await assert.rejects(actualDraftRoute(f.db)());assert.equal(await f.snapshot(),before);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseDocument"'))[0].n,0);
  assert.deepEqual((await f.db.$queryRawUnsafe('SELECT "rawPayload" FROM "MyDataInboundDocument"'))[0].rawPayload,{});
 }finally{await f.close()}
});
