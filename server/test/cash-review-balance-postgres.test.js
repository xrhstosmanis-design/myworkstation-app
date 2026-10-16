import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCashReviewSnapshot,readCashReviewState,sameCashReviewSnapshot} from '../src/services/cash-review-balance.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native persisted JSONB cash review snapshot retains established fields, signed balance, isolation and zero-write reads', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_balance_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"createdAt" timestamp,"reversedAt" timestamp)');
  await db.$executeRawUnsafe('CREATE TABLE "CashControlReview"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"decision" text,"amount" numeric,"note" text,"actorId" text,"actorName" text,"snapshotJson" jsonb,"createdAt" timestamp)');
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES('sale','c','s','shift','SALE_CASH',10,'2026-10-16 07:00',NULL),('expense','c','s','shift','OTHER_EXPENSE',2.1234,'2026-10-16 07:01',NULL),('reversed','c','s','shift','SALE_CASH',-3,'2026-10-16 07:02','2026-10-16 07:03'),('control','c','control','shift','SALE_CASH',999,'2026-10-16 07:04',NULL),('foreign','x','s','shift','SALE_CASH',999,'2026-10-16 07:05',NULL)`;
  const snapshot=await readCashReviewSnapshot(db,'c','s','shift');assert.deepEqual(snapshot,{transactionCount:3,activeTotal:12.1234,expenseTotal:2.1234,reversedCount:1,lastMovementAt:'2026-10-16T07:03:00.000Z'});
  await db.$executeRaw`INSERT INTO "CashControlReview" VALUES('review','c','s','shift','EXPLANATION',2,'confirmed source','reviewer','Reviewer',${JSON.stringify(snapshot)}::jsonb,'2026-10-16 08:00'),('foreign-review','x','s','shift','EXPLANATION',999,'foreign','x','Foreign',${JSON.stringify(snapshot)}::jsonb,'2026-10-16 08:00')`;
  const persisted=(await db.$queryRaw`SELECT "snapshotJson" FROM "CashControlReview" WHERE "id"='review'`)[0].snapshotJson;assert.equal(sameCashReviewSnapshot(persisted,snapshot),true);
  const before=await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "StoreTransaction")::int AS movements,(SELECT SUM("amount") FROM "StoreTransaction") AS total,(SELECT COUNT(*) FROM "CashControlReview")::int AS reviews`;
  const session={companyId:'c',storeId:'s',sessionId:'shift',variance:-5};let out=await readCashReviewState(db,session);assert.equal(out.balance.unexplainedVariance,-3);assert.equal(out.balance.explainedAmount,2);assert.equal(out.confirmedExplanations.length,1);assert.equal(out.confirmedExplanations[0].actorName,'Reviewer');
  const after=await db.$queryRaw`SELECT (SELECT COUNT(*) FROM "StoreTransaction")::int AS movements,(SELECT SUM("amount") FROM "StoreTransaction") AS total,(SELECT COUNT(*) FROM "CashControlReview")::int AS reviews`;assert.deepEqual(after,before);
  await db.$executeRaw`UPDATE "StoreTransaction" SET "amount"=11 WHERE "id"='sale'`;out=await readCashReviewState(db,session);assert.equal(out.balance.reason,'STALE_REVIEW');assert.equal(out.balance.unexplainedVariance,null);assert.equal(out.confirmedExplanations.length,0);
  await db.$executeRawUnsafe('DROP TABLE "CashControlReview"');out=await readCashReviewState(db,session);assert.equal(out.balance.status,'UNAVAILABLE');assert.equal(out.balance.unexplainedVariance,null);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
