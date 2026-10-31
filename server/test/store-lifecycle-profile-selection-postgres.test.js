import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {createMonthlyInventoryCaptureInstallation} from '../src/services/monthly-inventory-snapshot-installation.js';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleController} from '../src/services/store-lifecycle-controller.js';
import {lifecycleWorkerCapabilityMac} from '../src/services/store-lifecycle-worker-ready.js';

const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
const q=value=>'"'+value.replaceAll('"','""')+'"',literal=value=>"'"+value.replaceAll("'","''")+"'";
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const profileKey='MWS_STORE_LIFECYCLE_PROFILE',full='MONTHLY_INVENTORY_CAPTURE_V1',revision='d'.repeat(40),secret='isolated-native-profile-signing-secret';
const scope={companyId:'fixture-company',storeId:'target'},actor={id:'synthetic-admin',isSuperAdmin:true};
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};

async function database(){
 assert.ok(isolated(),'Actual isolated PostgreSQL required');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='profile_'+randomBytes(10).toString('hex')+'_test';
 await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;const db=new PrismaClient({datasourceUrl:url.href});
 return{db,url:url.href,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect()}};
}

async function fullSchema(db){
 for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
 await db.$executeRawUnsafe('CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE');
 for(const table of new Set(metadata.columns.map(c=>c.table)))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
 for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
 for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
 for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
 for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
 await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);
 await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
 await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
 await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('shared','fixture-company','SYNTHETIC'),('foreign','foreign-company','CONTROL')`);
 for(const[store,product]of[['target','shared'],['sibling','shared'],['foreign','foreign']])await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ($1,$2,$3,12.3456)`,store+'-stock',store,product);
}

async function protectedRows(db){
 const tables=await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname=current_schema() AND tablename<>'StoreLifecycleRuntime' ORDER BY tablename`);
 return db.$queryRawUnsafe(tables.map(t=>`SELECT ${literal(t.name)} AS table_name,row_to_json(t)::text AS row FROM ${q(t.name)} t`).join(' UNION ALL ')+' ORDER BY table_name,row');
}

// Only S3 policy responses are stubbed. All worker SQL, signing and leases use
// the real isolated database. A claimed queue case deliberately stops before
// pg_dump; it is not represented as a completed archive or recovery proof.
function runWorker(f,profile){
 const script=`import sys,json\nsys.path.insert(0,sys.argv[1])\nimport worker\nclass BeforeBackup(Exception): pass\noriginal_run=worker.run\ndef run(args,**kwargs):\n if args[0]=='pg_dump': raise BeforeBackup()\n return original_run(args,**kwargs)\ndef s3(command,*args):\n if command=='get-bucket-versioning': return {'Status':'Enabled'}\n if command=='get-bucket-encryption': return {}\n raise AssertionError('No archive storage action authorized')\ndef restore(*args): raise AssertionError('No restore authorized in queue fixture')\nworker.run=run\nworker.s3=s3\nworker.verify_archive=restore\ntry:\n result=worker.process_one(worker.selected_manifest_file(), 'unused-auditor')\nexcept BeforeBackup:\n result={'state':'STOPPED_BEFORE_BACKUP'}\nprint(json.dumps(result))`;
 const env={...process.env,DATABASE_URL:f.url,AWS_REGION:'isolated',S3_BUCKET_NAME:'isolated',S3_ENDPOINT_URL:'http://invalid.fixture',BACKUP_MONITOR_SECRET:secret,RENDER_GIT_COMMIT:revision};
 profile===undefined?delete env[profileKey]:env[profileKey]=profile;
 const run=spawnSync('python3',['-c',script,path.resolve('../ops/backup/lifecycle')],{env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
}

test('native full-profile controller validates installed schema and actual Python signed capability without enabling execution',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:240000
},async()=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const f=await database(),saved=process.env[profileKey],execution=process.env.STORE_LIFECYCLE_EXECUTION_ENABLED;
 try{
  await fullSchema(f.db);
  const installer=createMonthlyInventoryCaptureInstallation(f.db,{sourceRevision:revision,enabled:true});
  const inspection=await installer.inspect(actor,scope);await installer.install(actor,{...scope,packet:inspection.packet});
  const before=await protectedRows(f.db);
  process.env[profileKey]=full;delete process.env.STORE_LIFECYCLE_EXECUTION_ENABLED;
  assert.deepEqual(runWorker(f,full),{state:'IDLE'});
  const controller=createLifecycleController(f.db,{sourceRevision:revision,enabled:()=>true,secret:()=>secret});
  const ready=await controller.inspect(actor,scope);assert.equal(ready.planHash,hash(selectedStoreLifecycleManifest()));assert.equal(ready.guardsInstalled,true);assert.equal(ready.executionAvailable,true);assert.equal(ready.activeOperationId,null);
  const off=createLifecycleController(f.db,{sourceRevision:revision,secret:()=>secret});assert.equal((await off.inspect(actor,scope)).executionAvailable,false);
  const original=(await f.db.$queryRawUnsafe(`SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"='backup-worker'`))[0];
  const genuine=JSON.parse(original.heartbeatJson);assert.equal(genuine.workerRevision,revision);assert.equal(genuine.manifestHash,ready.planHash);
  const variants=[{...genuine,manifestHash:hash(reviewedFreshStoreManifest())},{...genuine,checkedAt:new Date(Date.now()-13*60000).toISOString()}];
  for(const value of variants){const json=JSON.stringify(value);await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"='backup-worker'`,json,lifecycleWorkerCapabilityMac(secret,json));assert.equal((await controller.inspect(actor,scope)).executionAvailable,false)}
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"='backup-worker'`,original.heartbeatJson,'0'.repeat(64));assert.equal((await controller.inspect(actor,scope)).executionAvailable,false);
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"='backup-worker'`,original.heartbeatJson,original.mac);assert.equal((await controller.inspect(actor,scope)).executionAvailable,true);
  process.env[profileKey]='BASE';const base=createLifecycleController(f.db,{sourceRevision:revision,enabled:()=>true,secret:()=>secret});await assert.rejects(base.inspect(actor,scope),'BASE cannot accept an extended schema');
  assert.deepEqual(await protectedRows(f.db),before,'schema inspection/readiness cannot change enrollment, grants, snapshots or business/control rows');
 }finally{saved===undefined?delete process.env[profileKey]:process.env[profileKey]=saved;execution===undefined?delete process.env.STORE_LIFECYCLE_EXECUTION_ENABLED:process.env.STORE_LIFECYCLE_EXECUTION_ENABLED=execution;await f.close()}
});

test('native worker excludes older wrong-profile operations before lease and does not starve a compatible candidate',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:120000
},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');
 for(const selected of ['BASE',full])await t.test(selected,async()=>{
  const f=await database();try{
   await f.db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text NOT NULL,"maintenance" boolean NOT NULL,"retired" boolean NOT NULL,"operationId" text,"planHash" text NOT NULL)`);
   await f.db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleExecution"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL,"state" text NOT NULL,"mode" text NOT NULL,"planHash" text NOT NULL,"snapshotHash" text NOT NULL,"expiresAt" timestamptz NOT NULL,"result" jsonb)`);
   await f.db.$executeRawUnsafe(`CREATE TABLE "UntouchedControl"("id" text PRIMARY KEY,"value" text NOT NULL)`);await f.db.$executeRawUnsafe(`INSERT INTO "UntouchedControl" VALUES ('sibling','original')`);
   const selectedHash=hash(selectedStoreLifecycleManifest({[profileKey]:selected})),wrongHash=hash(selectedStoreLifecycleManifest({[profileKey]:selected==='BASE'?full:'BASE'}));
   const insert=async(store,planHash,minutes)=>{
    const operation=randomUUID(),snapshot={planHash,sourceRevision:revision,snapshotHash:'2'.repeat(64),scope:{companyId:'fixture-company',storeId:store,mode:'RESET'}},job={operationId:operation,schema:'public',snapshotMetadataJson:JSON.stringify(snapshot),schemaDescriptorJson:'{}'};
    await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES ($1,'fixture-company',true,false,$2,$3)`,store,operation,planHash);
    await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleExecution" VALUES ($1,'fixture-company',$2,'PREPARED','RESET',$3,$4,NOW()+($5::text||' minutes')::interval,$6::jsonb)`,operation,store,planHash,snapshot.snapshotHash,minutes,JSON.stringify({recoveryRequest:job}));return operation;
   };
   const wrong=await insert('wrong-profile',wrongHash,5),wrongBefore=await f.db.$queryRawUnsafe(`SELECT row_to_json(e)::text AS row FROM "StoreLifecycleExecution" e WHERE "id"=$1`,wrong);
   assert.deepEqual(runWorker(f,selected),{state:'IDLE'});assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(e)::text AS row FROM "StoreLifecycleExecution" e WHERE "id"=$1`,wrong),wrongBefore);
   const matching=await insert('matching-profile',selectedHash,8),before=(await f.db.$queryRawUnsafe(`SELECT * FROM "StoreLifecycleExecution" WHERE "id"=$1`,matching))[0];
   assert.deepEqual(runWorker(f,selected),{state:'STOPPED_BEFORE_BACKUP'});
   const after=(await f.db.$queryRawUnsafe(`SELECT *,"expiresAt">NOW() AS fresh FROM "StoreLifecycleExecution" WHERE "id"=$1`,matching))[0];
   assert.equal(after.state,'PREPARED');assert.equal(after.fresh,true);assert.deepEqual(after.result.recoveryRequest,before.result.recoveryRequest);assert.match(after.result.workerLease,/^[a-f0-9-]{36}$/);assert.ok(Date.parse(after.result.workerLeaseExpiresAt)>Date.now());assert.equal(after.result.recoveryProof,undefined);
   assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(e)::text AS row FROM "StoreLifecycleExecution" e WHERE "id"=$1`,wrong),wrongBefore,'older wrong-profile row remains byte-identical');
   assert.deepEqual(await f.db.$queryRawUnsafe('SELECT * FROM "UntouchedControl"'),[{id:'sibling',value:'original'}]);
  }finally{await f.close()}
 });
});
