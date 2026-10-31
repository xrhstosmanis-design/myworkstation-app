import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {createMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {createMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal} from '../src/services/monthly-inventory-capture-schema.js';
import {monthlyInventorySnapshotPeriod} from '../src/services/monthly-inventory-snapshot-period.js';
import {captureMonthlyInventorySnapshotForAutomation} from '../src/services/monthly-inventory-snapshot-capture.js';
import {createMonthlyInventorySnapshotRepository} from '../src/services/monthly-inventory-snapshot-repository.js';
import {buildMonthlyInventorySnapshotCandidate as build,serializeMonthlyInventorySnapshotCandidate as serialize} from '../src/services/monthly-inventory-snapshot-payload.js';
import * as authorization from '../src/services/monthly-inventory-capture-authorization.js';
import {createMonthlyInventoryCaptureJobs} from '../src/services/monthly-inventory-capture-jobs.js';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url))),q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'",revision='a'.repeat(40);

const fixed={type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1'};
let execution,options,token,digest,month;
const actor={id:'owner',companyId:'company',role:'OWNER',platformRole:'OWNER',isSuperAdmin:false,tokenType:'BACKOFFICE_USER',sessionId:'owner-session',sessionVersion:0},scope={companyId:'company',storeId:'store'};
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
function activate(){
 const keys=['RENDER_GIT_COMMIT','GIT_COMMIT','RENDER_SERVICE_ID','MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL'],before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.RENDER_GIT_COMMIT=revision;process.env.GIT_COMMIT=revision;process.env.RENDER_SERVICE_ID='srv-d9isenfavr4c73bdh52g';
 process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=JSON.stringify({v:1,purpose:'MONTHLY_INVENTORY_CAPTURE',serviceId:'srv-d9isenfavr4c73bdh52g',epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2000-01-01T00:00:00.000Z',notBefore:'2000-01-02T00:00:00.000Z',enabled:true});
 return ()=>{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}};
}
function dueAt(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const previous=n=>new Date(Date.UTC(+p.year,+p.month-1-n,1)).toISOString().slice(0,7);
 let due=monthlyInventorySnapshotPeriod(previous(1));if(due.scheduledFor>now)due=monthlyInventorySnapshotPeriod(previous(2));return due;
}
async function databaseNow(db){return (await db.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`))[0].now;}
async function claimedStore(f,id,client=f.db){
 const storeId='aux-'+id,grantId='grant-'+id;
 await f.db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ($1,'SYNTHETIC AUXILIARY','company',NOW())`,storeId);
 await f.core.install(f.db,{id:'synthetic-installer',isSuperAdmin:true},{companyId:'company',storeId});
 await f.db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","firstScheduledFor","createdByUserId","createdAt","grantedByUserId","grantedAt","updatedByUserId") VALUES ($1,'company',$2,'MONTHLY_INVENTORY_CAPTURE',0,true,'owner',0,'activation','2026-01','2026-02-01T05:00:00.000Z','owner','2026-01-01T00:00:00.000Z','owner','2026-01-01T00:00:00.000Z','owner')`,grantId,storeId);
 const manager=createMonthlyInventoryCaptureJobs(client,{sourceRevision:revision}),produced=await manager.produce({...fixed,grantId}),leased=await manager.claim({...fixed,jobId:produced.jobId});
 const [row]=await f.db.$queryRawUnsafe(`SELECT "issueMonth","scheduledFor","leaseExpiresAt" FROM "MonthlyInventoryCaptureJob" WHERE "id"=$1`,leased.jobId);
 return {db:client,actual:f.db,storeId,grantId,manager,execution:leased.execution,attempt:leased.attempt,jobId:leased.jobId,month:row.issueMonth,scheduledFor:new Date(row.scheduledFor).toISOString(),leaseExpiresAt:new Date(row.leaseExpiresAt).toISOString()};
}
const authOptions=lease=>({sourceRevision:revision,db:lease.db,attempt:lease.attempt});
async function factsFor(lease){
 const now=await databaseNow(lease.actual),candidate=build({companyId:'company',storeId:lease.storeId,lifecycleGeneration:'0',issueMonth:lease.month,sourceObservedAt:now,sourceRevision:revision,valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0},products:[],invoices:{period:lease.month,items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
 return {candidateJsonText:serialize(candidate),transactionStartedAt:now,sourceReadStartedAt:now,sourceReadFinishedAt:now};
}
async function shorten(lease,seconds=5){await lease.actual.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()+($2::int*INTERVAL '1 second') WHERE "id"=$1`,lease.jobId,seconds);}
const source=(f,fn)=>f.db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return fn(tx)},{isolationLevel:'RepeatableRead',timeout:30000});
const fresh=(f,fn)=>f.db.$transaction(fn,{isolationLevel:'ReadCommitted',timeout:30000});

async function renewMainClaim(f){
 const oldExecution=execution,oldOptions=options;
 await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"='job'`);
 const claimed=await createMonthlyInventoryCaptureJobs(f.db,{sourceRevision:revision}).claim({...fixed,jobId:'job'});
 execution=claimed.execution;f.attempt=claimed.attempt;token=execution.leaseToken;digest=createHash('sha256').update(token).digest('hex');options={sourceRevision:revision,db:f.db,attempt:claimed.attempt};
 f.leaseExpiresAt=new Date((await f.db.$queryRawUnsafe(`SELECT "leaseExpiresAt" FROM "MonthlyInventoryCaptureJob" WHERE "id"='job'`))[0].leaseExpiresAt).toISOString();
 await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,oldExecution,oldOptions)),{code:'MONTHLY_CAPTURE_LEASE_INVALID'});
}
const business=async f=>f.db.$queryRawUnsafe(`SELECT "id","storeId","productId","currentStock"::text AS stock FROM "StoreProduct" ORDER BY "id"`);
async function fixture(){const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_auth_'+randomBytes(10).toString('hex')+'_test';let db,other,created=false;try{assert.ok(isolated());await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe(`CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE`);
  const tables=[...new Set(metadata.columns.map(c=>c.table))];
  for(const table of tables)await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  // PG18 catalogues expose NOT NULL as separate constraints; required column
  // declarations above preserve the same reviewed type/nullability on PG16.
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`);}
  await provisionFtextRecoverySchema(db);
  await provisionAiWalletRecovery(db);
  await ensureBackofficeStaffSchema(db);

  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('store','SYNTHETIC','company',NOW()),('sibling','CONTROL','company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","role","companyId","mustChangePassword","updatedAt") VALUES ('owner','synthetic@example.invalid','NO_LOGIN','SYNTHETIC','OWNER','company',false,NOW()),('admin','admin@example.invalid','NO_LOGIN','SYNTHETIC','SUPER_ADMIN','foreign-company',false,NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('owner-session','owner',NOW()+INTERVAL '1 hour'),('admin-session','admin',NOW()+INTERVAL '1 hour')`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active","updatedAt") VALUES ('inventory','company','INVENTORY',true,NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name","salePrice","costPrice") VALUES ('product','company','SYNTHETIC',2.50,1.25)`);await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ('stock','store','product',-12.3456)`);
  await db.$transaction(async tx=>{await createMonthlyInventorySnapshotSchema(tx);await createMonthlyInventoryCaptureSchema(tx)});
  const profile=monthlyInventoryCaptureLifecycleManifestProposal(),core=createLifecycleInstallationCore(profile,{sourceRevision:revision});await core.install(db,{id:'synthetic-installer',isSuperAdmin:true},scope);

  await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","firstScheduledFor","createdByUserId","createdAt","grantedByUserId","grantedAt","updatedByUserId") VALUES ('grant','company','store','MONTHLY_INVENTORY_CAPTURE',0,true,'owner',0,'activation','2026-01','2026-02-01T05:00:00.000Z','owner','2026-01-01T00:00:00.000Z','owner','2026-01-01T00:00:00.000Z','owner')`);
  const due=dueAt(await databaseNow(db));
  await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId") VALUES ('job','company','store','MONTHLY_INVENTORY_CAPTURE',0,$1,$2::timestamptz,'grant',1,'activation')`,due.issueMonth,due.scheduledFor);
  const manager=createMonthlyInventoryCaptureJobs(db,{sourceRevision:revision}),produced=await manager.produce({...fixed,grantId:'grant'});assert.equal(produced.jobId,'job');
  const claimed=await manager.claim({...fixed,jobId:'job'});
  execution=claimed.execution;token=execution.leaseToken;digest=createHash('sha256').update(token).digest('hex');month=due.issueMonth;options={sourceRevision:revision,db,attempt:claimed.attempt};
  const [row]=await db.$queryRawUnsafe(`SELECT "leaseExpiresAt" FROM "MonthlyInventoryCaptureJob" WHERE "id"='job'`);
  return {db,other,core,attempt:claimed.attempt,leaseExpiresAt:new Date(row.leaseExpiresAt).toISOString(),close:async()=>{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH(FORCE)`);await admin.$disconnect()}};
 }catch(e){await db?.$disconnect();await other?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH(FORCE)`);await admin.$disconnect();throw e}}
test('native delegation binds genuine CLAIM attempts, current authority, opaque transactions and expiry without business mutations',{skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:300000},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL required in CI');const restore=activate();let f;
 try{
 f=await fixture();const baseline=await business(f);
 await t.test('SOURCE context is opaque and bound to exact transaction/stage, with no explicit locking or writes',async()=>{
  await source(f,async tx=>{
   const seen=[],proxy=new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{seen.push(sql);return target.$queryRawUnsafe(sql,...args)};if(key==='$executeRawUnsafe')return async()=>assert.fail('Source authorization must not execute locking SQL');const v=target[key];return typeof v==='function'?v.bind(target):v}});
   const ctx=await authorization.authorizeMonthlyCaptureSourceInTransaction(proxy,execution,options),pub=authorization.requireMonthlyCaptureContext(proxy,ctx,'SOURCE');
   assert.deepEqual(Object.keys(ctx),[]);assert.equal(Object.isFrozen(ctx),true);assert.equal(pub.companyId,'company');assert.equal(pub.month,month);assert.equal(pub.principal,null);
   assert.throws(()=>authorization.requireMonthlyCaptureContext(tx,ctx,'SOURCE'));assert.throws(()=>authorization.requireMonthlyCaptureContext(proxy,ctx,'WRITE'));assert.throws(()=>authorization.requireMonthlyCaptureContext(proxy,structuredClone(ctx),'SOURCE'));
   await authorization.finishMonthlyCaptureSourceInTransaction(proxy,ctx);assert.equal(seen.some(sql=>/FOR (SHARE|UPDATE)|LOCK TABLE|set_config/i.test(sql)),false);
  });
 });
 await t.test('fresh LOOKUP and WRITE independently mint authority and only WRITE supplies exact truthful principal',async()=>{
  let old;await fresh(f,async tx=>{old=await authorization.authorizeMonthlyCaptureLookupInTransaction(tx,execution,options);assert.equal(authorization.requireMonthlyCaptureContext(tx,old,'LOOKUP').principal,null);assert.throws(()=>authorization.monthlyCaptureWriteGuardParameters(tx,old))});
  await fresh(f,async tx=>{assert.throws(()=>authorization.requireMonthlyCaptureContext(tx,old,'LOOKUP'));const ctx=await authorization.authorizeMonthlyCaptureWriteInTransaction(tx,execution,options),pub=authorization.requireMonthlyCaptureContext(tx,ctx,'WRITE'),guard=authorization.monthlyCaptureWriteGuardParameters(tx,ctx);assert.equal(Object.keys(pub.principal).length,11);assert.equal(pub.principal.type,'SERVICE_DELEGATION');assert.equal(pub.principal.grantRevision,'1');assert.equal(guard.leaseTokenHash,digest);assert.equal(JSON.stringify(pub).includes(token),false);assert.equal(JSON.stringify(pub).includes(digest),false)});
 });
 await t.test('wrong token, source revision and current global session invalidate each actual phase',async()=>{
  for(const name of ['authorizeMonthlyCaptureSourceInTransaction','authorizeMonthlyCaptureLookupInTransaction','authorizeMonthlyCaptureWriteInTransaction']){
   const run=name.includes('Source')?source:fresh;
   await assert.rejects(run(f,tx=>authorization[name](tx,{...execution,leaseToken:'c'.repeat(64)},options)));
   await assert.rejects(run(f,tx=>authorization[name](tx,execution,{...options,sourceRevision:'c'.repeat(40)})),{code:'MONTHLY_CAPTURE_REVISION_CHANGED'});
  }
  await f.db.$executeRawUnsafe(`UPDATE "User" SET "sessionVersion"=1 WHERE "id"='owner'`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`UPDATE "User" SET "sessionVersion"=0 WHERE "id"='owner'`);
 });
 await t.test('nominal future slot refuses genuine CLAIM and cannot reuse another job attempt in any execution phase',async()=>{
  await f.db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId") VALUES ('future-job','company','store','MONTHLY_INVENTORY_CAPTURE',0,'2099-01','2099-02-01T05:00:00.000Z','grant',1,'activation')`);
  await assert.rejects(createMonthlyInventoryCaptureJobs(f.db,{sourceRevision:revision}).claim({...fixed,jobId:'future-job'}),{code:'MONTHLY_CAPTURE_BEFORE_DUE'});
  for(const name of ['authorizeMonthlyCaptureSourceInTransaction','authorizeMonthlyCaptureLookupInTransaction','authorizeMonthlyCaptureWriteInTransaction']){
   const run=name.includes('Source')?source:fresh;await assert.rejects(run(f,tx=>authorization[name](tx,{...execution,jobId:'future-job'},options)),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
  }
  await f.db.$executeRawUnsafe(`DELETE FROM "MonthlyInventoryCaptureJob" WHERE "id"='future-job'`);
 });
 await t.test('browser logout blocks MANAGEMENT but deliberately does not revoke background delegation',async()=>{
  await fresh(f,async tx=>{const ctx=await authorization.authorizeMonthlyCaptureGrantManagementInTransaction(tx,actor,scope);assert.equal(authorization.requireMonthlyCaptureContext(tx,ctx,'MANAGEMENT').actorId,'owner')});
  await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "revokedAt"=clock_timestamp() WHERE "id"='owner-session'`);await assert.rejects(fresh(f,tx=>authorization.authorizeMonthlyCaptureGrantManagementInTransaction(tx,actor,scope)));
  await source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options));
  await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "revokedAt"=NULL,"expiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"='owner-session'`);await assert.rejects(fresh(f,tx=>authorization.authorizeMonthlyCaptureGrantManagementInTransaction(tx,actor,scope)));
  await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '1 hour' WHERE "id"='owner-session'`);
 });
 await t.test('current role/password/home/target/module licence and absent-override phantom writers are enforced',async()=>{
  for(const [alter,restore]of [[`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`,`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`],[`UPDATE "User" SET "mustChangePassword"=true WHERE "id"='owner'`,`UPDATE "User" SET "mustChangePassword"=false WHERE "id"='owner'`],[`UPDATE "Company" SET "active"=false WHERE "id"='company'`,`UPDATE "Company" SET "active"=true WHERE "id"='company'`],[`UPDATE "CompanyModule" SET "active"=false WHERE "id"='inventory'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='inventory'`]]){
   await f.db.$executeRawUnsafe(alter);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(restore);
  }
  await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "startsAt"='infinity' WHERE "id"='inventory'`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "startsAt"=NULL WHERE "id"='inventory'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "StorePaidModule"("id","companyId","storeId","moduleKey","active","startsAt","updatedAt") VALUES ('invalid-window','company','store','INVENTORY',true,'infinity',NOW())`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`DELETE FROM "StorePaidModule" WHERE "id"='invalid-window'`);
  await fresh(f,async tx=>{await authorization.authorizeMonthlyCaptureWriteInTransaction(tx,execution,options);await assert.rejects(f.other.$transaction(async concurrent=>{await concurrent.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");await concurrent.$executeRawUnsafe(`INSERT INTO "StorePaidModule"("id","companyId","storeId","moduleKey","active","updatedAt") VALUES ('phantom','company','store','INVENTORY',false,NOW())`)},{timeout:5000}))});
  assert.equal((await f.db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "StorePaidModule" WHERE "id"='phantom'`))[0].count,0);
 });
 await t.test('actual cross-company owner access and inactive home company are rechecked; masked SA management still requires target Inventory',async()=>{
  await f.db.$executeRawUnsafe(`UPDATE "User" SET "companyId"='foreign-company' WHERE "id"='owner'`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));
  await f.db.$executeRawUnsafe(`INSERT INTO "OwnerCompanyAccess"("ownerId","companyId") VALUES ('owner','company')`);await source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options));
  await f.db.$executeRawUnsafe(`UPDATE "Company" SET "active"=false WHERE "id"='foreign-company'`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`UPDATE "Company" SET "active"=true WHERE "id"='foreign-company'`);
  await f.db.$executeRawUnsafe(`DELETE FROM "OwnerCompanyAccess" WHERE "ownerId"='owner' AND "companyId"='company'`);await f.db.$executeRawUnsafe(`UPDATE "User" SET "companyId"='company' WHERE "id"='owner'`);
  const sa={...actor,id:'admin',role:'OWNER',platformRole:'SUPER_ADMIN',isSuperAdmin:true,sessionId:'admin-session'};
  await fresh(f,tx=>authorization.authorizeMonthlyCaptureGrantManagementInTransaction(tx,sa,scope));
  await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=false WHERE "id"='inventory'`);await assert.rejects(fresh(f,tx=>authorization.authorizeMonthlyCaptureGrantManagementInTransaction(tx,sa,scope)));await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=true WHERE "id"='inventory'`);
 });
 await t.test('source completion uses actual advancing DB clock and refuses a lease expiring after admission',async()=>{
  await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()+INTERVAL '3 seconds' WHERE "id"='job'`);
  let admitted=false;await assert.rejects(source(f,async tx=>{const ctx=await authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options);admitted=true;await tx.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(3.2)');await authorization.finishMonthlyCaptureSourceInTransaction(tx,ctx)}),{code:'MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED'});
  assert.equal(admitted,true,'source must be admitted before the lease expires');await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=$1::timestamptz WHERE "id"='job'`,f.leaseExpiresAt);
 });
 await t.test('lease replacement and lifecycle maintenance are rejected without upgrading original scope',async()=>{
  await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseTokenHash"=$1 WHERE "id"='job'`,'c'.repeat(64));await assert.rejects(fresh(f,tx=>authorization.authorizeMonthlyCaptureWriteInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseTokenHash"=$1 WHERE "id"='job'`,digest);
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='store'`);await assert.rejects(source(f,tx=>authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options)));await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='store'`);
 });
 await t.test('actual conditional snapshot INSERT refuses lease and entitlement expiry after WRITE admission',async()=>{
  for(const kind of ['lease','entitlement','lease-winner']){
   let reached=false,winner=null,lease,facts;
   const delayed={$transaction:(fn,opts)=>f.db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{if(sql.includes('INSERT INTO "MonthlyInventorySnapshot"')){reached=true;if(kind==='lease-winner')winner=await createMonthlyInventorySnapshotRepository(f.other,{sourceRevision:revision}).store(actor,facts);await target.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(5.2)')}return target.$queryRawUnsafe(sql,...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}})),opts)};
   lease=await claimedStore(f,'expiry-'+kind,delayed);
   if(kind!=='entitlement')await shorten(lease);else await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '5 seconds' WHERE "id"='inventory'`);
   facts=await factsFor(lease);
   try{
    await assert.rejects(createMonthlyInventorySnapshotRepository(delayed,{sourceRevision:revision,attempt:lease.attempt}).storeAutomation(lease.execution,facts),{code:'MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED'});
    assert.equal(reached,true,'actual immutable snapshot INSERT must be reached after genuine CLAIM and WRITE admission');
    const rows=await f.db.$queryRawUnsafe(`SELECT "id","candidateJsonText","capturePrincipal" FROM "MonthlyInventorySnapshot" WHERE "storeId"=$1`,lease.storeId);
    assert.equal(rows.length,kind==='lease-winner'?1:0);
    if(kind==='lease-winner'){assert.equal(winner.status,'STORED');assert.equal(rows[0].id,winner.id);assert.equal(rows[0].candidateJsonText,facts.candidateJsonText);assert.equal(rows[0].capturePrincipal.type,'BACKOFFICE_USER')}
   }finally{await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='inventory'`)}
  }
 });
 await t.test('real typed coordinator captures complete C2 pending and signed stock once, then replays original principal without rereading unavailable Product',async()=>{
  await renewMainClaim(f);
  await assert.rejects(captureMonthlyInventorySnapshotForAutomation(f.db,execution));
  const first=await captureMonthlyInventorySnapshotForAutomation(f.db,execution,f.attempt);
  assert.equal(first.status,'STORED');assert.equal(first.sourceReadPerformed,true);assert.equal(first.newlyReadCandidateStored,true);assert.equal(first.receipt.sourceAuthenticityVerified,false);
  const receipt=first.receipt,principal=receipt.capturePrincipal,candidate=JSON.parse(receipt.candidateJsonText);
  assert.equal(Object.keys(principal).length,11);assert.deepEqual(principal,{type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1',delegatorUserId:'owner',delegatorSessionVersion:0,grantId:'grant',grantRevision:'1',jobId:'job',lifecycleGeneration:'0',authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'});
  assert.equal(candidate.companyId,'company');assert.equal(candidate.storeId,'store');assert.equal(candidate.lifecycleGeneration,'0');assert.equal(candidate.period.issueMonth,month);assert.equal(candidate.sourceRevision,revision);assert.deepEqual(candidate.coverage,{complete:true,productCount:1,invoiceCount:0,pendingOriginalCount:0});
  assert.equal(candidate.products[0].id,'product');assert.equal(candidate.products[0].quantity,'-12.3456');assert.equal(candidate.products[0].retailUnitPrice,'2.5');assert.equal(candidate.products[0].purchaseUnitCost,'1.25');assert.equal(candidate.products[0].retailValue,'-30.864');assert.equal(candidate.products[0].purchaseValue,'-15.432');assert.equal(receipt.sourceHash,candidate.sourceHash);assert.equal(receipt.payloadHash,candidate.payloadHash);assert.equal(receipt.storedBytesSha256,createHash('sha256').update(receipt.candidateJsonText).digest('hex'));
  const [storedBefore]=await f.db.$queryRawUnsafe(`SELECT "candidateJsonText","capturePrincipal" FROM "MonthlyInventorySnapshot" WHERE "id"=$1`,receipt.id);
  await f.db.$executeRawUnsafe('ALTER TABLE "Product" RENAME TO "ProductTemporarilyUnavailable"');
  try{
   const replay=await captureMonthlyInventorySnapshotForAutomation(f.db,execution,f.attempt);assert.equal(replay.status,'ALREADY_CAPTURED');assert.equal(replay.sourceReadPerformed,false);assert.equal(replay.newlyReadCandidateStored,false);assert.equal(replay.receipt.id,receipt.id);assert.equal(replay.receipt.candidateJsonText,receipt.candidateJsonText);assert.deepEqual(replay.receipt.capturePrincipal,principal);assert.deepEqual(replay.receipt.sourceCoverage,receipt.sourceCoverage);
   const personal=await createMonthlyInventorySnapshotRepository(f.db).findExisting(actor,{storeId:'store',month,lifecycleGeneration:'0'});assert.equal(personal.status,'ALREADY_CAPTURED');assert.equal(personal.id,receipt.id);assert.equal(personal.candidateJsonText,receipt.candidateJsonText);assert.equal(Object.hasOwn(personal,'capturePrincipal'),false);
  }finally{await f.db.$executeRawUnsafe('ALTER TABLE "ProductTemporarilyUnavailable" RENAME TO "Product"')}
  const [storedAfter]=await f.db.$queryRawUnsafe(`SELECT "candidateJsonText","capturePrincipal" FROM "MonthlyInventorySnapshot" WHERE "id"=$1`,receipt.id);assert.deepEqual(storedAfter,storedBefore);
 });
 await t.test('actual unique-index wait crossing lease expiry rolls back the typed insert after the conflicting personal writer rolls back',async()=>{
  const lease=await claimedStore(f,'unique-wait'),facts=await factsFor(lease);await shorten(lease);
  const original=await f.db.$queryRawUnsafe(`SELECT "id","candidateJsonText","capturePrincipal" FROM "MonthlyInventorySnapshot" ORDER BY "id"`),origin=await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j WHERE "id"=$1`,lease.jobId);
  let enter,release;const entered=new Promise(resolve=>{enter=resolve}),held=new Promise(resolve=>{release=resolve});
  const personalDb={$transaction:(fn,opts)=>f.other.$transaction(async tx=>{const result=await fn(tx);enter(result);await held;throw new Error('SYNTHETIC_PERSONAL_UNIQUE_WAIT_ROLLBACK')},opts)};
  const personalPromise=createMonthlyInventorySnapshotRepository(personalDb,{sourceRevision:revision}).store(actor,facts),personalResult=personalPromise.then(value=>({value}),error=>({error}));
  let typedResult,failure;
  try{
   const winner=await Promise.race([entered,personalResult.then(result=>{if(result.error)throw result.error;return result.value})]);assert.equal(winner.status,'STORED');
   typedResult=createMonthlyInventorySnapshotRepository(f.db,{sourceRevision:revision,attempt:lease.attempt}).storeAutomation(lease.execution,facts).then(value=>({value}),error=>({error}));
   let blocked=false;const deadline=Date.now()+4500;
   while(Date.now()<deadline){const [state]=await f.other.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO "MonthlyInventorySnapshot"%') AS blocked`);if(state.blocked){blocked=true;break}await new Promise(resolve=>setTimeout(resolve,25))}
   assert.equal(blocked,true,'typed SQL must actually wait on the uncommitted unique-slot conflict');await f.other.$queryRawUnsafe('SELECT 1 AS waited FROM pg_sleep(5.2)');
   const [expired]=await f.other.$queryRawUnsafe(`SELECT clock_timestamp()>"leaseExpiresAt" AS expired FROM "MonthlyInventoryCaptureJob" WHERE "id"=$1`,lease.jobId);assert.equal(expired.expired,true);
  }catch(error){failure=error}finally{release()}
  const personal=await personalResult,typed=typedResult?await typedResult:null;if(failure)throw failure;
  assert.match(personal.error?.message??'',/SYNTHETIC_PERSONAL_UNIQUE_WAIT_ROLLBACK/);assert.equal(typed.error?.code,'MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');assert.equal(typed.value,undefined);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "MonthlyInventorySnapshot" WHERE "storeId"=$1`,lease.storeId))[0].count,0);
  assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT "id","candidateJsonText","capturePrincipal" FROM "MonthlyInventorySnapshot" ORDER BY "id"`),original);assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j WHERE "id"=$1`,lease.jobId),origin);
 });
 await t.test('PRODUCER and CLAIM are closed opaque admissions, never a fabricated leased SOURCE context',async()=>{
  await fresh(f,async tx=>{
   const ctx=await authorization.authorizeMonthlyCaptureProducerInTransaction(tx,{...fixed,grantId:'grant'},{sourceRevision:revision,db:f.db}),pub=authorization.requireMonthlyCaptureContext(tx,ctx,'PRODUCER',f.db);
   assert.equal(pub.month,month);assert.equal(pub.principal,null);assert.deepEqual(Object.keys(ctx),[]);assert.throws(()=>authorization.requireMonthlyCaptureContext(tx,ctx,'SOURCE'));
   assert.throws(()=>authorization.monthlyCaptureLeaseClaimGuardParameters(tx,ctx));
   await authorization.finishMonthlyCaptureMutationInTransaction(tx,ctx);
  });
  await assert.rejects(fresh(f,tx=>authorization.authorizeMonthlyCaptureProducerInTransaction(tx,{...fixed,grantId:'grant',companyId:'foreign'},{sourceRevision:revision,db:f.db})),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
  await assert.rejects(createMonthlyInventoryCaptureJobs(f.db,{sourceRevision:revision}).claim({...fixed,jobId:'job'}),{code:'MONTHLY_CAPTURE_JOB_NOT_CLAIMABLE'});
 });
 await t.test('opaque CLAIM attempts bind DB, token and observed process control; OFF or changed ON epoch cannot revive old work',async()=>{
  const lease=await claimedStore(f,'control'),saved=process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL;
  assert.equal(authorization.requireMonthlyCaptureAttempt(f.db,lease.execution,lease.attempt).jobId,lease.jobId);
  assert.deepEqual(Object.keys(lease.attempt),[]);assert.equal(Object.isFrozen(lease.attempt),true);assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,lease.execution,structuredClone(lease.attempt)),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
  assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.other,lease.execution,lease.attempt),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
  try{
   process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=JSON.stringify({...JSON.parse(saved),enabled:false});
   assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,lease.execution,lease.attempt),{code:'MONTHLY_CAPTURE_OFF'});
  }finally{process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=saved}
  assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,lease.execution,lease.attempt),{code:'MONTHLY_CAPTURE_ATTEMPT_INVALIDATED'});
  await lease.actual.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1`,lease.jobId);
  const second=await lease.manager.claim({...fixed,jobId:lease.jobId});assert.equal(second.attemptNumber,2);
  try{
   process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=JSON.stringify({...JSON.parse(saved),epoch:'22222222-2222-4222-8222-222222222222'});
   assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,second.execution,second.attempt),{code:'MONTHLY_CAPTURE_CONTROL_CHANGED'});
  }finally{process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=saved}
  assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,second.execution,second.attempt),{code:'MONTHLY_CAPTURE_ATTEMPT_INVALIDATED'});
  await lease.actual.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1`,lease.jobId);
  const third=await lease.manager.claim({...fixed,jobId:lease.jobId}),previous=process.env.RENDER_GIT_COMMIT;
  try{process.env.RENDER_GIT_COMMIT='c'.repeat(40);assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,third.execution,third.attempt),{code:'MONTHLY_CAPTURE_REVISION_CHANGED'})}finally{process.env.RENDER_GIT_COMMIT=previous}
  assert.throws(()=>authorization.requireMonthlyCaptureAttempt(f.db,third.execution,third.attempt),{code:'MONTHLY_CAPTURE_ATTEMPT_INVALIDATED'});
 });
 await t.test('global enable-after-due with an old active grant waits for the next eligible nominal slot',async()=>{
  const lease=await claimedStore(f,'activation-bound'),saved=process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL,now=await databaseNow(f.db);
  const raw={...JSON.parse(saved),epoch:'33333333-3333-4333-8333-333333333333',issuedAt:new Date(Date.parse(now)-2000).toISOString(),notBefore:new Date(Date.parse(now)-1000).toISOString()};
  try{
   process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=JSON.stringify(raw);
   assert.ok(lease.scheduledFor<raw.notBefore);
   await assert.rejects(lease.manager.produce({...fixed,grantId:lease.grantId}),{code:'MONTHLY_CAPTURE_BEFORE_ELIGIBLE_SLOT'});
  }finally{process.env.MWS_MONTHLY_INVENTORY_CAPTURE_CONTROL=saved}
 });
 await t.test('older PENDING and live LEASED slots cannot become historical captures or bypass the one-store lease boundary',async()=>{
  const lease=await claimedStore(f,'old-slot'),due=new Date(lease.month+'-01T00:00:00.000Z'),oldMonth=new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()-1,1)).toISOString().slice(0,7),oldSlot=monthlyInventorySnapshotPeriod(oldMonth);
  await f.db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureJob"("id","companyId","storeId","purpose","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId") VALUES ('old-slot-job','company',$1,'MONTHLY_INVENTORY_CAPTURE',0,$2,$3::timestamptz,$4,1,'activation')`,lease.storeId,oldMonth,oldSlot.scheduledFor,lease.grantId);
  const before=await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j WHERE "id"='old-slot-job'`);
  await assert.rejects(lease.manager.claim({...fixed,jobId:'old-slot-job'}),{code:'MONTHLY_CAPTURE_NOT_LATEST_DUE'});
  assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(j)::text AS row FROM "MonthlyInventoryCaptureJob" j WHERE "id"='old-slot-job'`),before);
  await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "status"='LEASED',"attempt"=1,"leaseTokenHash"=$1,"leaseExpiresAt"=clock_timestamp()+INTERVAL '60 seconds',"claimedSourceRevision"=$2 WHERE "id"='old-slot-job'`,'e'.repeat(64),revision);
  await f.db.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureJob" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1`,lease.jobId);
  await assert.rejects(lease.manager.claim({...fixed,jobId:lease.jobId}),{code:'MONTHLY_CAPTURE_STORE_ALREADY_LEASED'});
 });
 await t.test('SETTLEMENT context is exact-DB/transaction bound and cannot certify a caller supplied success state',async()=>{
  await renewMainClaim(f);
  await fresh(f,async tx=>{
   const ctx=await authorization.authorizeMonthlyCaptureSettlementInTransaction(tx,execution,options),pub=authorization.requireMonthlyCaptureContext(tx,ctx,'SETTLEMENT',f.db);
   assert.equal(pub.jobId,'job');assert.equal(pub.principal,null);assert.throws(()=>authorization.requireMonthlyCaptureContext(tx,ctx,'SETTLEMENT'));assert.throws(()=>authorization.requireMonthlyCaptureContext(tx,ctx,'SETTLEMENT',f.other));
   const receipt=await createMonthlyInventorySnapshotRepository(f.db,{sourceRevision:revision,attempt:f.attempt}).findExistingForMonthlySettlementInTransaction(tx,ctx);assert.equal(receipt.issueMonth,month);
   await assert.rejects(authorization.finishMonthlyCaptureMutationInTransaction(tx,ctx,{status:'SUCCEEDED',holdReason:null,nextAttemptAt:null}),{code:'MONTHLY_CAPTURE_TRANSITION_INVALID'});
  });
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "status" FROM "MonthlyInventoryCaptureJob" WHERE "id"='job'`))[0].status,'LEASED');
 });

 await t.test('runtime revision changes around actual producer and claim final queries roll back admitted mutations',async()=>{
  for(const mode of ['producer-after-final','claim-before-final','claim-after-final']){
   let updateSeen=false,hit=false;const saved=process.env.RENDER_GIT_COMMIT,storeId='aux-runtime-'+mode;
   const wrapped={$transaction:(fn,opts)=>f.db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{
    const result=await target.$queryRawUnsafe(sql,...args);
    const update=sql.includes('UPDATE "MonthlyInventoryCaptureJob" j SET "status"=')&&sql.includes("'LEASED'");
    if(update)updateSeen=true;
    const final=sql.includes('LEFT JOIN "MonthlyInventoryCaptureJob" j')&&sql.includes(' AS snapshot ');
    if(mode==='producer-after-final'&&final&&!updateSeen||mode==='claim-before-final'&&update||mode==='claim-after-final'&&final&&updateSeen){hit=true;process.env.RENDER_GIT_COMMIT='d'.repeat(40)}
    return result;
   };const value=target[key];return typeof value==='function'?value.bind(target):value}})),opts)};
   try{
    await assert.rejects(claimedStore(f,'runtime-'+mode,wrapped),{code:'MONTHLY_CAPTURE_REVISION_CHANGED'});
    assert.equal(hit,true,'actual intended SQL boundary must be observed before the revision changes');
   }finally{process.env.RENDER_GIT_COMMIT=saved}
   const rows=await f.db.$queryRawUnsafe(`SELECT "status","attempt","leaseTokenHash","leaseExpiresAt","claimedSourceRevision" FROM "MonthlyInventoryCaptureJob" WHERE "storeId"=$1`,storeId);
   if(mode==='producer-after-final')assert.deepEqual(rows,[]);
   else assert.deepEqual(rows,[{status:'PENDING',attempt:0,leaseTokenHash:null,leaseExpiresAt:null,claimedSourceRevision:null}]);
  }
 });
 await t.test('held source snapshot remains truthful while fresh write rejects a grant revoked after its read',async()=>{
  await source(f,async tx=>{const ctx=await authorization.authorizeMonthlyCaptureSourceInTransaction(tx,execution,options);await f.other.$executeRawUnsafe(`UPDATE "MonthlyInventoryCaptureGrant" SET "active"=false,"revision"="revision"+1,"revokedByUserId"='owner',"revokedAt"=clock_timestamp(),"updatedByUserId"='owner',"updatedAt"=clock_timestamp() WHERE "id"='grant'`);await authorization.finishMonthlyCaptureSourceInTransaction(tx,ctx)});
  for(const name of ['authorizeMonthlyCaptureSourceInTransaction','authorizeMonthlyCaptureLookupInTransaction','authorizeMonthlyCaptureWriteInTransaction']){
   const run=name.includes('Source')?source:fresh;await assert.rejects(run(f,tx=>authorization[name](tx,execution,options)),{code:'MONTHLY_CAPTURE_DELEGATION_STALE'});
  }
 });
 assert.deepEqual(await business(f),baseline);
 }finally{await f?.close();restore()}
});
