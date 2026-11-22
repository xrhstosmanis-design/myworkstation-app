import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
import {createAiOwnerWalletRoutes} from '../src/routes/ai-owner-wallet.js';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';

function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}
test('commercial waiver proof must run against isolated PostgreSQL in full CI',()=>{if(process.env.CI)assert.ok(isolated());assert.equal(isolated('postgresql://a:b@remote/production'),false)});
test('native commercial waiver is atomic, selected, authenticated and idempotent without asserting provider cost',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='waiver_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});let server,created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   'CREATE TYPE "UserRole" AS ENUM (\'SUPER_ADMIN\',\'OWNER\',\'EMPLOYEE\')',
   'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" "UserRole","companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
   'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp,"lastSeenAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp)',
   'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"cash" integer,"stock" integer)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES('c','Synthetic waiver','true'),('x','Foreign','true')`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','Selected','c',true),('control','Control','c',true),('foreign','Foreign','x',true)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false),('control','c',0,false,false),('foreign','x',0,false,false)`;
  await db.$executeRaw`INSERT INTO "User" VALUES('admin','admin@example.invalid','Admin','SUPER_ADMIN','c',1,false),('owner','owner@example.invalid','Owner','OWNER','c',1,false)`;
  for(const id of ['admin','owner'])await db.$executeRaw`INSERT INTO "UserSession" VALUES(${id+'-session'},${id},NULL,NULL,NULL,NOW(),NOW(),NOW()+INTERVAL '1 day',NULL)`;
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('untouched',123,456)`;
  await provisionAutomaticReportDispatchSchema(db);
  const repo=createAiOwnerWalletRepository(db),repo2=createAiOwnerWalletRepository(other);await repo.ensure();await repo2.ensure();
  await repo.credit('c',{amountMicros:'50000000',receiptReference:'SYNTHETIC-WAIVER-FUND'},'admin');
  await repo.credit('x',{amountMicros:'5000000',receiptReference:'SYNTHETIC-FOREIGN-FUND'},'admin');
  const session={sessionId:'admin-session',sessionVersion:1};
  const add=async(storeId='s',companyId='c',amount='1000000',status='REVIEW')=>{const id=randomUUID();await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","feature","tariff","usage") VALUES(${id},${companyId},${storeId},'USAGE',${id},${status},${BigInt(amount)},'INVOICE_OPENAI','{"model":"synthetic","original":"immutable"}'::jsonb,'{"observed":"preserved"}'::jsonb)`;await db.$executeRaw`UPDATE "AiOwnerWallet" SET "reservedMicros"="reservedMicros"+${BigInt(amount)},"version"="version"+1 WHERE "companyId"=${companyId}`;return id};
  const a=await add(),b=await add('s','c','2000000'),control=await add('control','c','3000000'),foreign=await add('foreign','x');
  const baseline=async()=>({wallet:await db.$queryRaw`SELECT * FROM "AiOwnerWallet" ORDER BY "companyId"`,entries:await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" ORDER BY "id"`,audits:await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" ORDER BY "id"`,notices:await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" ORDER BY "id"`});
  const original=await baseline(),business=await db.$queryRaw`SELECT * FROM "BusinessControl"`;
  const app=express();app.use(express.json());app.use('/wallet',createAiOwnerWalletRoutes({db,repository:repo,enabled:()=>true,env:{},authenticate:(req,res,next)=>{const id=req.headers['x-test-user']||'admin';req.user={id,sessionId:id+'-session',sessionVersion:1,isSuperAdmin:true,platformRole:'SUPER_ADMIN'};next()}}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/wallet/platform/companies/c/commercial-waivers`;
  const request=async(suffix,body,user='admin')=>{const r=await fetch(base+suffix,{method:'POST',headers:{'Content-Type':'application/json','x-test-user':user},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
  const selection={storeId:'s',entryIds:[b,a]},p=(await request('/preview',selection)).body;
  const body={...selection,version:p.version,generation:p.generation,fingerprint:p.fingerprint,requestId:randomUUID(),reason:'Synthetic customer commercial waiver',customerWaiverConfirmed:true};
  await t.test('preview is read-only and binds selected originals; forged scope, duplicate identities and false acknowledgement refuse',async()=>{
   assert.equal(p.releasedMicros,'3000000');assert.equal(p.providerCostStatus,'UNKNOWN');assert.deepEqual(await baseline(),original);
   for(const ids of [[a,a],[foreign],[control]])assert.ok((await request('/preview',{storeId:'s',entryIds:ids})).status>=400);
   assert.ok((await request('/preview',selection,'owner')).status>=400);
   assert.equal((await request('',{...body,customerWaiverConfirmed:false})).status,400);
   assert.equal((await request('',{...body,providerCostConfirmed:true})).status,400);assert.deepEqual(await baseline(),original);
  });
  await t.test('new diagnostic evidence and stale lifecycle context invalidate old previews without releasing holds',async()=>{
   const id=randomUUID();await db.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES(${id},'c','admin','USAGE_REVIEW',${JSON.stringify({id:a,evidence:{code:'NEW_EVIDENCE'}})}::jsonb)`;
   assert.equal((await request('',body)).status,409);await db.$executeRaw`DELETE FROM "AiOwnerWalletAudit" WHERE "id"=${id}`;
   await assert.rejects(withLifecycleContext({s:'1'},()=>repo.waiveCommercialReviews('c',body,'admin',session)));
   await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`;assert.ok((await request('',body)).status>=400);await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='s'`;
   assert.deepEqual(await baseline(),original);
  });
  await t.test('one exact batch releases holds once, preserves principal, originals, unknown cost and other entries; repeats are no-ops',async()=>{
   const results=await Promise.all([repo.waiveCommercialReviews('c',body,'admin',session),repo2.waiveCommercialReviews('c',body,'admin',session)]);assert.equal(results.filter(r=>r.replayed).length,1);
   const after=await baseline(),wallet=after.wallet.find(r=>r.companyId==='c');assert.equal(wallet.balanceMicros,50000000n);assert.equal(wallet.reservedMicros,3000000n);assert.equal(wallet.version,p.version+1);
   for(const id of [a,b]){const row=after.entries.find(e=>e.id===id),before=original.entries.find(e=>e.id===id);assert.equal(row.chargedMicros,0n);assert.equal(row.status,'SETTLED');assert.equal(row.reservedMicros,before.reservedMicros);assert.deepEqual(row.tariff,before.tariff);assert.equal(row.usage.observed,'preserved');assert.equal(row.usage.commercialWaiver.providerCostStatus,'UNKNOWN');assert.equal(row.actorId,'admin');}
   for(const id of [control,foreign])assert.deepEqual(after.entries.find(e=>e.id===id),original.entries.find(e=>e.id===id));
   assert.deepEqual(after.wallet.find(r=>r.companyId==='x'),original.wallet.find(r=>r.companyId==='x'));assert.deepEqual(after.notices,original.notices);assert.equal(after.entries.length,original.entries.length);assert.equal(after.audits.filter(r=>r.event==='COMMERCIAL_WAIVER').length,1);
   const replay=await request('',body);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.deepEqual(await baseline(),after);
   assert.equal((await request('',{...body,reason:'Different commercial decision'})).status,409);
   await assert.rejects(repo.settle('c',a,{amountMicros:'1',usage:{},actorId:'admin',resolutionReference:'SYNTHETIC-LATE'}));
   const read=await repo.read('c');assert.equal(read.entries.find(e=>e.id===a).commercialWaiver.type,'COMMERCIAL_WAIVER');assert.equal(read.usageSummary.allTimeMicros,'0');
  });
  await t.test('fresh competing batches share one version; a late transaction exception rolls back all financial artifacts',async()=>{
   const c=await add(),d=await add();const pc=await repo.previewCommercialWaiver('c',{storeId:'s',entryIds:[c]},'admin',session),pd=await repo.previewCommercialWaiver('c',{storeId:'s',entryIds:[d]},'admin',session);
   const input=p=>({storeId:p.storeId,entryIds:p.entryIds,version:p.version,generation:p.generation,fingerprint:p.fingerprint,requestId:randomUUID(),reason:'Synthetic competing waiver',customerWaiverConfirmed:true});
   const competing=await Promise.allSettled([repo.waiveCommercialReviews('c',input(pc),'admin',session),repo2.waiveCommercialReviews('c',input(pd),'admin',session)]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.filter(r=>r.status==='rejected').length,1);
   const pending=(await db.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "id" IN (${c},${d}) AND "status"='REVIEW'`)[0].id;
   const preview=await repo.previewCommercialWaiver('c',{storeId:'s',entryIds:[pending]},'admin',session),before=await baseline();let armed=false;
   const proxy=new Proxy(db,{get(target,key){if(key==='$transaction')return(work,opts)=>target.$transaction(async tx=>{const result=await work(tx);if(armed)throw Error('synthetic commit refusal');return result},opts);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}),rollback=createAiOwnerWalletRepository(proxy);await rollback.ensure();armed=true;
   await assert.rejects(rollback.waiveCommercialReviews('c',input(preview),'admin',session),/commit refusal/);assert.deepEqual(await baseline(),before);
   await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='admin-session'`;assert.ok((await request('',body)).status>=400);assert.deepEqual(await baseline(),before);
  });
  await t.test('old pending holds remain selectable beyond100 newer settled entries without expanding recent history or crossing stores',async()=>{
   const old=await add('s','c','1000');await db.$executeRaw`UPDATE "AiOwnerWalletEntry" SET "createdAt"='2020-01-01T00:00:00Z' WHERE "id"=${old}`;
   await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","feature","settledAt") SELECT 'history-'||n,'c','s','USAGE','SYNTHETIC-HISTORY-'||n,'SETTLED','OWNER_ASSISTANT',NOW() FROM generate_series(1,105) n`;
   const selected=await repo.read('c','s');assert.equal(selected.entries.length,100);assert.equal(selected.entries.some(e=>e.id===old),false);assert.equal(selected.waiverCandidates[0].id,old);assert.equal(selected.waiverCandidatesMore,false);assert.ok(selected.waiverCandidates.every(e=>e.storeId==='s'&&e.status==='REVIEW'&&e.chargedMicros==='0'));assert.equal(selected.waiverCandidates.some(e=>e.id===control||e.id===foreign),false);
   const company=await repo.read('c');assert.ok(company.waiverCandidates.some(e=>e.id===control));assert.equal(company.waiverCandidates.some(e=>e.id===foreign),false);
  });
  await t.test('paginated repository keeps public waiver projection and revoked HTTP access refuses without mutation',async()=>{
   const before=await baseline(),ids=[],entries=[];let cursor=null;
   do{const page=await repo.history('c','s',cursor);assert.equal(page.companyId,'c');assert.equal(page.storeId,'s');assert.equal(page.pageSize,100);ids.push(...page.entries.map(e=>e.id));entries.push(...page.entries);cursor=page.nextCursor;}while(cursor);
   assert.equal(new Set(ids).size,ids.length);assert.ok(ids.includes(a));assert.equal(ids.includes(control),false);assert.equal(ids.includes(foreign),false);
   const waived=entries.find(e=>e.id===a);assert.equal(waived.chargedMicros,'0');assert.equal(waived.commercialWaiver.providerCostStatus,'UNKNOWN');assert.equal(waived.cursorCreatedAt,undefined);assert.equal(waived.tariff,undefined);assert.equal(waived.usage,undefined);
   const response=await fetch(base.replace('/commercial-waivers','/history'));assert.ok(response.status>=400);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await baseline(),before);
  });
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,business);
 }finally{if(server)await new Promise(r=>server.close(r));await db.$disconnect();await other.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});

