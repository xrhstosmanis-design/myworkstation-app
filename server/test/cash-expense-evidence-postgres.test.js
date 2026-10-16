import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCashExpenseEvidence,purchaseDocumentMime} from '../src/services/cash-expense-evidence.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native expense evidence: actual tenant-safe SQL, equal/cent/mixed/cross-date payments, reversed/foreign exclusion and zero writes',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_expenses_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"storeId" text,"documentNumber" text,"status" text,"totalGross" numeric)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"subtractFromShift" boolean,"attachmentMimeType" text,"attachmentFilename" text,"reversedAt" timestamp,"occurredAt" timestamp)');
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('equal','c','s','PARTIAL','APPROVED',124),('cent','c','s','CENT','APPROVED',1.24),('partial','c','s','PARTIAL-OPEN','APPROVED',124),('foreign','x','s','PRIVATE-FOREIGN','APPROVED',1),('other-store','c','other','PRIVATE-STORE','APPROVED',1),('draft','c','s','DRAFT','DRAFT',1),('over','c','s','OVER','APPROVED',1),('bad','c','s','BAD','APPROVED',1)`;
  for(const [document,amounts] of [['equal',[31,31,62]],['cent',[.03,.03,1.18]],['partial',[31]],['over',[1,1]],['bad',[.001]],['draft',[1]]])for(const [i,amount] of amounts.entries()){
   const cash=document==='equal'&&i===0,session=cash?'old-shift':null;
   await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES (${document+'-'+i},'c','s',${session},'OTHER_EXPENSE',${amount},${cash},${purchaseDocumentMime},${document},NULL,${new Date('2026-10-'+String(i+1).padStart(2,'0')+'T10:00Z')})`;
  }
  // Same reference does not grant ownership. Reversed and unrelated movement types do not settle an invoice.
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('foreign-payment','x','s',NULL,'OTHER_EXPENSE',999,false,${purchaseDocumentMime},'equal',NULL,NOW()),('other-payment','c','other',NULL,'OTHER_EXPENSE',999,false,${purchaseDocumentMime},'equal',NULL,NOW()),('reversed','c','s',NULL,'OTHER_EXPENSE',999,false,${purchaseDocumentMime},'equal',NOW(),NOW()),('not-payment','c','s',NULL,'SALE_CASH',999,false,${purchaseDocumentMime},'equal',NULL,NOW())`;
  const rows=await db.$queryRaw`SELECT *,"attachmentFilename" AS "purchaseDocumentId",false AS "hasAttachment" FROM "StoreTransaction" WHERE "companyId"='c' AND "storeId"='s' AND "id" IN ('equal-0','cent-0','partial-0','over-0','bad-0','draft-0')`;
  const snapshot=()=>db.$queryRaw`SELECT COUNT(*)::int AS count,SUM("amount") AS total,COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL)::int AS reversed FROM "StoreTransaction"`;
  const before=await snapshot(),out=await readCashExpenseEvidence(db,{companyId:'c',storeId:'s'},rows),byId=new Map(out.map(r=>[r.id,r]));
  const equal=byId.get('equal-0');assert.equal(equal.status,'MATCHED');assert.equal(equal.documentPaymentTotal,124);assert.equal(equal.paymentCount,3);assert.equal(equal.cashPaymentTotal,31);assert.equal(equal.externalPaymentTotal,93);assert.equal(equal.amount,31);
  const cent=byId.get('cent-0');assert.equal(cent.status,'MATCHED');assert.equal(cent.documentPaymentTotal,1.24);assert.equal(cent.paymentCount,3);assert.equal(cent.amount,.03);
  assert.equal(byId.get('partial-0').status,'PARTIALLY_PAID');assert.equal(byId.get('partial-0').remainingDocumentAmount,93);assert.equal(byId.get('over-0').status,'AMOUNT_MISMATCH');assert.equal(byId.get('bad-0').status,'DOCUMENT_RECHECK');assert.equal(byId.get('draft-0').status,'DOCUMENT_RECHECK');
  const reference=id=>({id:'reference-'+id,type:'OTHER_EXPENSE',amount:1,purchaseDocumentId:id,subtractFromShift:false});
  const foreign=await readCashExpenseEvidence(db,{companyId:'c',storeId:'s'},['foreign','other-store','missing'].map(reference));assert(foreign.every(r=>r.status==='DOCUMENT_UNRESOLVED'));assert.doesNotMatch(JSON.stringify(foreign),/PRIVATE/);
  assert.deepEqual(await snapshot(),before);
  // Reversing a previously counted real installment updates only evidence, never adds a substitute movement.
  await db.$executeRaw`UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='equal-2'`;
  const nextBefore=await snapshot(),partial=(await readCashExpenseEvidence(db,{companyId:'c',storeId:'s'},[rows.find(r=>r.id==='equal-0')]))[0];assert.equal(partial.status,'PARTIALLY_PAID');assert.equal(partial.documentPaymentTotal,62);assert.equal(partial.paymentCount,2);assert.deepEqual(await snapshot(),nextBefore);
  await db.$executeRawUnsafe('DROP TABLE "PurchaseDocument"');assert.equal((await readCashExpenseEvidence(db,{companyId:'c',storeId:'s'},rows))[0].status,'SOURCE_UNAVAILABLE');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
