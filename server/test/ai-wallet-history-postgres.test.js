import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readWalletHistoryPage} from '../src/services/ai-wallet-history.js';
function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}

test('history PostgreSQL proof is required in full CI',()=>{if(process.env.CI)assert.ok(isolated());assert.equal(isolated('postgresql://a:b@remote/production'),false)});
test('native history crosses 100 with timestamp ties, selected-store credits and immutable controls',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wallet_history_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"fullName" text,"companyId" text,"role" text)',
   'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
   'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"cash" integer,"stock" integer)',
   'CREATE TABLE "AiOwnerWalletEntry"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"kind" text,"status" text,"creditedMicros" bigint,"chargedMicros" bigint,"reservedMicros" bigint,"feature" text,"usage" jsonb,"tariff" jsonb,"resolutionReference" text,"actorId" text,"createdAt" timestamptz,"settledAt" timestamptz)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','Selected','c'),('control','Control','c'),('foreign','Foreign','x')`;
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('untouched',123,456)`;
  await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" SELECT 'history-'||lpad(n::text,3,'0'),'c','s','USAGE','SETTLED',0,1,0,'INVOICE_OPENAI','{}'::jsonb,'{}'::jsonb,NULL,NULL,'2026-11-03T12:00:00.123450Z'::timestamptz+(n%20)*INTERVAL '1 microsecond',NULL FROM generate_series(1,225) n`;
  await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","createdAt") VALUES('control-usage','c','control','USAGE',NOW()),('shared-credit','c','control','CREDIT',NOW()),('foreign-usage','x','foreign','USAGE',NOW())`;
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT md5(string_agg(row_to_json(e)::text,',' ORDER BY "id")) AS hash FROM "AiOwnerWalletEntry" e`);
  const before=await snapshot(),controls=await db.$queryRaw`SELECT * FROM "BusinessControl"`;
  await db.$transaction(async tx=>{
   await tx.$executeRaw`SET TRANSACTION READ ONLY`;
   const seen=[];let cursor=null,pages=0;
   do{const page=await readWalletHistoryPage(tx,'c','s',cursor);assert.ok(page.entries.length<=100);seen.push(...page.entries.map(e=>e.id));cursor=page.nextCursor;pages++;assert.ok(pages<10);}while(cursor);
   const expected=await tx.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "companyId"='c' AND ("storeId"='s' OR "kind"='CREDIT') ORDER BY "createdAt" DESC,"id" DESC`;
   assert.deepEqual(seen,expected.map(e=>e.id));assert.equal(seen.length,226);assert.equal(new Set(seen).size,226);assert.equal(pages,3);
   const first=await readWalletHistoryPage(tx,'c','s');await assert.rejects(readWalletHistoryPage(tx,'x','foreign',first.nextCursor),{code:'AI_WALLET_INVALID_INPUT'});
   const company=await readWalletHistoryPage(tx,'c');assert.ok(company.entries.some(e=>e.id==='control-usage'));assert.ok(!company.entries.some(e=>e.id==='foreign-usage'));
  });
  assert.equal(await snapshot(),before);assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,controls);
 }finally{await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect();}
});

