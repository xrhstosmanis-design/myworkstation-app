import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {applySupplierCreditCash} from '../src/lib/supplier-credit-cash.js';
import {previewInvoiceReconciliation,reconcileInvoiceDrafts} from '../src/lib/invoice-common-draft.js';
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
async function fixture(mode='OFFSET'){
 const f=await invoiceDbFixture();await f.seed({payment:false,posLines:1,mydataLines:1});
 for(const sql of [
 'CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedAt" timestamptz DEFAULT NOW())',
 'CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT NOW())',
 'CREATE TABLE "SupplierPaymentSettlement"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text,"supplierId" text,"status" text)',
 'CREATE TABLE "SupplierPaymentAllocation"("id" text PRIMARY KEY,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric)',
 'ALTER TABLE "StoreTransaction" ADD COLUMN "sessionId" text,ADD COLUMN "subtractFromShift" boolean,ADD COLUMN "paymentMethod" text,ADD COLUMN "actorId" text,ADD COLUMN "actorName" text,ADD COLUMN "supplierName" text,ADD COLUMN "attachmentMimeType" text'
 ])await f.db.$executeRawUnsafe(sql);
 await f.db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","status","terminalPos") VALUES('shift','c','s','OPEN','MAIN')`);
 for(const sql of [`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE',"documentNumber"='CN 0040'`,`UPDATE "PurchaseOrder" SET "invoiceNumber"='CN 0040'`,`UPDATE "MyDataInboundDocument" SET "series"='CN',"documentNumber"='40',"invoiceType"='5.1'`])await f.db.$executeRawUnsafe(sql);
 await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","sessionId","subtractFromShift","paymentMethod","actorId") VALUES('positive','c','s','sup','SUPPLIER_PAYMENT',50,'INV 123','shift',true,'CASH_SHIFT','operator')`);
 await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","paymentTransactionId") VALUES('original-invoice','c','s','sup','INVOICE','INV 123','2026-10-12',50,'DRAFT','positive')`);
 const d=(await f.db.$queryRawUnsafe(`SELECT "updatedAt",md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE "id"='d-mydata'`))[0];
 f.cashScope={companyId:'c',storeId:'s',terminalPos:'MAIN',user:{companyId:'c',id:'operator',fullName:'Original operator',role:'OWNER'}};
 f.input={type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId:'sup',creditDocumentId:'d-mydata',mode,invoicePaymentId:mode==='OFFSET'?'positive':null,expectedCreditAmount:3.39,expectedCreditUpdatedAt:d.updatedAt.toISOString(),expectedCreditVersion:d.version,expectedPaymentAmount:mode==='OFFSET'?50:null,expectedAppliedAmount:0,confirmOriginal:true,reason:'Synthetic original credit confirmed',idempotencyKey:crypto.randomUUID()};
 f.applied=await applySupplierCreditCash(f.db,f.cashScope,f.input);
 f.protected=async()=>{const data={};for(const table of ['StoreTransaction','StoreOperatorAudit','SupplierPaymentSettlement','SupplierPaymentAllocation','StoreProduct','StockMovement','DocumentAttachment'])data[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);data.credit=await f.db.$queryRawUnsafe(`SELECT row_to_json(d) AS row FROM "PurchaseDocument" d WHERE "id"='d-mydata'`);data.lines=await f.db.$queryRawUnsafe(`SELECT row_to_json(l) AS row FROM "PurchaseOrderLine" l ORDER BY l."id"`);return data};return f;
}
const args=p=>({posOrderId:'pos',expectedVersion:p.version,confirmSameInvoice:true,confirmMark:p.mark,selectedRowsOrderId:'mydata',reason:'Compared original credit note and all rows',actorId:'reviewer'});
test('native actual OFFSET and CASH_RETURN retain original credit identity, one signed payment and writer replay after reviewed consolidation',{skip:!isolatedInvoiceDb()},async()=>{
 for(const mode of ['OFFSET','CASH_RETURN']){const f=await fixture(mode);try{
  const before=await f.protected(),preview=await previewInvoiceReconciliation(f.db,scope);assert.equal(preview.documentType,'CREDIT_NOTE');assert.equal(preview.orders.find(o=>o.isMyData).creditPaymentVerified,true);
  const results=await Promise.all([0,1].map(()=>f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview)),{timeout:20000})));
  assert.equal(results.filter(r=>!r.reused).length,1);assert.equal(results[0].orderId,'mydata');assert.equal(results[0].paymentDifference??0,0);assert.deepEqual(await f.protected(),before);
  const repeated=await applySupplierCreditCash(f.db,f.cashScope,f.input);assert.equal(repeated.duplicate,true);assert.equal(repeated.transactionId,f.applied.transactionId);assert.deepEqual(await f.protected(),before);
  const p=await previewInvoiceReconciliation(f.db,scope);assert.equal(p.commonDraft.orderId,'mydata');assert.equal(p.commonDraft.paymentTransactionId,f.applied.transactionId);
 }finally{await f.close()}}
});
test('native additional third credit retains flat aliases, original rows/audit/cash and rejects canonical replacement',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  let preview=await previewInvoiceReconciliation(f.db,scope);const before=await f.protected();
  await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...args(preview),selectedRowsOrderId:'pos'})),e=>e.code==='INVOICE_CREDIT_CANONICAL_CHANGE');assert.deepEqual(await f.protected(),before);
  await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview)));
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'd-third',"companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross",'DRAFT',"sourceType",'third',NULL,'CREDIT',"createdByUserId","updatedAt" FROM "PurchaseDocument" WHERE "id"='d-mydata'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","invoiceNumber","sourceType","sourceDocumentId") VALUES('third','c','s','sup','NEW','CN 00040','POS_OCR_DRAFT','d-third')`);
  preview=await previewInvoiceReconciliation(f.db,scope);const protectedBefore=await f.protected();
  const result=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...args(preview),posOrderId:'third'}));assert.equal(result.orderId,'mydata');assert.deepEqual(result.aliasOrderIds,['pos','third']);assert.deepEqual(await f.protected(),protectedBefore);
 }finally{await f.close()}
});
test('native changed audit and reversed original offset invalidate preview without merging or changing cash',{skip:!isolatedInvoiceDb()},async()=>{
 for(const changed of ['audit','positive']){const f=await fixture();try{
  const preview=await previewInvoiceReconciliation(f.db,scope);
  if(changed==='audit')await f.db.$executeRawUnsafe(`UPDATE "StoreOperatorAudit" SET "details"="details"||'{"reason":"new stored evidence"}'::jsonb`);
  else await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='positive'`);
  const before=await f.protected();await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview))),e=>e.code==='INVOICE_RECONCILIATION_STALE');assert.deepEqual(await f.protected(),before);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "InvoiceDraftAlias"`))[0].n,0);
 }finally{await f.close()}}
});
