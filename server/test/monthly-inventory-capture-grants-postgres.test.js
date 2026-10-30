import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createMonthlyInventoryCaptureGrantManager} from '../src/services/monthly-inventory-capture-grants.js';
import {monthlyInventorySnapshotPeriod} from '../src/services/monthly-inventory-snapshot-period.js';
import {provisionMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {provisionMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal} from '../src/services/monthly-inventory-capture-schema.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';

const PURPOSE='MONTHLY_INVENTORY_CAPTURE',scope={companyId:'fixture-company',storeId:'target'},epoch={...scope,lifecycleGeneration:'0'};
const owner={id:'owner',companyId:scope.companyId,role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'owner-session',sessionVersion:0};
const owner2={...owner,id:'owner-two',sessionId:'owner-two-session'};
const admin={id:'admin',companyId:scope.companyId,role:'OWNER',isSuperAdmin:true,platformRole:'SUPER_ADMIN',tokenType:'BACKOFFICE_USER',sessionId:'admin-session',sessionVersion:0};
const q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'";
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url),'utf8'));
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
const refusing=error=>[400,403,409].includes(error.status);
const locked=error=>refusing(error)||error.code==='P2010'&&error.meta?.code==='55P03';

test('grant manager rejects unknown purpose, epoch/revision and accessor inputs without opening a database transaction',async()=>{
 let touched=0,opened=0;const manager=createMonthlyInventoryCaptureGrantManager({$transaction:()=>{opened++;assert.fail('invalid input reached transaction')}});
 for(const value of [null,{}, {...epoch,lifecycleGeneration:0}, {...epoch,now:'caller-clock'}])await assert.rejects(manager.createInactive(owner,value));
 const getter={...epoch};Object.defineProperty(getter,'storeId',{enumerable:true,get(){touched++;throw Error('must not invoke')}});await assert.rejects(manager.createInactive(owner,getter));
 const request={...epoch,grantId:'g',expectedRevision:'1',purpose:PURPOSE};
 for(const patch of [{purpose:'CASH_CONTROL'},{expectedRevision:'01'},{expectedRevision:1},{lifecycleGeneration:'9223372036854775808'},{firstIssueMonth:'2020-01'}])await assert.rejects(manager.enable(owner,{...request,...patch}));
 assert.equal(touched,0);assert.equal(opened,0);
});

async function fixture(){
 const {PrismaClient}=await import('@prisma/client'),dbName='monthly_grants_'+randomBytes(9).toString('hex')+'_test',adminDb=new PrismaClient();let db,other,created=false;
 try{
  await adminDb.$executeRawUnsafe(`CREATE DATABASE ${q(dbName)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+dbName;
  db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe(`CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE`);
  const tables=[...new Set(metadata.columns.map(c=>c.table))];
  for(const table of tables)await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>q(c.name)+' '+c.type+(c.required?' NOT NULL':'')).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
  await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);
  await provisionMonthlyInventorySnapshotSchema(db);await provisionMonthlyInventoryCaptureSchema(db);
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","licenseStatus","subscriptionEndsAt","updatedAt") VALUES ('fixture-company','SYNTHETIC','ACTIVE',NOW()+INTERVAL '1 day',NOW()),('foreign-company','FOREIGN','ACTIVE',NOW()+INTERVAL '1 day',NOW()),('platform-company','PLATFORM','ACTIVE',NOW()+INTERVAL '1 day',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","companyId","name","updatedAt") VALUES ('target','fixture-company','SYNTHETIC',NOW()),('sibling','fixture-company','CONTROL',NOW()),('foreign','foreign-company','FOREIGN',NOW())`);
  for(const [id,company,role] of [['owner','fixture-company','OWNER'],['owner-two','fixture-company','OWNER'],['admin','platform-company','SUPER_ADMIN'],['employee','fixture-company','EMPLOYEE']]){
   await db.$executeRawUnsafe(`INSERT INTO "User"("id","companyId","email","passwordHash","fullName","role","updatedAt") VALUES ($1,$2,$3,'SYNTHETIC-NOT-A-LOGIN-HASH','SYNTHETIC',$4::"UserRole",NOW())`,id,company,id+'@monthly-grants.invalid',role);
   await db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ($1,$2,NOW()+INTERVAL '1 hour')`,id+'-session',id);
  }
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active") VALUES ('fixture-inventory','fixture-company','INVENTORY',true),('foreign-inventory','foreign-company','INVENTORY',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('shared-product','fixture-company','CONTROL'),('foreign-product','foreign-company','FOREIGN')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ('target-product','target','shared-product',-12.3456),('sibling-product','sibling','shared-product',7.0001),('foreign-product','foreign','foreign-product',3.0001)`);
  for(const [store,company] of [['target','fixture-company'],['sibling','fixture-company'],['foreign','foreign-company']]){
   await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","openedBy","status") VALUES ($1,$2,$3,'admin','CLOSED')`,store+'-shift',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","type","amount","actorId","actorName") VALUES ($1,$2,$3,'SYNTHETIC',12.34,'admin','SYNTHETIC')`,store+'-payment',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total") VALUES ($1,$2,$3,12.34)`,store+'-sale',company,store);
   if(store!=='target')await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","delegatorUserId","delegatorSessionVersion","createdByUserId","updatedByUserId") VALUES ($1,$2,$3,$4,0,'admin',0,'admin','admin')`,'control-'+store,company,store,PURPOSE);
  }
  const core=createLifecycleInstallationCore(monthlyInventoryCaptureLifecycleManifestProposal(),{sourceRevision:'a'.repeat(40)});
  await core.install(db,{id:'admin',isSuperAdmin:true},scope);
  const manager=createMonthlyInventoryCaptureGrantManager(db);
  const controls=async()=>{
   const names=(await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).map(t=>t.name);
   return db.$queryRawUnsafe(names.map(table=>`SELECT ${literal(table)} AS table_name,row_to_json(t)::text AS row FROM ${q(table)} t${table==='MonthlyInventoryCaptureGrant'?` WHERE "storeId"<>'target'`:''}`).join(' UNION ALL ')+' ORDER BY table_name,row');
  };
  const countJobs=async()=>(await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventoryCaptureJob"`))[0].n;
  return {db,other,manager,controls,countJobs,close:async()=>{await db.$disconnect();await other.$disconnect();await adminDb.$executeRawUnsafe(`DROP DATABASE ${q(dbName)} WITH (FORCE)`);await adminDb.$disconnect()}};
 }catch(error){await db?.$disconnect();await other?.$disconnect();if(created)await adminDb.$executeRawUnsafe(`DROP DATABASE ${q(dbName)} WITH (FORCE)`);await adminDb.$disconnect();throw error}
}
function intercepted(db,predicate,before){return {$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{if(predicate(sql))await before(target,sql,args);return target.$queryRawUnsafe(sql,...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)}}

test('native personal monthly grants remain inactive until explicit current authorization, fence revisions and never produce jobs',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:300000
},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const f=await fixture();let initial,enabled;
 try{
  const baseline=await f.controls();
  await t.test('actual session and paid INVENTORY admit a read-only absence then one inactive grant with exact immutable origin',async()=>{
   const absent=await f.manager.read(owner,scope);assert.equal(absent.grant,null);assert.equal(absent.lifecycleGeneration,'0');
   const created=await f.manager.createInactive(owner,epoch);assert.equal(created.status,'CREATED_INACTIVE');initial=created.grant;
   assert.equal(initial.active,false);assert.equal(initial.revision,'1');assert.equal(initial.delegatorUserId,'owner');assert.equal(initial.delegatorSessionVersion,0);assert.equal(initial.activationId,null);assert.equal(initial.firstIssueMonth,null);assert.equal(initial.grantedAt,null);assert.equal(initial.revokedAt,null);assert.equal(initial.createdByUserId,'owner');
   assert.match(initial.createdAt,/\.\d{6}Z$/);assert.equal((await f.manager.createInactive(owner,epoch)).status,'ALREADY_EXISTS');assert.deepEqual((await f.manager.read(owner,scope)).grant,initial);assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('explicit purpose enable selects the first real Athens slot at or after database activation and exact replay does not rotate delegation',async()=>{
   const request={...epoch,grantId:initial.id,expectedRevision:'1',purpose:PURPOSE};const result=await f.manager.enable(owner,request);assert.equal(result.status,'ENABLED');enabled=result.grant;
   assert.equal(enabled.active,true);assert.equal(enabled.revision,'2');assert.notEqual(enabled.activationId,null);assert.equal(enabled.grantedByUserId,'owner');assert.equal(enabled.delegatorSessionVersion,0);assert.equal(enabled.createdAt,initial.createdAt);assert.equal(enabled.createdByUserId,initial.createdByUserId);assert.equal(enabled.revokedAt,null);
   const first=monthlyInventorySnapshotPeriod(enabled.firstIssueMonth);assert.equal(enabled.firstScheduledFor,first.scheduledFor.slice(0,23)+'000Z');assert.ok(enabled.firstScheduledFor>=enabled.grantedAt);
   const previousMonth=new Date(Date.parse(enabled.firstIssueMonth+'-01T00:00:00Z'));previousMonth.setUTCMonth(previousMonth.getUTCMonth()-1);assert.ok(monthlyInventorySnapshotPeriod(previousMonth.toISOString().slice(0,7)).scheduledFor.slice(0,23)+'000Z'<enabled.grantedAt);
   const replay=await f.manager.enable(owner,request);assert.equal(replay.status,'ALREADY_ENABLED');assert.deepEqual(replay.grant,enabled);assert.deepEqual((await f.manager.createInactive(owner,epoch)).grant,enabled,'create never disables or rotates an existing active grant');
   assert.deepEqual((await f.manager.enable(owner,{...request,expectedRevision:'2'})).grant,enabled);
   await assert.rejects(f.manager.enable(owner2,{...request,expectedRevision:'2'}),{code:'MONTHLY_CAPTURE_GRANT_ALREADY_ACTIVE'});assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('wrong original ID, epoch and stale CAS refuse; revoke increments revision, retains last activation and replay is exact',async()=>{
   await assert.rejects(f.manager.revoke(owner,{...epoch,grantId:randomUUID(),expectedRevision:'2'}),{code:'MONTHLY_CAPTURE_GRANT_UNAVAILABLE'});
   await assert.rejects(f.manager.revoke(owner,{...epoch,grantId:initial.id,expectedRevision:'1'}),{code:'MONTHLY_CAPTURE_GRANT_REVISION_STALE'});
   await assert.rejects(f.manager.revoke(owner,{...epoch,lifecycleGeneration:'1',grantId:initial.id,expectedRevision:'2'}),{code:'MONTHLY_CAPTURE_GRANT_GENERATION_STALE'});
   const request={...epoch,grantId:initial.id,expectedRevision:'2'},revoked=await f.manager.revoke(owner,request);assert.equal(revoked.status,'REVOKED');assert.equal(revoked.grant.revision,'3');assert.equal(revoked.grant.active,false);assert.equal(revoked.grant.revokedByUserId,'owner');assert.ok(revoked.grant.revokedAt);assert.equal(revoked.grant.activationId,enabled.activationId);assert.equal(revoked.grant.grantedAt,enabled.grantedAt);assert.equal(revoked.grant.createdAt,initial.createdAt);
   const replay=await f.manager.revoke(owner,request);assert.equal(replay.status,'ALREADY_REVOKED');assert.deepEqual(replay.grant,revoked.grant);
   const reactivated=await f.manager.enable(owner2,{...epoch,grantId:initial.id,expectedRevision:'3',purpose:PURPOSE});assert.equal(reactivated.grant.revision,'4');assert.equal(reactivated.grant.delegatorUserId,'owner-two');assert.notEqual(reactivated.grant.activationId,enabled.activationId);assert.equal(reactivated.grant.revokedAt,null);assert.equal(reactivated.grant.createdAt,initial.createdAt);
   assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('persisted role, actual UserSession/version, password status, home/scope and effective licence/module control all grant operations',async()=>{
   for(const actor of [{...owner,tokenType:'STORE_OPERATOR'},{...owner,sessionId:'not-a-session'},{...owner,sessionVersion:1},{...owner,id:'employee',sessionId:'employee-session'},{...owner,companyId:'foreign-company'}, {...owner,supportContext:{companyId:scope.companyId}}])await assert.rejects(f.manager.read(actor,scope));
   for(const [sql,undo] of [
    [`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`,`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`],
    [`UPDATE "User" SET "sessionVersion"=1 WHERE "id"='owner'`,`UPDATE "User" SET "sessionVersion"=0 WHERE "id"='owner'`],
    [`UPDATE "User" SET "mustChangePassword"=true WHERE "id"='owner'`,`UPDATE "User" SET "mustChangePassword"=false WHERE "id"='owner'`],
    [`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='owner-session'`,`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"='owner-session'`],
    [`UPDATE "Company" SET "licenseStatus"='EXPIRED' WHERE "id"='fixture-company'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='fixture-company'`],
    [`UPDATE "CompanyModule" SET "active"=false WHERE "id"='fixture-inventory'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='fixture-inventory'`]
   ]){await f.db.$executeRawUnsafe(sql);try{await assert.rejects(f.manager.read(owner,scope),refusing)}finally{await f.db.$executeRawUnsafe(undo)}}
   await assert.rejects(f.manager.read(owner,{companyId:'foreign-company',storeId:'foreign'}));await assert.rejects(f.manager.read(owner,{...scope,storeId:'sibling'}));
   assert.equal((await f.manager.read(admin,scope)).grant.id,initial.id,'A genuine SUPER_ADMIN session can manage through its masked OWNER token role');
   assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('actual generation/maintenance/retirement, grant row concurrency and absent override phantoms are fenced',async()=>{
   for(const [column,value,restore] of [['generation',1,0],['maintenance',true,false],['retired',true,false]]){
    await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET ${q(column)}=$1 WHERE "storeId"='target'`,value);try{await assert.rejects(f.manager.read(owner,scope),refusing)}finally{await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET ${q(column)}=$1 WHERE "storeId"='target'`,restore)}
   }
   const active=(await f.manager.read(owner2,scope)).grant;
   let reached,release;const entered=new Promise(r=>reached=r),resume=new Promise(r=>release=r);let interceptedOnce=false;
   const client=intercepted(f.db,sql=>sql.includes('WITH management_write')&&sql.includes('UPDATE "MonthlyInventoryCaptureGrant"'),async()=>{if(!interceptedOnce){interceptedOnce=true;reached();await resume}});
   const request={...epoch,grantId:initial.id,expectedRevision:active.revision};
   const first=createMonthlyInventoryCaptureGrantManager(client).revoke(owner2,request);await Promise.race([entered,first.then(()=>assert.fail('Expected actual management barrier'))]);
   try{
    await assert.rejects(createMonthlyInventoryCaptureGrantManager(f.other).revoke(owner2,request),locked);
    await assert.rejects(f.other.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='50ms'");await tx.$executeRawUnsafe(`INSERT INTO "StorePaidModule"("id","companyId","storeId","moduleKey","active") VALUES ('racing-override','fixture-company','target','INVENTORY',false)`)}),/lock timeout|55P03/);
    await assert.rejects(f.other.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='50ms'");await tx.$executeRawUnsafe(`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='owner-two-session'`)}),/lock timeout|55P03/);
   }finally{release()}
   assert.equal((await first).status,'REVOKED');assert.equal((await f.manager.read(owner2,scope)).grant.revision,'5');assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('session and entitlement expiry before SQL or after actual update/readback roll back the inactive grant unchanged',async()=>{
   const prior=(await f.manager.read(owner,scope)).grant;
   for(const variant of ['session','module']){
    const original=variant==='session'?(await f.db.$queryRawUnsafe(`SELECT "expiresAt" FROM "UserSession" WHERE "id"='owner-session'`))[0].expiresAt:null;
    if(variant==='session')await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"='owner-session'`);
    else await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "endsAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"='fixture-inventory'`);
    let slept=false;const client=intercepted(f.db,sql=>sql.includes('WITH management_write')&&sql.includes('UPDATE "MonthlyInventoryCaptureGrant"'),async tx=>{if(!slept){slept=true;await tx.$queryRawUnsafe(`SELECT 1 AS waited FROM pg_sleep(2.1)`)}});
    try{await assert.rejects(createMonthlyInventoryCaptureGrantManager(client).enable(owner,{...epoch,grantId:initial.id,expectedRevision:'5',purpose:PURPOSE}),{code:'MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED'});assert.equal(slept,true)}finally{
     if(variant==='session')await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"='owner-session'`,original);
     else await f.db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "endsAt"=NULL WHERE "id"='fixture-inventory'`);
    }
    assert.deepEqual((await f.manager.read(owner,scope)).grant,prior);assert.equal(await f.countJobs(),0);
   }
   // Prove that the central postcheck is still required even when the guarded
   // UPDATE actually succeeded and its validated readback already completed.
   const original=(await f.db.$queryRawUnsafe(`SELECT "expiresAt" FROM "UserSession" WHERE "id"='owner-session'`))[0].expiresAt;
   await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"='owner-session'`);
   let sawPendingUpdate=false;const delayed=intercepted(f.db,sql=>sql.startsWith('SELECT clock_timestamp()<$1::timestamptz AS valid'),async tx=>{
    const pending=(await tx.$queryRawUnsafe(`SELECT "revision"::text AS revision,"active" FROM "MonthlyInventoryCaptureGrant" WHERE "id"=$1`,initial.id))[0];
    assert.equal(pending.revision,'6');assert.equal(pending.active,true);sawPendingUpdate=true;
    await tx.$queryRawUnsafe(`SELECT 1 AS waited FROM pg_sleep(2.1)`);
   });
   try{await assert.rejects(createMonthlyInventoryCaptureGrantManager(delayed).enable(owner,{...epoch,grantId:initial.id,expectedRevision:'5',purpose:PURPOSE}),{code:'MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED'});assert.equal(sawPendingUpdate,true)}finally{await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"='owner-session'`,original)}
   assert.deepEqual((await f.manager.read(owner,scope)).grant,prior);assert.equal(await f.countJobs(),0);
   await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"='owner-session'`);
   let replayReached=false;const delayedReplay=intercepted(f.db,sql=>sql.startsWith('SELECT clock_timestamp()<$1::timestamptz AS valid'),async tx=>{replayReached=true;await tx.$queryRawUnsafe(`SELECT 1 AS waited FROM pg_sleep(2.1)`)});
   try{await assert.rejects(createMonthlyInventoryCaptureGrantManager(delayedReplay).createInactive(owner,epoch),{code:'MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED'});assert.equal(replayReached,true,'An otherwise valid ALREADY_EXISTS readback must reach the final authority check')}finally{await f.db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"='owner-session'`,original)}
   assert.deepEqual((await f.manager.read(owner,scope)).grant,prior);assert.equal(await f.countJobs(),0);
   assert.deepEqual(await f.controls(),baseline);
  });
  await t.test('changed schema and malicious cross-company tuple fail closed, never repairing or creating a background job',async()=>{
   const before=(await f.manager.read(owner,scope)).grant;
   await f.db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureGrant" ADD COLUMN "unreviewed" text');
   try{await assert.rejects(f.manager.read(owner,scope),refusing)}finally{await f.db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureGrant" DROP COLUMN "unreviewed"')}
   await f.db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureJob" RENAME TO "SavedMonthlyCaptureJob"');
   try{await assert.rejects(f.manager.createInactive(owner,epoch),refusing);assert.equal((await f.db.$queryRawUnsafe(`SELECT to_regclass('"MonthlyInventoryCaptureJob"') IS NULL AS missing`))[0].missing,true)}finally{await f.db.$executeRawUnsafe('ALTER TABLE "SavedMonthlyCaptureJob" RENAME TO "MonthlyInventoryCaptureJob"')}
   await assert.rejects(f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations',$1,true)`,JSON.stringify({target:'0'}));await tx.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","delegatorUserId","delegatorSessionVersion","createdByUserId","updatedByUserId") VALUES ('malicious','foreign-company','target',$1,0,'owner',0,'owner','owner')`,PURPOSE)}),/MONTHLY_CAPTURE_SCOPE_INVALID/);
   assert.deepEqual((await f.manager.read(owner,scope)).grant,before);assert.equal(await f.countJobs(),0);assert.deepEqual(await f.controls(),baseline);
  });
 }finally{await f.close()}
});
