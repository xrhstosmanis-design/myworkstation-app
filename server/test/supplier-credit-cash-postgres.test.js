import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {applySupplierCreditCash,supplierCreditCashContext,creditCashSchema,assertCreditCashUnlinked} from '../src/lib/supplier-credit-cash.js';
import {correctPaymentAmount} from '../src/lib/payment-amount-correction.js';

const user={companyId:'c',storeId:'s',id:'operator',fullName:'Synthetic operator',tokenType:'STORE_OPERATOR',permissions:['SUPPLIER_PAYMENT','SAME_SHIFT_PAYMENTS']};
const scope={companyId:'c',storeId:'s',terminalPos:'MAIN',user};
async function fixture(){
 const f=await invoiceDbFixture();await f.seed({pos:true,mydata:false,payment:true,posLines:1});
 for(const sql of [
  'CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedAt" timestamptz DEFAULT NOW())',
  'CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT NOW())',
  'CREATE TABLE "SupplierPaymentSettlement"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text,"supplierId" text,"status" text)',
  'CREATE TABLE "SupplierPaymentAllocation"("id" text PRIMARY KEY,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric)',
  'ALTER TABLE "StoreTransaction" ADD COLUMN "sessionId" text,ADD COLUMN "subtractFromShift" boolean,ADD COLUMN "paymentMethod" text,ADD COLUMN "actorId" text,ADD COLUMN "actorName" text,ADD COLUMN "supplierName" text,ADD COLUMN "attachmentMimeType" text',
  'CREATE UNIQUE INDEX credit_invoice_key ON "StoreTransaction"("companyId","invoicePaymentKey") WHERE "reversedAt" IS NULL AND "invoicePaymentKey" IS NOT NULL'
 ])await f.db.$executeRawUnsafe(sql);
 await f.db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","status","terminalPos") VALUES('shift','c','s','OPEN','MAIN'),('control-shift','c','s','OPEN','CONTROL')`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "totalGross"=50 WHERE "id"='d-pos'`);
 await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "amount"=50,"sessionId"='shift',"subtractFromShift"=true,"paymentMethod"='CASH_SHIFT',"actorId"='operator',"actorName"='Original operator',"supplierName"='Synthetic supplier' WHERE "id"='payment'`);
 f.addCredit=async(id='credit',number='CN 0040',gross=7)=>{
  await f.db.$executeRaw`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","sourceType","settlementMode") VALUES(${id},'c','s','sup','CREDIT_NOTE',${number},${new Date('2026-10-12')},${gross},'DRAFT','POS_OCR_DRAFT','CREDIT')`;
  await f.db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","purchaseDocumentId","attachmentId","status") VALUES(${'job-'+id},'c','s',${id},'pdf','AWAITING_APPROVAL')`;
 };
 await f.addCredit();return f;
}
async function body(f,extra={}){
 const row=(await f.db.$queryRaw`SELECT "totalGross","updatedAt",md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE "id"=${extra.creditDocumentId||'credit'}`)[0];
 return {type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId:'sup',creditDocumentId:'credit',mode:'OFFSET',invoicePaymentId:'payment',expectedCreditAmount:Number(row.totalGross),expectedCreditUpdatedAt:row.updatedAt.toISOString(),expectedCreditVersion:row.version,expectedPaymentAmount:50,expectedAppliedAmount:0,confirmOriginal:true,reason:'Verified synthetic original and net cash',idempotencyKey:crypto.randomUUID(),...extra};
}
async function snapshot(f){
 const result={};for(const table of ['StoreTransaction','PurchaseDocument','PurchaseOrder','PurchaseOrderLine','DocumentAttachment','StoreOperatorAudit','StockMovement','StoreProduct'])result[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);return result;
}
test('credit application schema requires original confirmation, exact cents and a matching cash mode',()=>{
 const value={type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId:'sup',creditDocumentId:'credit',mode:'OFFSET',invoicePaymentId:'payment',expectedCreditAmount:7,expectedCreditUpdatedAt:'2026-10-12T00:00:00.000Z',expectedCreditVersion:'a'.repeat(32),expectedPaymentAmount:50,expectedAppliedAmount:0,confirmOriginal:true,reason:'Original checked',idempotencyKey:crypto.randomUUID()};
 assert.equal(creditCashSchema.safeParse(value).success,true);
 for(const change of [{confirmOriginal:false},{expectedCreditAmount:7.001},{expectedCreditAmount:0},{mode:'CASH_RETURN'},{invoicePaymentId:null},{paymentSource:'EXTERNAL'},{reason:''}])assert.equal(creditCashSchema.safeParse({...value,...change}).success,false);
});
test('native offset creates one signed credit movement, preserves original payment/stock and reconciles actual till totals across retries',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","paymentTransactionId") SELECT 'registered-copy',"companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross",'APPROVED',"paymentTransactionId" FROM "PurchaseDocument" WHERE "id"='d-pos'`);
  const context=await supplierCreditCashContext(f.db,scope,'sup');assert.equal(context.payments.length,1);assert.equal(context.credits.length,1);assert.equal(context.payments[0].remainingAmount,50);
  const before=await snapshot(f),input=await body(f);
  const results=await Promise.all([0,1,2,3].map(()=>applySupplierCreditCash(f.db,scope,input)));
  assert.equal(results.filter(r=>!r.duplicate).length,1);assert.ok(results.every(r=>r.netCashAmount===43));
  const after=await snapshot(f),original=after.StoreTransaction.find(r=>r.row.id==='payment');assert.deepEqual(original,before.StoreTransaction.find(r=>r.row.id==='payment'));
  assert.equal(after.StoreTransaction.length,2);assert.equal(after.StoreTransaction.find(r=>r.row.id!=='payment').row.amount,-7);
  for(const t of ['StockMovement','StoreProduct','PurchaseOrder','PurchaseOrderLine','DocumentAttachment'])assert.deepEqual(after[t],before[t]);
  assert.equal(after.PurchaseDocument.find(r=>r.row.id==='credit').row.status,'DRAFT');
  const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8'),start=source.indexOf('function totals(rows){'),end=source.indexOf('\nconst transactionSchema',start);
  const totals=new Function(source.slice(start,end)+';return totals;')();
  const actual=totals(after.StoreTransaction.map(r=>r.row));assert.equal(actual.cashExpensesTotal,43);assert.equal(actual.supplierPayments,43);assert.equal(100-actual.expensesTotal,57);
  await assert.rejects(assertCreditCashUnlinked(f.db,scope,'payment'),e=>e.status===409);
  await assert.rejects(assertCreditCashUnlinked(f.db,scope,results[0].transactionId),e=>e.status===409);
  await assert.rejects(correctPaymentAmount(f.db,{...scope,transactionId:'payment'},{amount:43,expectedAmount:50,expectedCorrectionId:null,reason:'Must not double offset',idempotencyKey:crypto.randomUUID(),allocations:[]}),e=>e.status===409);
  await assert.rejects(applySupplierCreditCash(f.db,scope,{...input,idempotencyKey:crypto.randomUUID()}),e=>e.status===409);
  assert.deepEqual(await snapshot(f),after);
  await f.db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`);
  assert.equal((await applySupplierCreditCash(f.db,scope,input)).duplicate,true,'a closed-shift replay is read-only');
 }finally{await f.close()}
});
test('native actual cash return is distinct from offset and leaves approved credit stock/state unchanged',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='credit'`);
  const before=await snapshot(f),result=await applySupplierCreditCash(f.db,scope,await body(f,{mode:'CASH_RETURN',invoicePaymentId:null,expectedPaymentAmount:null}));
  assert.equal(result.cashDelta,7);assert.equal(result.netCashAmount,null);assert.equal(result.invoicePaymentId,null);
  const after=await snapshot(f);assert.deepEqual(after.StoreProduct,before.StoreProduct);assert.deepEqual(after.StockMovement,before.StockMovement);assert.equal(after.PurchaseDocument.find(r=>r.row.id==='credit').row.status,'APPROVED');
  assert.equal(after.StoreOperatorAudit[0].row.details.mode,'CASH_RETURN');
 }finally{await f.close()}
});
test('native competing credits serialize on the same till and stale remaining amount cannot spend credit twice',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.addCredit('credit-2','CN 0050',7);
  const a=await body(f),b=await body(f,{creditDocumentId:'credit-2'});
  const results=await Promise.allSettled([applySupplierCreditCash(f.db,scope,a),applySupplierCreditCash(f.db,scope,b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await snapshot(f)).StoreTransaction.length,2);
  const context=await supplierCreditCashContext(f.db,scope,'sup');assert.equal(context.payments[0].appliedAmount,7);assert.equal(context.payments[0].remainingAmount,43);
 }finally{await f.close()}
});
test('native audit failure rolls back negative movement and credit link atomically',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT reject_credit_audit CHECK ("eventType"<>'SUPPLIER_CREDIT_CASH_APPLIED')`);
  const before=await snapshot(f);await assert.rejects(applySupplierCreditCash(f.db,scope,await body(f)));assert.deepEqual(await snapshot(f),before);
 }finally{await f.close()}
});
test('native a second draft with padded spelling of the same credit cannot create another cash movement',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.addCredit('alias-credit','CN 40',7);
  await applySupplierCreditCash(f.db,scope,await body(f));
  const before=await snapshot(f);
  await assert.rejects(applySupplierCreditCash(f.db,scope,await body(f,{creditDocumentId:'alias-credit',mode:'CASH_RETURN',invoicePaymentId:null,expectedPaymentAmount:null})),e=>e.status===409);
  assert.deepEqual(await snapshot(f),before);
 }finally{await f.close()}
});
test('native wrong tenant/store/operator/terminal, stale/reversed/foreign/excess/proof/allocated credit cases cannot change money',{skip:!isolatedInvoiceDb()},async()=>{
 const changes=[
  `UPDATE "CashShiftSession" SET "status"='CLOSED'`,
  `UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='payment'`,
  `UPDATE "StoreTransaction" SET "amount"=49 WHERE "id"='payment'`,
  `UPDATE "StoreTransaction" SET "supplierId"='other' WHERE "id"='payment'`,
  `UPDATE "PurchaseDocument" SET "paymentTransactionId"='used' WHERE "id"='credit'`,
  `UPDATE "PurchaseDocument" SET "documentType"='INVOICE' WHERE "id"='credit'`,
  `UPDATE "PurchaseDocument" SET "documentNumber"='CN 0041' WHERE "id"='credit'`,
  `UPDATE "PurchaseDocument" SET "status"='CANCELLED' WHERE "id"='credit'`,
  `UPDATE "AiReaderJob" SET "status"='POS_PROCESSING' WHERE "id"='job-credit'`,
  `UPDATE "PurchaseDocument" SET "totalGross"=51 WHERE "id"='credit'`,
  `INSERT INTO "SupplierPaymentSettlement"("id","companyId","status") VALUES('s','c','CONFIRMED'); INSERT INTO "SupplierPaymentAllocation"("id","companyId","settlementId","purchaseDocumentId") VALUES('a','c','s','credit')`
 ];
 for(const sql of changes){const f=await fixture();try{
  const input=await body(f);for(const statement of sql.split(';').filter(s=>s.trim()))await f.db.$executeRawUnsafe(statement);
  const before=await snapshot(f);await assert.rejects(applySupplierCreditCash(f.db,scope,input));assert.deepEqual(await snapshot(f),before);
 }finally{await f.close()}}
 const f=await fixture();try{
  const input=await body(f),before=await snapshot(f);
  for(const changed of [{...scope,companyId:'foreign'},{...scope,storeId:'control',user:{...user,storeId:'control'}},{...scope,terminalPos:'CONTROL'},{...scope,user:{...user,id:'other'}},{...scope,user:{...user,permissions:['SUPPLIER_PAYMENT']}}])await assert.rejects(applySupplierCreditCash(f.db,changed,input));
  await assert.rejects(applySupplierCreditCash(f.db,scope,{...input,expectedCreditAmount:8}));assert.deepEqual(await snapshot(f),before);
 }finally{await f.close()}
});
