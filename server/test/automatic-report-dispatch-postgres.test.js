import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readActivation,ACTIVATION_SERVICE_ID} from '../src/services/automatic-report-activation.js';
import {automaticReportDispatchDDL} from '../src/services/automatic-report-dispatch-schema.js';
import * as persistence from '../src/services/automatic-report-dispatch-policy.js';
import {createAutomaticReportDispatcher} from '../src/services/automatic-report-dispatch.js';
import {createAutomaticReportEligibilityReader} from '../src/services/automatic-report-eligibility.js';
import {createAutomaticReportDeliveryRepository} from '../src/services/automatic-report-delivery-repository.js';
import {createAutomaticReportDeliveryDriver} from '../src/services/automatic-report-delivery-driver.js';
function isolated(value=process.env.DATABASE_URL,mode=process.env.NODE_ENV){
 try{
  const u=new URL(value),database=decodeURIComponent(u.pathname);
  if(mode!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(database))return false;
  const seen=new Set();
  for(const[key,entry]of u.searchParams){
   if(seen.has(key))return false;seen.add(key);
   if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(entry))return false;continue}
   const allowed={connection_limit:[1,1000],pool_timeout:[0,600],statement_cache_size:[0,100000]},bounds=Object.hasOwn(allowed,key)?allowed[key]:null;
   if(!bounds||!/^\d{1,6}$/.test(entry)||Number(entry)<bounds[0]||Number(entry)>bounds[1])return false;
  }
  return true;
 }catch{return false}
}
const NOW='2026-10-22T12:00:00.000Z',scope={companyId:'c',storeId:'s',frequency:'DAILY'},generation='9007199254740993';
const control=readActivation({RENDER_SERVICE_ID:ACTIVATION_SERVICE_ID,AUTOMATIC_REPORT_ACTIVATION_CONTROL:JSON.stringify({v:1,serviceId:ACTIVATION_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-10-19T00:00:00.000Z',notBefore:'2026-10-20T04:00:00.000Z',enabled:true})});
const busy=e=>e?.code==='55P03'||e?.meta?.code==='55P03';
async function runAutomaticReportDispatchRegression(a,b,subtest){
 for(const sql of [
  'CREATE TABLE "Company"("id" text PRIMARY KEY,"active" boolean,"licenseStatus" text,"subscriptionEndsAt" timestamptz)',
  'CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"name" text,"active" boolean)',
  'CREATE TABLE "User"("id" text PRIMARY KEY,"role" text,"sessionVersion" integer)',
  'CREATE TABLE "CompanyModule"("companyId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
  'CREATE TABLE "StorePaidModule"("companyId" text,"storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
  'CREATE TABLE "CashControlStoreRule"("companyId" text,"storeId" text,"mode" text,"deliveryTerminalPattern" text,"carryOverEnabled" boolean,"posEftposEnabled" boolean,"updatedAt" timestamptz)',
  'CREATE TABLE "AutomaticReportSettings"("companyId" text,"storeId" text PRIMARY KEY,"configurationJson" jsonb,"version" integer)',
  'CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
  'CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedByName" text,"openedAt" timestamptz,"closedAt" timestamptz,"variance" numeric,"updatedAt" timestamptz)'
 ])await a.$executeRawUnsafe(sql);
 for(const ddl of automaticReportDispatchDDL)await a.$executeRawUnsafe(ddl);
 await a.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c',true,'ACTIVE',NULL);`);
 await a.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Synthetic',true),('control','other','Unchanged',true)`);
 await a.$executeRawUnsafe(`INSERT INTO "User" VALUES('sa','SUPER_ADMIN',1)`);
 await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',${BigInt(generation)},false,false)`;
 await a.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('c','CASH_CONTROL',true,NULL,NULL)`);
 const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}};
 await a.$executeRaw`INSERT INTO "AutomaticReportSettings" VALUES('c','s',${JSON.stringify(configuration)}::jsonb,1)`;
 await a.$executeRawUnsafe(`INSERT INTO "CashControlStoreRule" VALUES('c','s','FULL','DELIVERY',true,true,'2026-10-19T00:00:00Z')`);
 for(let n=0;n<3;n++)await a.$executeRaw`INSERT INTO "CashShiftSession" VALUES(${`shift${n}`},'c','s','MAIN','CLOSED','operator','Synthetic',${new Date(Date.parse('2026-10-21T04:00:00Z')+n*28800000)},${new Date(Date.parse('2026-10-21T04:00:00Z')+(n+1)*28800000)},${-n},${new Date('2026-10-22T04:00:00Z')})`;
 await a.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy" ("companyId","storeId","dispatchEnabled","allowsProvisional","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt") VALUES('c','s',true,true,ARRAY['DAILY'],${BigInt(generation)},'sa',${new Date(NOW)})`;
 await a.$executeRaw`INSERT INTO "AutomaticReportAutomationGrant" ("companyId","storeId","active","principalId","principalSessionVersion","allowedFrequencies","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES('c','s',true,'sa',1,ARRAY['DAILY'],${BigInt(generation)},${control.epoch},${control.activationFingerprint},${new Date(control.notBefore)},${new Date('2026-10-19T01:00:00Z')},'sa',${new Date('2026-10-19T01:00:00Z')},'sa',${new Date(NOW)})`;
 await a.$executeRaw`INSERT INTO "AutomaticReportRecipient" ("recipientId","companyId","storeId","email","verifiedAt","verifiedBy","createdBy","createdAt","updatedBy","updatedAt") VALUES('r','c','s','recipient@example.invalid',${new Date('2026-10-19T02:00:00Z')},'sa','sa',${new Date('2026-10-19T01:00:00Z')},'sa',${new Date(NOW)})`;
 await a.$executeRaw`INSERT INTO "AutomaticReportRecipientConsent" ("companyId","storeId","recipientId","recipientVersion","active","allowedFrequencies","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES('c','s','r',1,true,ARRAY['DAILY'],${BigInt(generation)},'sa',${new Date('2026-10-19T02:00:00Z')},${'a'.repeat(64)},'sa',${new Date(NOW)})`;
 let activation=control,sends=0;
 const dependencies={db:a,persistence,activationProvider:()=>activation,clock:()=>NOW,sendMail:async message=>{sends++;const slot=(await b.$queryRaw`SELECT "status" FROM "AutomaticReportDeliverySlot"`)[0];assert.equal(slot.status,'ATTEMPTING','a second connection must see committed attempt');return {accepted:[message.to],rejected:[],messageId:'<synthetic-native>'}}};
 const d=createAutomaticReportDispatcher(dependencies),read=createAutomaticReportEligibilityReader(dependencies);
 const clean=async()=>{await a.$executeRawUnsafe('TRUNCATE "AutomaticReportDeliverySlot","AutomaticReportPayload"');sends=0};
 const sourceBefore=await a.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`;
 await subtest('real six-table persistence and source compose to one committed SMTP receipt, no terminal resend',async()=>{
  const result=await d.dispatch(scope);assert.equal(result.attempted,1);assert.equal(result.outcomes[0].outcome,'ACCEPTED');assert.equal(sends,1);await d.dispatch(scope);assert.equal(sends,1);
  const payload=(await a.$queryRaw`SELECT "lifecycleGeneration"::text AS generation FROM "AutomaticReportPayload"`)[0];assert.equal(payload.generation,generation);assert.deepEqual(await a.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,sourceBefore);await clean();
 });
 await subtest('two simultaneous actual dispatchers have one claimed winner and exactly one committed SMTP call',async()=>{
  let release,entered,arrivals=0;const barrier=new Promise(resolve=>{release=resolve}),arrived=new Promise(resolve=>{entered=resolve});
  const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Concurrent dispatch fixture barrier timed out')),12000)})])}finally{clearTimeout(timer)}};
  // Pause before checkout of each dispatcher's second transaction: both real
  // preparation transactions must commit the same PENDING version before
  // either real claim transaction may compete for its scoped slot row.
  const atClaim=client=>{let count=0;return {$transaction:async(fn,options)=>{
   if(++count===2){if(++arrivals===2)entered();await bounded(barrier)}
   return client.$transaction(fn,options);
  }}};
  const first=createAutomaticReportDispatcher({...dependencies,db:atClaim(a)});
  const second=createAutomaticReportDispatcher({...dependencies,db:atClaim(b)});
  let one,two;
  try{
   one=first.dispatch(scope);two=second.dispatch(scope);await bounded(arrived);assert.equal(sends,0);release();
   const results=await bounded(Promise.all([one,two]));
   assert.equal(sends,1);assert.equal(results.flatMap(result=>result.outcomes).filter(result=>result.outcome==='ACCEPTED').length,1);
   assert.equal(results.flatMap(result=>result.outcomes).filter(result=>result.outcome==='HOLD').length,1);
   assert.equal((await a.$queryRaw`SELECT "status" FROM "AutomaticReportDeliverySlot"`)[0].status,'ACCEPTED');
   assert.deepEqual(await a.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,sourceBefore);
  }finally{release();await bounded(Promise.allSettled([one,two].filter(Boolean)))}
  await clean();
 });
 await subtest('configuration SHARE locks exclude actual first INSERTs into all three configuration tables',async()=>{
  await a.$transaction(async tx=>{
   await read.readContext(tx,scope,NOW);
   for(const sql of [`INSERT INTO "CompanyModule"("companyId","moduleKey","active") VALUES('c','ABSENT',true)`,`INSERT INTO "StorePaidModule"("companyId","storeId","moduleKey","active") VALUES('c','s','ABSENT',true)`,`INSERT INTO "CashControlStoreRule"("companyId","storeId") VALUES('c','absent')`]){
    await assert.rejects(b.$transaction(async other=>{await other.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");await other.$executeRawUnsafe(sql)}),busy);
   }
  },{isolationLevel:'ReadCommitted',timeout:15000});
 });
 await subtest('configuration writer holding ROW EXCLUSIVE makes fresh reader fail NOWAIT before financial source',async()=>{
  await b.$transaction(async tx=>{await tx.$executeRawUnsafe('LOCK TABLE "CompanyModule" IN ROW EXCLUSIVE MODE');await assert.rejects(a.$transaction(t=>read.readContext(t,scope,NOW),{isolationLevel:'ReadCommitted'}),busy)});
 });
 async function attemptPrepared(mutate){
  const prepared=await d.prepare(scope),record=prepared.slots[0].record;
  const repository=createAutomaticReportDeliveryRepository({db:a,readEligibility:read});
  const claimed=await repository.claim({companyId:'c',storeId:'s',slotId:record.slotId},{expectedVersion:record.version,token:'native-test-token',now:NOW,leaseMs:60000});
  await mutate();
  const driver=createAutomaticReportDeliveryDriver({...dependencies,readEligibility:read});
  const result=await driver.attempt({scope:{companyId:'c',storeId:'s',slotId:claimed.slotId},expectedVersion:claimed.version,token:claimed.token,payload:prepared.payload});assert.equal(result.outcome,'UNKNOWN');assert.equal(sends,0);
 }
 await subtest('consent revocation after prepare denies real driver start without external IO',async()=>{
  await attemptPrepared(()=>a.$executeRawUnsafe('UPDATE "AutomaticReportRecipientConsent" SET "active"=false'));await a.$executeRawUnsafe('UPDATE "AutomaticReportRecipientConsent" SET "active"=true');await clean();
 });
 await subtest('principal sessionVersion and source changes after prepare cannot reuse old permission or payload',async()=>{
  await attemptPrepared(()=>a.$executeRawUnsafe('UPDATE "User" SET "sessionVersion"=2'));await a.$executeRawUnsafe('UPDATE "User" SET "sessionVersion"=1');await clean();
  await attemptPrepared(()=>a.$executeRawUnsafe('UPDATE "CashShiftSession" SET "variance"=-99 WHERE "id"=\'shift0\''));await a.$executeRawUnsafe('UPDATE "CashShiftSession" SET "variance"=0 WHERE "id"=\'shift0\'');await clean();
 });
 await subtest('external epoch restore barrier and missing enrolled fence fail closed, unchanged control store',async()=>{
  activation={...control,epoch:'22222222-2222-4222-8222-222222222222'};assert.equal((await d.dispatch(scope)).status,'HOLD');assert.equal(sends,0);activation=control;
  await a.$executeRawUnsafe('DELETE FROM "StoreLifecycleFence"');assert.equal((await d.dispatch(scope)).status,'HOLD');assert.equal(sends,0);
  assert.deepEqual(await a.$queryRaw`SELECT "name","active" FROM "Store" WHERE "id"='control'`,[{name:'Unchanged',active:true}]);assert.deepEqual(await a.$queryRaw`SELECT * FROM "CashShiftSession" ORDER BY "id"`,sourceBefore);
 });
}
test('dispatch native isolation guard denies remote/database/URL overrides and is mandatory in CI',()=>{
 for(const url of ['postgresql://u:p@production.example/dispatch_test','postgresql://u:p@localhost/live','postgresql://u:p@localhost/dispatch_test?host=production.example','postgresql://u:p@localhost/dispatch_test?options=-csearch_path%3Dpublic','postgresql://u:p@localhost/dispatch_test?schema=public&schema=other','postgresql://u:p@localhost/dispatch_test?__proto__=1'])assert.equal(isolated(url,'test'),false);
 assert.equal(isolated('postgresql://u:p@localhost/myworkstation_test?schema=public','test'),true);
 if(process.env.CI)assert.ok(isolated(),'native automatic dispatch subcases must run in full CI');
});
test('native automatic dispatch six-table authorization, phantoms, finality and no resend',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='report_dispatch_'+randomBytes(12).toString('hex');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await runAutomaticReportDispatchRegression(a,b,(name,fn)=>t.test(name,fn))}
 finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
