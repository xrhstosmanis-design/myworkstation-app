import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const local=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('manual allocation PostgreSQL: authorization, preview, stale preview, rollback, one allocation and no new cash or stock', {skip:!local(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const {listManualAllocationDocuments,manualPaymentAllocation}=await import('../src/services/manual-payment-allocation.js');
 const schema='manual_alloc_'+crypto.randomBytes(6).toString('hex');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const admin=new PrismaClient(),db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 const actor={id:'owner',role:'OWNER',companyId:'c'};
 const input={companyId:'c',storeId:'s',settlementId:'settlement',targetSupplierId:'new',allocations:[{purchaseDocumentId:'doc',amount:90.17}],confirmSupplierChange:true,reason:'Owner verified original supplier'};
 const sql=s=>db.$executeRawUnsafe(s);
 const snapshot=async()=>JSON.stringify(await db.$queryRawUnsafe('SELECT * FROM "StoreTransaction" ORDER BY id'));
 const counts=async()=> (await db.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM "SupplierPaymentAllocation") AS allocations,(SELECT count(*)::int FROM "StoreOperatorAudit") AS audits,(SELECT count(*)::int FROM "StockMovement") AS stock'))[0];
 try{
 await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
 for(const s of [
 'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"amount" NUMERIC(14,2),"type" TEXT,"paymentMethod" TEXT,"sessionId" TEXT,"reversedAt" TIMESTAMPTZ,"invoiceDocumentNumber" TEXT,"invoicePaymentKey" TEXT)',
 'ALTER TABLE "StoreTransaction" ADD COLUMN "attachmentData" TEXT',
 'CREATE TABLE "SupplierPaymentSettlement" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"transactionId" TEXT,"supplierId" TEXT,"status" TEXT,"paymentMethod" TEXT,"reviewedBy" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNote" TEXT)',
 'CREATE TABLE "SupplierPaymentAllocation" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"settlementId" TEXT,"purchaseDocumentId" TEXT,"amount" NUMERIC(14,2),UNIQUE("settlementId","purchaseDocumentId"))',
 'CREATE TABLE "Supplier" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"taxId" TEXT,"active" BOOLEAN)',
 'CREATE TABLE "BankLedgerEntry" ("sourceTransactionId" TEXT)',
 'CREATE TABLE "PurchaseDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"status" TEXT,"documentType" TEXT,"settlementMode" TEXT,"paymentTransactionId" TEXT,"documentNumber" TEXT,"totalGross" NUMERIC(14,4),"documentDate" TIMESTAMP DEFAULT NOW())',
 'CREATE TABLE "PurchaseOrderPosting" ("orderId" TEXT,"companyId" TEXT,"purchaseDocumentId" TEXT)',
 'CREATE TABLE "InvoiceStockPosting" ("orderId" TEXT,"companyId" TEXT,"storeId" TEXT,"sourceDocumentId" TEXT,"postedDocumentId" TEXT)',
 'CREATE TABLE "PurchaseOrder" ("id" TEXT,"companyId" TEXT,"storeId" TEXT,"sourceDocumentId" TEXT,"status" TEXT)',
 'CREATE TABLE "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"operatorId" TEXT,"actorId" TEXT,"eventType" TEXT,"details" JSONB)',
 'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)',
 'INSERT INTO "Supplier" VALUES (\'old\',\'c\',\'Old\',NULL,true),(\'new\',\'c\',\'New\',\'123456789\',true)',
 'INSERT INTO "StoreTransaction" ("id","companyId","storeId","supplierId","amount","type","paymentMethod","sessionId","reversedAt","invoiceDocumentNumber","invoicePaymentKey") VALUES (\'pay\',\'c\',\'s\',\'old\',90.17,\'SUPPLIER_PAYMENT\',\'CASH_SHIFT\',\'shift\',NULL,NULL,NULL)',
 'INSERT INTO "SupplierPaymentSettlement" VALUES (\'settlement\',\'c\',\'s\',\'pay\',\'old\',\'PENDING_REVIEW\',\'CASH_SHIFT\',NULL,NULL,NULL)',
 'INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","status","documentType","settlementMode","paymentTransactionId","documentNumber","totalGross") VALUES (\'doc\',\'c\',\'s\',\'new\',\'APPROVED\',\'INVOICE\',NULL,NULL,\'35375\',90.1734),(\'source\',\'c\',\'s\',\'new\',\'DRAFT\',\'INVOICE\',NULL,NULL,\'35375\',90.1734)',
 'INSERT INTO "PurchaseOrder" VALUES (\'order\',\'c\',\'s\',\'source\',\'INVOICED\')',
 'INSERT INTO "PurchaseOrderPosting" VALUES (\'order\',\'c\',\'doc\')',
 'INSERT INTO "InvoiceStockPosting" VALUES (\'order\',\'c\',\'s\',\'source\',\'doc\')',
 'INSERT INTO "StockMovement" VALUES (\'stock\',156)'
 ])await sql(s);
 assert.deepEqual((await listManualAllocationDocuments(db,'c','s','new')).map(d=>[d.id,d.availableAmount]),[['doc',90.17]]);
 await sql(`UPDATE "PurchaseDocument" SET "paymentTransactionId"='prior-payment',"settlementMode"='PAID' WHERE "id"='source'`);
 assert.deepEqual(await listManualAllocationDocuments(db,'c','s','new'),[]);
 await assert.rejects(manualPaymentAllocation(db,actor,input),/DOCUMENT_NOT_ELIGIBLE/);
 await sql(`UPDATE "PurchaseDocument" SET "paymentTransactionId"=NULL,"settlementMode"=NULL WHERE "id"='source'`);
 const before=await snapshot();
 await assert.rejects(manualPaymentAllocation(db,{...actor,companyId:'other'},input),/FORBIDDEN_SCOPE/);
 await assert.rejects(manualPaymentAllocation(db,{...actor,tokenType:'STORE_OPERATOR'},input),/FORBIDDEN/);
 await assert.rejects(manualPaymentAllocation(db,actor,{...input,confirmSupplierChange:false}),/SUPPLIER_CHANGE_REQUIRES_CONFIRMATION/);
 const preview=await manualPaymentAllocation(db,actor,input);
 assert.equal(preview.status,'CONFIRMED');assert.equal(preview.difference,0);
 assert.equal(await snapshot(),before);assert.deepEqual(await counts(),{allocations:0,audits:0,stock:1});
 await assert.rejects(manualPaymentAllocation(db,actor,{...input,expectedVersion:'0'.repeat(64)},{preview:false}),/PREVIEW_CHANGED/);
 await sql('ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT reject_audit CHECK (false)');
 await assert.rejects(manualPaymentAllocation(db,actor,{...input,expectedVersion:preview.version},{preview:false}));
 assert.equal(await snapshot(),before);assert.deepEqual(await counts(),{allocations:0,audits:0,stock:1});
 await sql('ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT reject_audit');
 const applied=await manualPaymentAllocation(db,actor,{...input,expectedVersion:preview.version},{preview:false});
 assert.equal(applied.status,'CONFIRMED');assert.equal(applied.cashDelta,0);assert.equal(applied.stockDelta,0);
 const after=JSON.parse(await snapshot());const original=JSON.parse(before);
 assert.deepEqual(after,[{...original[0],supplierId:'new'}]);
 assert.deepEqual(await counts(),{allocations:1,audits:1,stock:1});
 assert.deepEqual((await db.$queryRawUnsafe('SELECT "status","supplierId" FROM "SupplierPaymentSettlement"'))[0],{status:'CONFIRMED',supplierId:'new'});
 await assert.rejects(manualPaymentAllocation(db,actor,{...input,expectedVersion:preview.version},{preview:false}),/PAYMENT_NOT_ELIGIBLE/);
 assert.deepEqual(await counts(),{allocations:1,audits:1,stock:1});
 }finally{await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect()}
});
