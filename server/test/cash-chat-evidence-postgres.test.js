import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCashChatEvidence} from '../src/services/cash-chat-evidence.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native chat cash discovery: real owned SQL, late upload unassigned, exact 50 cap, zero writes and missing table', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='cash_chat_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatMessage"("id" text primary key,"companyId" text,"storeId" text,"category" text,"createdAt" timestamp,"attachmentName" text,"attachmentMimeType" text,"attachmentSize" integer,"attachmentChecksum" text,"attachmentData" text)');
  for(const [id,company,store,mime] of [['own','c','s','image/jpeg'],['copy','c','s','application/pdf'],['foreign-company','x','s','image/jpeg'],['foreign-store','c','other','image/png'],['voice','c','s','audio/webm']])await db.$executeRaw`INSERT INTO "StoreChatMessage" VALUES (${id},${company},${store},'CASH','2026-10-26 12:00','sheet',${mime},7,${'a'.repeat(64)},'original')`;
  const before=await db.$queryRaw`SELECT * FROM "StoreChatMessage" ORDER BY "id"`;
  const out=await readCashChatEvidence(db,{companyId:'c',storeId:'s'});assert.equal(out.sources.length,1);assert.equal(out.sources[0].references.length,2);assert.equal(out.sources[0].documentDate,null);assert.equal(out.sources[0].sessionId,null);assert.equal(out.complete,false);assert.doesNotMatch(JSON.stringify(out),/foreign|voice|original/);
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreChatMessage" ORDER BY "id"`,before);
  await db.$executeRaw`INSERT INTO "StoreChatMessage" SELECT 'extra-'||g,'c','s','GENERAL','2026-10-27 12:00','other','image/png',7,NULL,'original' FROM generate_series(1,51) g`;
  const capped=await readCashChatEvidence(db,{companyId:'c',storeId:'s'});assert.equal(capped.status,'LIMITED');assert.equal(capped.sources.length,50);
  await db.$executeRawUnsafe('DROP TABLE "StoreChatMessage"');assert.equal((await readCashChatEvidence(db,{companyId:'c',storeId:'s'})).status,'UNAVAILABLE');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
