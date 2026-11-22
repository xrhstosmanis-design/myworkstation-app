import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createSharedCostReviews,reviewSaveSchema} from '../src/services/shared-cost-reviews.js';
import {createSharedCostReviewRoutes} from '../src/routes/shared-cost-reviews.js';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}
const example={mode:'SYNTHETIC',period:'2026-10',proposalReference:'TEST-OWNER-REVIEW-2026-10',input:{period:'2026-10',amount:'100',reference:'Synthetic documented EUR source',confirmed:true,participants:['A','B','C'].map((s,i)=>({storeId:'example-store-'+s,days:i===2?'16':'31'}))}};
const actor={id:'admin',sessionId:'admin-session',sessionVersion:1,isSuperAdmin:true};
const decisions={'example-A':'APPROVED_DRAFT','example-B':'WAIVED','example-C':'PENDING'};
test('shared review refuses unsafe native targets, requires unskipped CI and strict explicit save contract',()=>{
 for(const url of ['postgresql://u:p@localhost/production','postgresql://u:p@remote/feature_test','postgresql://u:p@localhost/feature_test?host=remote','postgresql://u:p@localhost/feature_test?schema=a&schema=b'])assert.equal(isolated(url),false);
 if(process.env.CI)assert.ok(isolated(),'Real shared review PostgreSQL proof is mandatory in full CI');
 assert.equal(reviewSaveSchema.safeParse({...example,reviewConfirmed:false}).success,false);
 assert.equal(reviewSaveSchema.safeParse({...example,expectedVersion:0,quoteHash:'a'.repeat(64),requestId:randomUUID(),decisions,reviewConfirmed:true,amountCents:'1'}).success,false);
});
test('native shared review persistence, retries, current authority, version/lifecycle fencing and rollback',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='shared_review_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});let created=false,server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
   'CREATE TABLE "CustomerDemo"("companyId" text,"storeId" text)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" text,"companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
   'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"expiresAt" timestamp,"revokedAt" timestamp)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "PlatformAudit"("id" text PRIMARY KEY,"actorUserId" text,"actorName" text,"action" text,"targetType" text,"targetId" text,"targetName" text,"details" jsonb,"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP)',
   'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"cash" integer,"stock" integer,"credit" integer,"debt" integer,"emailCount" integer)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES('c','Synthetic commercial fixture',true),('cmtpopbgk000prhb5qc60zxus','LAB',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','Selected','c',true),('inactive','Inactive','c',false),('lab','LAB','cmtpopbgk000prhb5qc60zxus',true)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false)`;
  await db.$executeRaw`INSERT INTO "User" VALUES('admin','admin@example.invalid','Synthetic administrator','SUPER_ADMIN','c',1,false),('owner','owner@example.invalid','Owner','OWNER','c',1,false)`;
  await db.$executeRaw`INSERT INTO "UserSession" VALUES('admin-session','admin',NOW()+INTERVAL '1 day',NULL),('owner-session','owner',NOW()+INTERVAL '1 day',NULL)`;
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('unchanged',777,333,500,0,0)`;
  await provisionAutomaticReportDispatchSchema(db);
  const before=await db.$queryRaw`SELECT * FROM "BusinessControl"`;
  const repository=createSharedCostReviews(db),second=createSharedCostReviews(other);
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.headers['x-owner']?{...actor,id:'owner',sessionId:'owner-session'}:actor;next()});app.use('/reviews',createSharedCostReviewRoutes({db,repository}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const request=async(path,body,owner=false)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/reviews`+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(owner?{'x-owner':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const identity={mode:example.mode,period:example.period,proposalReference:example.proposalReference};
  let first,save;
  await t.test('HTTP requires native current administrator; no write on preview or failed input',async()=>{
   assert.equal((await request('/preview',example,true)).status,403);
   assert.equal((await request('/preview',{...example,mode:'COMMERCIAL'})).status,404);
   assert.equal((await request('/preview',{...example,input:{...example.input,participants:[{storeId:'example-store-A',days:'32'}]}})).status,400);
   const quote=(await request('/preview',example)).body;
   assert.equal(quote.result.totalCents,'15000');assert.equal(quote.expectedVersion,0);
   assert.equal((await db.$queryRaw`SELECT * FROM "PlatformAudit"`).length,0);
   save={...example,input:quote.input,quoteHash:quote.quoteHash,expectedVersion:0,requestId:randomUUID(),decisions,reviewConfirmed:true};
   assert.equal((await request('/save',{...save,decisions:{foreign:'WAIVED'}})).status,400);
  });
  await t.test('concurrent same UUID commits once and survives a new repository instance',async()=>{
   const saved=await Promise.all([repository.save(save,actor),second.save(save,actor)]);
   assert.equal(saved[0].id,saved[1].id);assert.equal(saved.filter(r=>r.replayed).length,1);first=saved[0];
   assert.equal(first.posted,false);assert.equal(first.review.approvedCents,'5962');assert.equal(first.review.pendingCents,'3077');assert.equal(first.review.waivedCents,'5961');
   assert.equal((await db.$queryRaw`SELECT * FROM "PlatformAudit"`).length,1);
   const reopened=await createSharedCostReviews(other).history(identity,actor);assert.equal(reopened.records[0].id,first.id);assert.equal(reopened.records[0].actorName,'Synthetic administrator');
   assert.equal((await request('/history?'+new URLSearchParams(identity),null,true)).status,403);
   assert.equal((await repository.history({...identity,mode:'COMMERCIAL'},actor)).records.length,0);
   await assert.rejects(repository.save({...save,decisions:{'example-A':'WAIVED'}},actor),e=>e.code==='SHARED_REVIEW_REQUEST_CONFLICT');
  });
  await t.test('revoked/stale/demoted actor cannot replay an already committed request',async()=>{
   await assert.rejects(repository.save(save,{...actor,sessionVersion:0}),e=>e.status===403);
   await assert.rejects(repository.save(save,{...actor,supportContext:{}}),e=>e.status===403);
   await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='admin-session'`;
   await assert.rejects(repository.save(save,actor),e=>e.status===401);
   await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='admin-session'`;
   await db.$executeRaw`UPDATE "User" SET "role"='OWNER' WHERE "id"='admin'`;
   await assert.rejects(repository.save(save,actor),e=>e.status===403);
   await db.$executeRaw`UPDATE "User" SET "role"='SUPER_ADMIN' WHERE "id"='admin'`;
  });
  await t.test('changed amount and racing different UUIDs require new quote/version, never overwrite',async()=>{
   await assert.rejects(repository.save({...save,input:{...save.input,amount:'200'},requestId:randomUUID()},actor),e=>e.code==='SHARED_REVIEW_CHANGED');
   const quote=await repository.preview(example,actor),next={...save,expectedVersion:quote.expectedVersion,quoteHash:quote.quoteHash};
   const attempts=await Promise.allSettled([repository.save({...next,requestId:randomUUID()},actor),second.save({...next,requestId:randomUUID()},actor)]);
   assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'SHARED_REVIEW_CHANGED');
   assert.equal((await repository.history(identity,actor)).records[0].version,2);
  });
  await t.test('late transaction rollback leaves no partial approval and an identical retry can recover',async()=>{
   const quote=await repository.preview(example,actor),payload={...save,expectedVersion:quote.expectedVersion,quoteHash:quote.quoteHash,requestId:randomUUID()};
   const count=(await db.$queryRaw`SELECT * FROM "PlatformAudit"`).length;
   const proxy=new Proxy(db,{get(target,key){if(key==='$transaction')return(work,options)=>target.$transaction(async tx=>{await work(tx);throw Error('Synthetic late commit refusal')},options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
   await assert.rejects(createSharedCostReviews(proxy).save(payload,actor),/late commit/);
   assert.equal((await db.$queryRaw`SELECT * FROM "PlatformAudit"`).length,count);
   assert.equal((await second.save(payload,actor)).version,3);
  });
  await t.test('commercial catalogue is authoritative and lifecycle/demo changes invalidate the verified content',async()=>{
   const commercial={...example,mode:'COMMERCIAL',input:{...example.input,participants:[{storeId:'s',days:'31'}]}};
   const quote=await repository.preview(commercial,actor),payload={...commercial,input:quote.input,expectedVersion:0,quoteHash:quote.quoteHash,requestId:randomUUID(),decisions:{c:'APPROVED_DRAFT'},reviewConfirmed:true};
   for(const id of ['inactive','lab','foreign'])await assert.rejects(repository.preview({...commercial,input:{...commercial.input,participants:[{storeId:id,days:'31'}]}},actor),e=>e.status===404);
   await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`;
   await assert.rejects(repository.save(payload,actor),e=>e.code==='SHARED_REVIEW_CHANGED');
   await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='s'`;
   await db.$executeRaw`INSERT INTO "CustomerDemo" VALUES('c','s')`;
   await assert.rejects(repository.save(payload,actor),e=>e.status===404);
   await db.$executeRaw`DELETE FROM "CustomerDemo"`;
   const row=await repository.save(payload,actor);assert.equal(row.result.companies[0].companyName,'Synthetic commercial fixture');
   await db.$executeRaw`UPDATE "Store" SET "active"=false WHERE "id"='s'`;
   await assert.rejects(repository.save(payload,actor),e=>e.status===404);
  });
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,before);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await Promise.all([db.$disconnect(),other.$disconnect()]);if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
