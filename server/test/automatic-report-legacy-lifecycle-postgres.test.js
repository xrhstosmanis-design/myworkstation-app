import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {lockAutomaticReportBoundary} from '../src/services/automatic-report-lock-boundary.js';
import {createAutomaticReportDeliveryDriver} from '../src/services/automatic-report-delivery-driver.js';
import {createDeliverySlot,claimDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';
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
const busy=e=>e?.code==='55P03'||e?.meta?.code==='55P03'||e?.code==='REPORT_DISPATCH_BUSY';
const names=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload'];
const selected={companyId:'c',storeId:'s'};
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Legacy report fixture barrier timed out')),10000)})])}finally{clearTimeout(timer)}}
test('legacy lifecycle native fixture is restricted to isolated CI database',()=>{
 for(const url of ['postgresql://u:p@production.example/report_test','postgresql://u:p@localhost/live','postgresql://u:p@localhost/report_test?host=production.example','postgresql://u:p@localhost/report_test?options=-csearch_path%3Dpublic','postgresql://u:p@localhost/report_test?schema=public&schema=x'])assert.equal(isolated(url,'test'),false);
 assert.equal(isolated('postgresql://u:p@localhost/myworkstation_test?schema=public','test'),true);
 if(process.env.CI)assert.ok(isolated(),'legacy lifecycle native subcases must execute in CI');
});
test('native legacy-zero lifecycle boundary excludes enrollment and DDL without provisioning guards',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='report_legacy_'+randomBytes(12).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const fenceDDL='CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint DEFAULT 0,"maintenance" boolean DEFAULT false,"retired" boolean DEFAULT false)';
 const transaction=(db,fn)=>db.$transaction(fn,{isolationLevel:'ReadCommitted',timeout:15000,maxWait:5000});
 const blocked=sql=>assert.rejects(transaction(b,async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");await tx.$executeRawUnsafe(sql)}),busy);
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await a.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"name" text)');
  await a.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Synthetic'),('other','other','Unchanged')`);
  await a.$executeRawUnsafe('CREATE TABLE "FinancialChild"("id" text PRIMARY KEY,"storeId" text REFERENCES "Store"("id"),"amount" integer)');
  for(const name of names)await a.$executeRawUnsafe(`CREATE TABLE "${name}"("id" text)`);
  await a.$executeRawUnsafe('CREATE TABLE "AutomaticReportDeliverySlot"("slotId" text PRIMARY KEY,"companyId" text,"storeId" text,"version" bigint,"status" text,"token" text,"record" jsonb)');
  await a.$executeRawUnsafe(`CREATE FUNCTION report_fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$`);
  await t.test('absent Fence remains absent; Store SHARE permits real FK insert but excludes Store DML and trigger DDL',async()=>{
   await transaction(a,async tx=>{
    const state=await lockAutomaticReportBoundary(tx,{...selected,expectedGeneration:undefined});assert.equal(state.generation,'0');assert.equal(state.enrolled,false);
    await b.$executeRawUnsafe(`INSERT INTO "FinancialChild" VALUES('fk','s',123)`);
    await blocked(`UPDATE "Store" SET "name"='changed' WHERE "id"='s'`);
    await blocked('CREATE TRIGGER store_probe BEFORE INSERT ON "Store" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()');
   });
   assert.equal((await a.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS value`))[0].value,null);
  });
  await t.test('uncommitted new Fence cannot enroll atomically before Store trigger installation',async()=>{
   await transaction(a,async tx=>{
    await lockAutomaticReportBoundary(tx,selected);
    await assert.rejects(transaction(b,async other=>{await other.$executeRawUnsafe("SET LOCAL lock_timeout='200ms'");await other.$executeRawUnsafe(fenceDDL);await other.$executeRawUnsafe('CREATE TRIGGER installer_store BEFORE INSERT ON "Store" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()');await other.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId") VALUES('s','c')`)}),busy);
   });
   assert.equal((await a.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS value`))[0].value,null);
   await transaction(b,async tx=>{await tx.$executeRawUnsafe(fenceDDL);await tx.$executeRawUnsafe('CREATE TRIGGER installer_store BEFORE INSERT ON "Store" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()');await assert.rejects(transaction(a,other=>lockAutomaticReportBoundary(other,selected)),busy)});
  });
  await t.test('existing Fence absent-row INSERT is fenced in either order and never creates authorization',async()=>{
   await transaction(a,async tx=>{const state=await lockAutomaticReportBoundary(tx,selected);assert.equal(state.enrolled,false);await blocked(`INSERT INTO "StoreLifecycleFence"("storeId","companyId") VALUES('s','c')`)});
   await transaction(b,async tx=>{await tx.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId") VALUES('s','c')`);await assert.rejects(transaction(a,other=>lockAutomaticReportBoundary(other,selected)),busy)});
   assert.equal((await transaction(a,tx=>lockAutomaticReportBoundary(tx,{...selected,expectedGeneration:'0'}))).enrolled,true);
  });
  await t.test('partial installer report DDL before Store is rejected NOWAIT and released Store permits installer completion',async()=>{
   const held=deferred(),release=deferred();let installer;
   try{
    installer=transaction(b,async tx=>{await tx.$executeRawUnsafe('CREATE TRIGGER partial_report BEFORE INSERT ON "AutomaticReportDispatchPolicy" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()');held.resolve();await bounded(release.promise);await tx.$executeRawUnsafe('CREATE TRIGGER partial_store BEFORE INSERT ON "Store" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()')});installer.catch(()=>{});
    await bounded(held.promise);await assert.rejects(transaction(a,tx=>lockAutomaticReportBoundary(tx,selected)),busy);release.resolve();await bounded(installer);
   }finally{release.resolve();if(installer)await bounded(Promise.allSettled([installer]))}
  });
  await t.test('Fence maintenance/generation writes excluded, reverse row FOR UPDATE refuses promptly',async()=>{
   await transaction(a,async tx=>{await lockAutomaticReportBoundary(tx,selected);await blocked('UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"=\'s\'');await blocked('UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"=\'s\'')});
   await transaction(b,async tx=>{await tx.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" WHERE "storeId"=\'s\' FOR UPDATE');await assert.rejects(transaction(a,other=>lockAutomaticReportBoundary(other,selected)),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE'||busy(e))});
  });
  await t.test('actual driver START keeps Store/Fence/report locks through commit, then one SMTP sees committed attempt',async()=>{
   const now='2026-10-22T12:00:00.000Z',content={format:'MWS_AUTOMATIC_CASH_PAYLOAD_V1',scope:selected,period:{from:'2026-10-21T04:00:00.000Z',to:'2026-10-22T04:00:00.000Z'},frequency:'DAILY',sourceFingerprint:'a'.repeat(64),financialFinality:'PROVISIONAL',financialLimitations:['SYNTHETIC'],financialReconciliationComplete:false,employeeLiabilityAdjusted:false,settingsVersion:1};
   const body=JSON.stringify(content),payload={format:content.format,scope:selected,period:content.period,frequency:'DAILY',sourceFingerprint:content.sourceFingerprint,financialFinality:'PROVISIONAL',financialLimitations:content.financialLimitations,contentType:'application/json; charset=utf-8',body,byteLength:Buffer.byteLength(body),payloadFingerprint:createHash('sha256').update(body).digest('hex')};
   const input={...selected,reportType:'CASH',frequency:'DAILY',periodFrom:content.period.from,periodTo:content.period.to,recipient:'synthetic@example.invalid',snapshot:{settingsVersion:1,recipientVersion:1,consentRevision:1,lifecycleGeneration:'0',sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint:'b'.repeat(64),principalId:'sa',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
   // Synthetic authorization metadata isolates the lock boundary; this is not
   // an enrollment/consent acceptance test. Repository/driver/SQL are actual.
   const current={...input,checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
   const pending=createDeliverySlot(input,{now,current}),claimed=claimDelivery(pending,{expectedVersion:1,token:'legacy-test',now,leaseMs:60000});
   await a.$executeRaw`INSERT INTO "AutomaticReportDeliverySlot" VALUES(${claimed.slotId},'c','s',${BigInt(claimed.version)},${claimed.status},${claimed.token},${JSON.stringify(claimed)}::jsonb)`;
   const held=deferred(),release=deferred();let count=0,sends=0,task;
   const db={$transaction:fn=>transaction(a,async tx=>{const result=await fn(tx);if(++count===1){held.resolve();await bounded(release.promise)}return result})};
   const driver=createAutomaticReportDeliveryDriver({db,clock:()=>now,readEligibility:async({tx,input:stored})=>{const state=await lockAutomaticReportBoundary(tx,selected);assert.equal(state.generation,stored.snapshot.lifecycleGeneration);return current},sendMail:async m=>{sends++;assert.equal((await b.$queryRaw`SELECT "status" FROM "AutomaticReportDeliverySlot"`)[0].status,'ATTEMPTING');return{accepted:[m.to],rejected:[],messageId:'<synthetic-legacy>'}}});
   try{
    task=driver.attempt({scope:{...selected,slotId:claimed.slotId},expectedVersion:claimed.version,token:claimed.token,payload});await bounded(held.promise);assert.equal(sends,0);
    await blocked(`UPDATE "Store" SET "name"='changed' WHERE "id"='s'`);await blocked(`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`);
    await blocked('CREATE TRIGGER late_report BEFORE INSERT ON "AutomaticReportPayload" FOR EACH ROW EXECUTE FUNCTION report_fixture_trigger()');
    await b.$executeRawUnsafe(`INSERT INTO "FinancialChild" VALUES('fk-start','s',456)`);release.resolve();assert.equal((await bounded(task)).outcome,'ACCEPTED');assert.equal(sends,1);
   }finally{release.resolve();if(task)await bounded(Promise.allSettled([task]))}
  });
  await t.test('original zero is never upgraded after real generation advance; fresh positive state preserved',async()=>{
   await a.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=9007199254740993 WHERE "storeId"='s'`);
   for(const expectedGeneration of [undefined,'0'])await assert.rejects(transaction(a,tx=>lockAutomaticReportBoundary(tx,{...selected,expectedGeneration})),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
   assert.equal((await transaction(a,tx=>lockAutomaticReportBoundary(tx,selected))).generation,'9007199254740993');
   assert.deepEqual(await a.$queryRawUnsafe('SELECT "name" FROM "Store" WHERE "id"=\'other\''),[{name:'Unchanged'}]);
  });
 }finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
