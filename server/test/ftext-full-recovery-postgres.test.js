import {ensureBackofficeStaffSchema} from "../src/backoffice-staff-bootstrap.js";
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {provisionFtextRecoverySchema,assertFtextCashLifecycleApproved} from '../src/services/ftext-cash-schema.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'";
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('full ftext recovery metadata is schema only and native CI is mandatory',()=>{
 assert.equal(metadata.format,'FTEXT_FULL_SCHEMA_METADATA_NO_BUSINESS_ROWS_V1');assert.equal(metadata.serverVersion,'180004');
 assert.equal(new Set(metadata.columns.map(c=>c.table)).size,264);assert.equal(metadata.functions.length,9);assert.equal(metadata.triggers.length,11);
 assert.equal(metadata.columns.some(c=>c.identity||c.generated),false);
 if(process.env.CI)assert.equal(isolated(),true);
});

test('full reviewed native schema plus ftext verifies PG18 archive/COPY recovery, pending refusal, reset, stale work and sibling controls',{skip:!isolated(),timeout:300000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='ftext_full_'+randomBytes(10).toString('hex')+'_test',directory=await mkdtemp(path.join(tmpdir(),'ftext-full-recovery-'));
 const actor={id:'isolated-admin',isSuperAdmin:true},scope={companyId:'fixture-company',storeId:'target'},manifest=reviewedFreshStoreManifest(),revision='1'.repeat(40);
 let db,created=false,proof;
 try{
  assert.ok(isolated());await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});
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
  tables.push("BackofficeStaffAccount","BackofficeStaffGrant","BackofficeStaffAudit","BackofficeStaffLoginGuard");
  assert.doesNotThrow(()=>assertFtextCashLifecycleApproved(manifest));
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  // Synthetic security metadata must survive target RESET and archive/COPY;
  // these are non-login fixtures, never production accounts or credentials.
  await db.$executeRawUnsafe(`INSERT INTO "User" ("id","companyId","email","passwordHash","fullName","role","updatedAt") VALUES ('staff-recovery-fixture','fixture-company','staff@recovery.invalid','not-a-login-hash','SYNTHETIC STAFF','EMPLOYEE',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffAccount" ("userId","companyId","username","pinHash") VALUES ('staff-recovery-fixture','fixture-company','native.recovery.staff','not-a-login-hash')`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffGrant" ("userId","companyId","storeId","profile","capabilities") VALUES ('staff-recovery-fixture','fixture-company','target','STOCKTAKER','["inventory.read"]'::jsonb),('staff-recovery-fixture','fixture-company','sibling','STOCKTAKER','["inventory.read"]'::jsonb)`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail") VALUES ('staff-fixture-audit','fixture-company','isolated-admin','staff-recovery-fixture','FIXTURE','{}'::jsonb)`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffLoginGuard" ("key","attempts") VALUES ('synthetic-non-login-guard',2)`);
  for(const [id,store,status,method,counter] of [['cash','target','SALE_COMMITTED','CASH','1'],['card','target','SALE_COMMITTED','CARD','2'],['pending','target','DISPATCHED','CASH','3'],['sibling','sibling','SALE_COMMITTED','CARD','4'],['foreign','foreign','SALE_COMMITTED','CASH','5']])await db.$executeRawUnsafe(`INSERT INTO "FtextCashRequest"("id","companyId","storeId","terminalPos","fiscalDeviceCode","serialNumber","clientTransactionId","requestHash","settingsHash","lifecycleGeneration","sessionId","plan","checkoutJson","total","status","claimedByDeviceId","claimedTokenVersion","result","resultHash","saleId") VALUES($1,$2,$3,'POS-01','FISCAL-01',$3,$1,'request-hash','settings-hash','0','historical-shift',$4::jsonb,$5::jsonb,1.25,$6,'historical-device',3,$7::jsonb,'result-hash','historical-sale')`,id,store==='foreign'?'foreign-company':'fixture-company',store,JSON.stringify({payment:{method},scope:{storeId:store}}),JSON.stringify({paymentMethod:method,foreignProductId:'never-expand-ownership'}),status,JSON.stringify({outcome:status==='DISPATCHED'?'REQUIRES_CHECK':'CONFIRMED',dayId:'17',dayCounter:counter}));
  const allRows=async()=>{const result={};for(const table of [...tables,'FtextCashRequest'])result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text`);return result;};
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:revision,persistAndVerifyRecovery:async(snapshot)=>{assert.ok(proof);assert.equal(proof.restoredSnapshotHash,snapshot.snapshotHash);return {...proof,...snapshot.scope,sourceRevision:revision,manifestHash:snapshot.planHash,snapshotHash:snapshot.snapshotHash,storageReadbackVerified:true,artifactSha256:createHash('sha256').update(await readFile(path.join(directory,'fixture.dump'))).digest('hex')};}});
  await core.install(db,actor,scope);
  assert.equal((await core.inspect(db,actor,scope)).activeWork,true);
  await assert.rejects(core.prepare(db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);
  assert.equal((await db.$queryRawUnsafe(`SELECT "status" FROM "FtextCashRequest" WHERE "id"='pending'`))[0].status,'DISPATCHED');
  // Only the deliberately pending synthetic fixture is removed for the next,
  // separately identified complete-receipt recovery acceptance.
  await db.$executeRawUnsafe(`DELETE FROM "FtextCashRequest" WHERE "id"='pending'`);
  const before=await allRows(),prep=await core.prepare(db,actor,scope,'RESET');
  assert.deepEqual(prep.counts.find(c=>c.table==='FtextCashRequest'),{table:'FtextCashRequest',count:2,action:'REMOVE'});
  const request=(await db.$queryRawUnsafe(`SELECT "result" FROM "StoreLifecycleExecution" WHERE "id"=$1`,prep.operationId))[0].result.recoveryRequest;
  const archive=path.join(directory,'fixture.dump');await writeFile(path.join(directory,'job.json'),JSON.stringify(request),{mode:0o600});await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--file='+archive,url.href],{timeout:60000,encoding:'utf8',maxBuffer:1048576});assert.equal(dump.status,0,'isolated full-schema pg_dump failed');await chmod(archive,0o600);
  const script="import json,sys;sys.path.insert(0,sys.argv[1]);from verify_restore import verify_archive;print(json.dumps(verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])))";
  const verify=result=>{assert.equal(result.status,0,'full schema private recovery failed: '+result.stderr);const p=JSON.parse(result.stdout);assert.equal(p.restoredSnapshotHash,prep.snapshotHash);assert.equal(p.selectiveRestoreVerified,true);assert.equal(p.controlsUnchanged,true);assert.equal(p.fullRestoreAudit.dataMatches,true);assert.equal(p.selectiveRestoreAudit.dataMatches,true);return p;};
  proof=verify(spawnSync('python3',['-c',script,path.join(root,'ops/backup/lifecycle'),archive,path.join(directory,'job.json'),path.join(directory,'manifest.json'),path.join(root,'server/scripts/store-lifecycle-verify-copy.py')],{timeout:120000,encoding:'utf8',maxBuffer:1048576,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}}));
  if(process.env.CI)assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'PG18 production recovery image required');
  if(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)proof=verify(spawnSync('docker',['run','--rm','--network=none','--memory=256m','--pids-limit=80','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script,'/backup/lifecycle','/fixture/fixture.dump','/fixture/job.json','/fixture/manifest.json','/backup/lifecycle/store-lifecycle-verify-copy.py'],{timeout:120000,encoding:'utf8',maxBuffer:1048576}));
  assert.deepEqual(await allRows(),before,'private archive verification cannot change the source');
  const result=await core.execute(db,actor,{...scope,...prep});assert.equal(result.deleted.find(r=>r.table==='FtextCashRequest').count,2);
  assert.equal((await core.execute(db,actor,{...scope,...prep})).idempotentReplay,true);
  await core.reopen(db,actor,{...scope,operationId:prep.operationId});
  const after=await allRows();for(const table of tables.filter(n=>!['StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone'].includes(n)))assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.FtextCashRequest,before.FtextCashRequest.filter(r=>JSON.parse(r.row).storeId!=='target'));
  await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'0')),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
 }finally{await db?.$disconnect();try{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);}finally{await admin.$disconnect();await rm(directory,{recursive:true,force:true});}}
});
