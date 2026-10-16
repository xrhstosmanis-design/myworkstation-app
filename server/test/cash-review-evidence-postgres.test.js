import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCashReviewEvidence} from '../src/services/cash-review-evidence.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native cash evidence: same-session sale lines, cross-day next two, foreign/control isolation, zero writes and missing source', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_evidence_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"receiptNumber" text,"occurredAt" timestamp,"total" numeric,"status" text,"source" text)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"lineTotal" numeric)',
   'CREATE TABLE "Payment"("id" text primary key,"saleId" text,"method" text,"amount" numeric)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"reversedAt" timestamp,"description" text)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"openedAt" timestamp,"closedAt" timestamp,"status" text,"openedByName" text,"variance" numeric)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('prior','c','s','MAIN','2026-10-11 14:00','2026-10-11 22:00','CLOSED','Previous',0),('current','c','s','MAIN','2026-10-11 22:00','2026-10-12 06:00','CLOSED','Current',-27.30),('next','c','s','MAIN','2026-10-12 06:00','2026-10-12 14:00','CLOSED','Next',29.40),('second','c','s','MAIN','2026-10-12 14:00','2026-10-12 22:00','CLOSED','Second',0),('delivery','c','s','DELIVERY','2026-10-12 06:00','2026-10-12 14:00','CLOSED','Delivery',27.30),('foreign','x','foreign','MAIN','2026-10-12 06:00','2026-10-12 14:00','CLOSED','Foreign',27.30),('control','c','control','MAIN','2026-10-12 06:00','2026-10-12 14:00','CLOSED','Control',27.30)`;
  for(const [id,company,store,session,at,method] of [['a','c','s','current','2026-10-12T01:00:00Z','CASH'],['b','c','s','current','2026-10-12T01:00:20Z','CARD'],['foreign-sale','x','foreign','foreign','2026-10-12T01:00:10Z','CASH'],['control-sale','c','control','control','2026-10-12T01:00:10Z','CASH']]){
   await db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${id},${new Date(at)},5,'COMPLETED','POS')`;
   await db.$executeRaw`INSERT INTO "SaleLine" VALUES(${id+'line'},${id},'p','Water',1,5,0,5)`;
   await db.$executeRaw`INSERT INTO "Payment" VALUES(${id+'pay'},${id},${method},5)`;
   await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES(${id+'tx'},${company},${store},${session},${'SALE_'+method},NULL,${'POS πώληση '+id+' · '+method})`;
  }
  const current={sessionId:'current',companyId:'c',storeId:'s',terminalPos:'MAIN',openedAt:new Date('2026-10-11T22:00:00Z'),closedAt:new Date('2026-10-12T06:00:00Z'),status:'CLOSED',variance:-27.3};
  const before=await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale")::int AS sales,(SELECT COUNT(*) FROM "StoreTransaction")::int AS transactions,(SELECT SUM("variance") FROM "CashShiftSession") AS variance`;
  const out=await readCashReviewEvidence(db,current);assert.equal(out.salesStatus,'LINKED_POS_SCOPE');assert.equal(out.checkedSales,2);assert.equal(out.chainStatus,'CONTEXT_AVAILABLE');
  assert.deepEqual(out.findings.filter(f=>f.code==='SALE_LINE_DUPLICATE_CANDIDATE').map(f=>f.transactions.map(t=>t.saleId)),[['a','b']]);
  assert.deepEqual(out.findings.filter(f=>f.code==='SHIFT_CHAIN_OFFSET_CANDIDATE').map(f=>f.netVariance),[2.1]);
  assert.deepEqual(new Set(out.context.map(c=>c.sessionId)),new Set(['prior','current','next','second']));assert.doesNotMatch(JSON.stringify(out),/foreign|control|delivery/);
  const after=await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale")::int AS sales,(SELECT COUNT(*) FROM "StoreTransaction")::int AS transactions,(SELECT SUM("variance") FROM "CashShiftSession") AS variance`;assert.deepEqual(after,before);
  // A same-store sale not linked to this shift is a barrier, never silently skipped.
  await db.$executeRaw`INSERT INTO "Sale" VALUES('unlinked','c','s',NULL,'2026-10-12 01:00:10',5,'COMPLETED','POS')`;
  await db.$executeRaw`INSERT INTO "SaleLine" VALUES('unlinked-line','unlinked','p','Water',1,5,0,5)`;
  const blocked=await readCashReviewEvidence(db,current);assert.equal(blocked.findings.filter(f=>f.code==='SALE_LINE_DUPLICATE_CANDIDATE').length,0);
  await db.$executeRawUnsafe('DROP TABLE "SaleLine"');const missing=await readCashReviewEvidence(db,current);assert.equal(missing.salesStatus,'UNAVAILABLE');assert.equal(missing.chainStatus,'CONTEXT_AVAILABLE');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
