import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createAutomaticReportDeliveryRepository} from '../src/services/automatic-report-delivery-repository.js';

const NOW='2026-10-22T12:00:00.000Z';
const later=ms=>new Date(Date.parse(NOW)+ms).toISOString();
const copy=value=>structuredClone(value);
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(decodeURIComponent(u.pathname))}catch{return false}}
const selected={companyId:'start-order-fixture-company',storeId:'selected-store'};
const controlScope={companyId:'start-order-control-company',storeId:'control-store'};
function input(name,consentRevision=3,scope=selected){
 return {...scope,reportType:'CASH',frequency:'DAILY',periodFrom:'2026-10-20T04:00:00.000Z',periodTo:'2026-10-21T04:00:00.000Z',recipient:`${name}@example.invalid`,snapshot:{settingsVersion:1,recipientVersion:2,consentRevision,lifecycleGeneration:'4',sourceFingerprint:'a'.repeat(64),payloadFingerprint:'b'.repeat(64),policyFingerprint:'c'.repeat(64),principalId:'synthetic-principal',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
}
const identified=record=>({companyId:record.input.companyId,storeId:record.input.storeId,slotId:record.slotId});
const startOptions=record=>({expectedVersion:record.version,token:record.token,now:NOW});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
async function bounded(promise,label,ms=6000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Fixture barrier timed out: ${label}`)),ms)})])}finally{clearTimeout(timer)}}
function kind(sql){
 if(/\bFROM "DeliveryEligibilityFenceFixture"/.test(sql)&&/\bFOR UPDATE\b/.test(sql))return'gate-lock';
 if(/^\s*SELECT\b/.test(sql)&&/\bFROM "AutomaticReportDeliverySlot"/.test(sql))return /\bFOR UPDATE\b/.test(sql)?'slot-lock':'probe';
 if(/^\s*INSERT INTO "AutomaticReportDeliverySlot"/.test(sql))return'slot-insert';
 if(/^\s*UPDATE "AutomaticReportDeliverySlot"/.test(sql))return'slot-update';
 return'other';
}
// Transport-only wrapper over actual Prisma transactions and parameterized
// SQL. Fixture ReadCommitted makes an independent post-probe commit observable;
// no fake rows, repository retries, production hooks or SMTP are introduced.
function observed(client,{afterProbe=null}={}){
 const trace={transactions:0,requests:[],results:[],probeCalls:0};
 return{trace,db:{$transaction:async fn=>{
  trace.transactions++;
  return client.$transaction(async tx=>fn(new Proxy(tx,{get(target,key){
   if(key==='$queryRaw')return async(...args)=>{const sql=Array.isArray(args[0])?args[0].join('?'):String(args[0]?.sql||args[0]),type=kind(sql);trace.requests.push(type);const rows=await target.$queryRaw(...args);trace.results.push(type);if(type==='probe'){trace.probeCalls++;if(afterProbe)await afterProbe({rows,trace})}return rows};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }})),{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000});
 }}};
}

// Explicitly synthetic authorization fixture. Its row lock represents one
// shared prerequisite dependency only, not real recipient/consent enrollment,
// production writer lock coverage, absent-row protection or permission to send.
async function lockedEligibility({tx,companyId,storeId,input:i,now}){
 const rows=await tx.$queryRaw`SELECT "consentRevision","consentActive" FROM "DeliveryEligibilityFenceFixture" WHERE "companyId"=${companyId} AND "storeId"=${storeId} FOR UPDATE`;
 assert.equal(rows.length,1);
 return{...copy(i),snapshot:{...copy(i.snapshot),consentRevision:rows[0].consentRevision},checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:rows[0].consentActive,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
}
const projected=(before,record)=>before.map(row=>row.slotId===record.slotId?{...row,version:String(record.version),status:record.status,token:record.token,record:copy(record)}:row);

export async function runAutomaticReportStartOrderRegression(a,b,{subtest=async(_name,fn)=>fn()}={}){
 await a.$executeRaw`CREATE TABLE "AutomaticReportDeliverySlot" ("slotId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"version" BIGINT NOT NULL CHECK("version">0 AND "version"<=9007199254740991),"status" TEXT NOT NULL CHECK("status" IN ('PENDING','CLAIMED','ATTEMPTING','ACCEPTED','UNKNOWN')),"token" TEXT,"record" JSONB NOT NULL)`;
 await a.$executeRaw`CREATE TABLE "DeliveryEligibilityFenceFixture" ("companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"consentRevision" INTEGER NOT NULL,"consentActive" BOOLEAN NOT NULL,PRIMARY KEY("companyId","storeId"))`;
 await a.$executeRaw`INSERT INTO "DeliveryEligibilityFenceFixture" VALUES(${selected.companyId},${selected.storeId},3,true),(${controlScope.companyId},${controlScope.storeId},3,true)`;
 const make=(db=a,reader=lockedEligibility)=>createAutomaticReportDeliveryRepository({db,readEligibility:reader});
 const ordinary=make(),other=make(b);
 const rows=()=>a.$queryRaw`SELECT "slotId","companyId","storeId","version"::text AS "version","status","token","record" FROM "AutomaticReportDeliverySlot" ORDER BY "slotId"`;
 const fences=()=>a.$queryRaw`SELECT * FROM "DeliveryEligibilityFenceFixture" ORDER BY "companyId","storeId"`;
 const control=(await ordinary.create(controlScope,input('control',3,controlScope),{now:NOW})).record;
 const controlBefore=(await rows()).find(row=>row.slotId===control.slotId);
 const fresh=async name=>{const current=(await a.$queryRaw`SELECT "consentRevision" FROM "DeliveryEligibilityFenceFixture" WHERE "companyId"=${selected.companyId} AND "storeId"=${selected.storeId}`)[0];const i=input(name,current.consentRevision),record=(await ordinary.create(selected,i,{now:NOW})).record;return ordinary.claim(identified(record),{expectedVersion:record.version,token:`claim-${name}`,now:NOW,leaseMs:1000})};
 const controlUnchanged=async()=>assert.deepEqual((await rows()).find(row=>row.slotId===control.slotId),controlBefore);

 await subtest('real two-client start-first race uses dependency-before-slot order without a deadlock or automatic retry',async()=>{
  const record=await fresh('lock-race'),before=await rows(),fencesBefore=await fences();
  const startEntry=deferred(),createHasGate=deferred(),startAttempt=deferred();let startCalls=0,createCalls=0,startTask,createTask;
  const startDb=observed(a),createDb=observed(b);
  const starter=make(startDb.db,async args=>{startCalls++;startEntry.resolve();await bounded(createHasGate.promise,'create holds gate');startAttempt.resolve();return lockedEligibility(args)});
  const creator=make(createDb.db,async args=>{createCalls++;const current=await lockedEligibility(args);createHasGate.resolve();await bounded(startAttempt.promise,'start attempts gate');return current});
  try{
   // The old implementation already holds Slot FOR UPDATE at startEntry.
   // Create then holds Gate and waits for Slot, while Start waits for Gate.
   // A nonlocking start probe breaks that cycle without timing-based sleeps.
   startTask=starter.start(identified(record),startOptions(record));
   // Observe an early rejection immediately while the other barrier is still
   // pending; the original promise is still checked by allSettled below.
   startTask.catch(()=>{});
   await bounded(startEntry.promise,'start enters eligibility');
   createTask=creator.create(selected,copy(record.input),{now:NOW});
   createTask.catch(()=>{});
   const results=await bounded(Promise.allSettled([startTask,createTask]),'both repository transactions finish',12000);
   for(const result of results)assert.equal(result.status,'fulfilled',String(result.reason?.stack||result.reason));
   const started=results[0].value,reconciled=results[1].value;
   assert.equal(started.status,'ATTEMPTING');assert.equal(started.version,record.version+1);assert.equal(started.attemptStartedAt,NOW);
   assert.equal(reconciled.created,false);assert.deepEqual(reconciled.record,record);
   assert.equal(startDb.trace.transactions,1);assert.equal(createDb.trace.transactions,1);assert.equal(startCalls,1);assert.equal(createCalls,1);
   assert.deepEqual(startDb.trace.requests,['probe','gate-lock','slot-lock','slot-update']);assert.deepEqual(createDb.trace.requests,['gate-lock','slot-insert','slot-lock']);
   assert.deepEqual(await rows(),projected(before,started));assert.deepEqual(await fences(),fencesBefore);await controlUnchanged();
  }finally{
   startEntry.resolve();createHasGate.resolve();startAttempt.resolve();await Promise.allSettled([startTask,createTask].filter(Boolean));
  }
 });

 await subtest('revocation committed after a canonical nonlocking probe is rechecked before any ATTEMPTING write',async()=>{
  const record=await fresh('revoked'),before=await rows(),fencesBefore=await fences();let revoked=0;
  const watched=observed(a,{afterProbe:async({rows:probe})=>{assert.equal(probe.length,1);assert.equal(probe[0].slotId,record.slotId);revoked++;await b.$transaction(async tx=>{await tx.$queryRaw`SELECT "consentRevision" FROM "DeliveryEligibilityFenceFixture" WHERE "companyId"=${selected.companyId} AND "storeId"=${selected.storeId} FOR UPDATE`;await tx.$executeRaw`UPDATE "DeliveryEligibilityFenceFixture" SET "consentActive"=false,"consentRevision"="consentRevision"+1 WHERE "companyId"=${selected.companyId} AND "storeId"=${selected.storeId}`})}});
  await assert.rejects(make(watched.db).start(identified(record),startOptions(record)),{code:'STALE_GATE'});
  assert.equal(revoked,1);assert.equal(watched.trace.transactions,1);assert.equal(watched.trace.probeCalls,1);assert.equal(watched.trace.requests.includes('slot-update'),false);assert.deepEqual(await rows(),before);
  const expected=fencesBefore.map(row=>row.companyId===selected.companyId&&row.storeId===selected.storeId?{...row,consentRevision:row.consentRevision+1,consentActive:false}:row);assert.deepEqual(await fences(),expected);await controlUnchanged();
  // Re-enrollment is fixture setup for different new slots, with a NEW revision;
  // no previously bound consent version is reset or silently reused.
  await b.$executeRaw`UPDATE "DeliveryEligibilityFenceFixture" SET "consentActive"=true,"consentRevision"="consentRevision"+1 WHERE "companyId"=${selected.companyId} AND "storeId"=${selected.storeId}`;
  assert.deepEqual(await rows(),before);
 });

 await subtest('recovery and a different claim owner between probe and locked reload preserve the committed winner',async()=>{
  const record=await fresh('reclaimed'),before=await rows(),fencesBefore=await fences();let winner;
  const watched=observed(a,{afterProbe:async()=>{const recovered=await other.recover(identified(record),{expectedVersion:record.version,now:later(1000)});winner=await other.claim(identified(recovered),{expectedVersion:recovered.version,token:'independent-winning-token',now:later(1000),leaseMs:10000})}});
  await assert.rejects(make(watched.db).start(identified(record),startOptions(record)),{code:'STALE_VERSION'});
  assert.ok(winner);assert.equal(winner.status,'CLAIMED');assert.equal(winner.version,record.version+2);assert.equal(winner.attemptStartedAt,null);assert.equal(watched.trace.probeCalls,1);assert.equal(watched.trace.requests.includes('slot-update'),false);
  assert.deepEqual(await rows(),projected(before,winner));assert.deepEqual(await ordinary.get(identified(record)),winner);assert.deepEqual(await fences(),fencesBefore);await controlUnchanged();
 });

 await subtest('a valid but replaced immutable snapshot between probe and locked reload is refused without overwriting evidence',async()=>{
  const record=await fresh('replaced'),before=await rows(),fencesBefore=await fences(),changed=copy(record);changed.input.snapshot.payloadFingerprint='d'.repeat(64);
  const watched=observed(a,{afterProbe:async()=>{await b.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "record"=${JSON.stringify(changed)}::jsonb WHERE "companyId"=${selected.companyId} AND "storeId"=${selected.storeId} AND "slotId"=${record.slotId}`}});
  await assert.rejects(make(watched.db).start(identified(record),startOptions(record)),{code:'DELIVERY_CONFLICT'});
  assert.equal(watched.trace.probeCalls,1);assert.equal(watched.trace.requests.includes('slot-update'),false);assert.deepEqual(await rows(),projected(before,changed));assert.deepEqual(await ordinary.get(identified(record)),changed);assert.equal(changed.attemptStartedAt,null);assert.deepEqual(await fences(),fencesBefore);await controlUnchanged();
 });
}

test('native delivery start order: two-client dependency locks, post-probe revocation/reclaim/replacement and unchanged control',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='delivery_start_order_'+randomBytes(12).toString('hex');assert.match(schema,/^delivery_start_order_[a-f0-9]{24}$/);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await runAutomaticReportStartOrderRegression(a,b,{subtest:(name,fn)=>t.test(name,fn)})}finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
