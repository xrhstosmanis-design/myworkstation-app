import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createCashPaperRepository} from '../src/services/cash-paper-repository.js';
import {createCashPaperReader} from '../src/services/cash-paper-reader.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native cash paper intent: two clients one dispatch, immutable originals/finance, cached reply, uncertain hold and stale completion fence',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_paper_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});
 const scope={companyId:'c',storeId:'s',generation:'0'},actor={id:'actor',fullName:'Reader'},raw={dateText:'21/10/2026',documentDate:'2026-10-21',operatorText:'Test',shiftText:null,lines:[],notes:[]};
 const hash=b=>createHash('sha256').update(b).digest('hex');
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of ['CREATE TABLE "Company"("id" text primary key,"active" boolean)','CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" boolean)',
   'CREATE TABLE "StoreChatMessage"("id" text primary key,"companyId" text,"storeId" text,"attachmentName" text,"attachmentMimeType" text,"attachmentSize" integer,"attachmentChecksum" text,"attachmentData" text)',
   'CREATE TABLE "WorkforceAuditLog"("id" text primary key,"companyId" text,"storeId" text,"actorUserId" text,"action" text,"entityType" text,"entityId" text,"afterJson" jsonb,"createdAt" timestamp default NOW())',
   'CREATE TABLE "CashControlReview"("id" text,"amount" numeric,"note" text)', 'CREATE TABLE "StoreTransaction"("id" text,"amount" numeric)',
   'CREATE TABLE "Sale"("id" text,"total" numeric)', 'CREATE TABLE "Payment"("id" text,"amount" numeric)'])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES ('c',true),('foreign',true)`;await db.$executeRaw`INSERT INTO "Store" VALUES ('s','c',true),('control','c',true),('foreign','foreign',true)`;
  for(const [id,company,store] of [['paper','c','s'],['control','c','control'],['foreign','foreign','foreign']]){
   const bytes=Buffer.from('%PDF-'+id);await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES (${id},${company},${store},'paper.pdf','application/pdf',${bytes.length},${hash(bytes)},${bytes.toString('base64')})`;
  }
  await db.$executeRaw`INSERT INTO "CashControlReview" VALUES ('original',2,'Original explanation')`;await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('original',-3)`;await db.$executeRaw`INSERT INTO "Sale" VALUES ('original',8)`;await db.$executeRaw`INSERT INTO "Payment" VALUES ('original',8)`;
  const original=await db.$queryRaw`SELECT * FROM "StoreChatMessage" ORDER BY "id"`;
  const balances=()=>db.$queryRaw`SELECT (SELECT SUM("amount") FROM "CashControlReview") AS reviews,(SELECT SUM("amount") FROM "StoreTransaction") AS cash,(SELECT SUM("total") FROM "Sale") AS sales,(SELECT SUM("amount") FROM "Payment") AS payments`;
  const before=await balances(),repository=createCashPaperRepository(db),repositoryB=createCashPaperRepository(other);let paid=0,release,failure;
  const gate=new Promise(resolve=>release=resolve),provider={configuration(){},prepare:async()=>[],read:async()=>{paid++;return gate;}};
  const request={messageId:'paper',checksum:hash(Buffer.from('%PDF-paper'))};
  const all=Promise.all([createCashPaperReader({repository,provider}).read(scope,actor,request),createCashPaperReader({repository:repositoryB,provider}).read(scope,actor,request)]).catch(error=>{failure=error;return [];});
  for(let i=0;i<500&&!paid&&!failure;i++)await new Promise(resolve=>setTimeout(resolve,10));
  if(failure)throw failure;assert.equal(paid,1);release(raw);const results=await all;if(failure)throw failure;
  assert(results.some(r=>r.status==='EXTRACTED_UNVERIFIED'));assert.equal(paid,1);
  const replay=await createCashPaperReader({repository,provider}).read(scope,actor,request);assert.equal(replay.reused,true);assert.equal(paid,1);
  const audits=await db.$queryRaw`SELECT * FROM "WorkforceAuditLog" ORDER BY "id"`;assert.equal(audits.length,2);assert(audits.every(r=>r.entityType==='CASH_PAPER_READING'));assert.doesNotMatch(JSON.stringify(audits),/attachmentData|JVBERi/);
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreChatMessage" ORDER BY "id"`,original);assert.deepEqual(await balances(),before);
  await assert.rejects(repository.claim({...scope,storeId:'foreign'},actor,'foreign',request.checksum));assert.equal((await repositoryB.get({...scope,storeId:'control'},request.checksum)).status,'NOT_READ');
  // A maintenance/reset starts while the already authorized provider is running.
  await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text primary key,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('s','c',0,false,false)`;
  const second=Buffer.from('%PDF-second');await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES ('second','c','s','second.pdf','application/pdf',${second.length},${hash(second)},${second.toString('base64')})`;
  const changedProvider={configuration(){},prepare:async()=>[],read:async()=>{await other.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`;return raw;}};
  await assert.rejects(createCashPaperReader({repository,provider:changedProvider}).read(scope,actor,{messageId:'second',checksum:hash(second)}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
  assert.equal((await repository.get(scope,hash(second))).status,'PENDING');assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "WorkforceAuditLog"`)[0].count,3);assert.deepEqual(await balances(),before);
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='s'`;await assert.rejects(repository.generation(scope),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
 }finally{await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
