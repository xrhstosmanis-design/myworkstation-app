import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native business SELECTs isolate every domain, transfer direction, reversals and calendar with no writes',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='assistant_business_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"occurredAt" timestamptz,"type" text,"description" text,"amount" numeric,"actorName" text,"supplierName" text,"supplierId" text,"invoiceDocumentNumber" text,"paymentMethod" text,"reversedAt" timestamptz)',
   'CREATE TABLE "Supplier"("id" text primary key,"companyId" text,"name" text,"active" boolean,"updatedAt" timestamptz)',
   'CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"storeId" text,"supplierId" text,"documentDate" timestamptz,"documentType" text,"documentNumber" text,"status" text,"totalGross" numeric)',
   'CREATE TABLE "WorkforceEmployee"("id" text primary key,"companyId" text,"baseStoreId" text,"fullName" text,"active" boolean,"updatedAt" timestamptz,"pinHash" text)',
   'CREATE TABLE "WorkforceEmployeeStoreAccess"("employeeId" text,"storeId" text,"active" boolean)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"openedAt" timestamptz,"closedAt" timestamptz,"shiftLabel" text,"terminalPos" text,"status" text,"openedByName" text)',
   'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"createdAt" timestamptz,"actionType" text,"reason" text,"actorName" text,"details" jsonb)',
   'CREATE TABLE "BankLedgerEntry"("id" text primary key,"companyId" text,"storeId" text,"occurredAt" timestamptz,"type" text,"status" text,"amount" numeric)'
  ])await db.$executeRawUnsafe(sql);
  for(const [id,co,store,type,instant,reversed] of [
   ['out','c','s','TRANSFER_OUT','2026-09-30T21:00:00Z',false],['in','c','s','TRANSFER_AMOUNT','2026-10-01T01:00:00Z',false],
   ['reversed','c','s','TRANSFER_OUT','2026-10-01T01:00:00Z',true],['early','c','s','TRANSFER_OUT','2026-09-30T20:59:59Z',false],
   ['late','c','s','TRANSFER_OUT','2026-10-01T21:00:00Z',false],['foreign','x','s','TRANSFER_OUT','2026-10-01T01:00:00Z',false],
   ['control','c','other','TRANSFER_OUT','2026-10-01T01:00:00Z',false],['pay','c','s','SUPPLIER_PAYMENT','2026-10-01T01:00:00Z',false],['expense','c','s','OTHER_EXPENSE','2026-10-01T01:00:00Z',false]
  ])await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES(${id},${co},${store},${new Date(instant)},${type},'παράδοση',20.10,'Χειριστής','Προμηθευτής','supplier','INV1','CASH_SHIFT',${reversed?new Date(instant):null})`;
  await db.$executeRaw`INSERT INTO "Supplier" VALUES('supplier','c','Προμηθευτής',true,NOW()),('foreign','x','Ξένος',true,NOW()),('unused','c','Άλλο κατάστημα',true,NOW())`;
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES('invoice','c','s','supplier','2026-10-01T01:00:00Z','INVOICE','INV1','DRAFT',20.10),('merged','c','s','supplier','2026-10-01T01:00:00Z','INVOICE','INV1','MERGED',20.10),('other','c','other','unused','2026-10-01T01:00:00Z','INVOICE','INV2','APPROVED',99)`;
  await db.$executeRaw`INSERT INTO "WorkforceEmployee" VALUES('staff','c','s','Υπάλληλος',true,NOW(),'SECRET'),('foreign','x','s','Ξένος',true,NOW(),'SECRET'),('other','c','other','Άλλος',true,NOW(),'SECRET')`;
  await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES('shift','c','s','2026-10-01T01:00:00Z',null,'Πρωί','MAIN','OPEN','Χειριστής')`;
  await db.$executeRaw`INSERT INTO "PosSaleActionAudit" VALUES('event','c','s','2026-10-01T01:00:00Z','SELF_CONSUMPTION','Λόγος','Χειριστής','{"secret":"SECRET"}')`;
  await db.$executeRaw`INSERT INTO "BankLedgerEntry" VALUES('bank','c','s','2026-10-01T01:00:00Z','CASH_DEPOSIT','PENDING_PROOF',20.10),('cancelled','c','s','2026-10-01T01:00:00Z','CASH_DEPOSIT','CANCELLED',999)`;
  const {readAssistantBusiness}=await import('../src/services/assistant-business-reports.js'),scope={companyId:'c',storeId:'s',storeName:'LAB'},args={domain:'TRANSFERS_TO_OWNER',from:'2026-10-01',to:'2026-10-01',query:null,status:null},now=new Date('2026-10-16T00:00:00Z');
  const snapshot=()=>db.$queryRaw`SELECT (SELECT count(*)::int FROM "StoreTransaction") AS tx,(SELECT count(*)::int FROM "PurchaseDocument") AS docs,(SELECT sum("amount") FROM "StoreTransaction") AS money,(SELECT count(*)::int FROM "WorkforceEmployee") AS staff`;
  const before=await snapshot();
  const out=await readAssistantBusiness(args,scope,{db,now});assert.deepEqual(out.rows.map(r=>r.recordId),['out']);assert.equal(out.totals.amount,20.1);
  const both=await readAssistantBusiness({...args,domain:'TRANSFERS'},scope,{db,now});assert.equal(both.totals.count,2);assert.equal(both.totals.amount,null);
  for(const [domain,id] of [['SUPPLIER_PAYMENTS','pay'],['EXPENSES','expense'],['INVOICES','invoice'],['SUPPLIERS','supplier'],['STAFF','staff'],['CASH_SHIFTS','shift'],['POS_EVENTS','event'],['BANK_MOVEMENTS','bank']]){
   const a=['STAFF','SUPPLIERS'].includes(domain)?{...args,domain,from:null,to:null}:{...args,domain};const r=await readAssistantBusiness(a,scope,{db,now});assert.deepEqual(r.rows.map(x=>x.recordId),[id],domain);assert.doesNotMatch(JSON.stringify(r),/SECRET|pinHash|details/);
  }
  assert.deepEqual(await snapshot(),before);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
