import {provisionAiWalletRecovery,validateAiWalletSchema} from '../src/services/ai-owner-wallet-schema.js';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
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
test('wallet full-schema recovery uses immutable schema-only metadata and mandatory native CI',()=>{
 assert.equal(metadata.format,'FTEXT_FULL_SCHEMA_METADATA_NO_BUSINESS_ROWS_V1');assert.equal(metadata.serverVersion,'180004');
 assert.equal(new Set(metadata.columns.map(c=>c.table)).size,264);assert.equal(metadata.functions.length,9);assert.equal(metadata.triggers.length,11);
 assert.equal(metadata.columns.some(c=>c.identity||c.generated),false);
 if(process.env.CI)assert.equal(isolated(),true);
});

test('wallet full catalogue PG18 archive/COPY retains company money/history, blocks pending and DELETE, fences writers and preserves sibling/foreign controls',{skip:!isolated(),timeout:300000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='wallet_full_'+randomBytes(10).toString('hex')+'_test',directory=await mkdtemp(path.join(tmpdir(),'wallet-full-recovery-'));
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
  assert.doesNotThrow(()=>assertFtextCashLifecycleApproved(manifest));
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  const repository=createAiOwnerWalletRepository(db);
  await repository.credit('fixture-company',{amountMicros:'10000000',receiptReference:'synthetic-wallet-credit'},'isolated-admin');
  await repository.grantTrial('foreign-company',{amountMicros:'7000000',grantReference:'synthetic-foreign-trial',reason:'Synthetic control grant'},'isolated-admin');
  await repository.configure('fixture-company',{version:1,enabled:true,emailEnabled:false,notificationOwnerId:''},'isolated-admin');
  const reservation=(storeId,reference,amountMicros='1000000')=>repository.reserve({companyId:'fixture-company',storeId,reference,amountMicros,feature:'OWNER_ASSISTANT',tariff:{model:'synthetic'}});
  const target=await reservation('target','target-request');
  const sibling=await reservation('sibling','sibling-request');
  await repository.settle('fixture-company',sibling.id,{amountMicros:'500000',usage:{providerResponseId:'synthetic-sibling'}});
  // A sibling pending hold must survive target RESET without blocking it.
  await reservation('sibling','sibling-pending');
  const walletTables=['AiOwnerWallet','AiOwnerWalletEntry','AiOwnerWalletNotice','AiOwnerWalletAudit'];
  const allRows=async()=>{const result={};for(const table of [...tables,'FtextCashRequest',...walletTables])result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text`);return result;};
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:revision,persistAndVerifyRecovery:async(snapshot)=>{assert.ok(proof);assert.equal(proof.restoredSnapshotHash,snapshot.snapshotHash);return {...proof,...snapshot.scope,sourceRevision:revision,manifestHash:snapshot.planHash,snapshotHash:snapshot.snapshotHash,storageReadbackVerified:true,artifactSha256:createHash('sha256').update(await readFile(path.join(directory,'fixture.dump'))).digest('hex')};}});
  await core.install(db,actor,scope);
  assert.equal((await core.inspect(db,actor,scope)).activeWork,true);
  await assert.rejects(core.prepare(db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);
  await repository.review('fixture-company',target.id);
  await assert.rejects(core.prepare(db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);
  await repository.settle('fixture-company',target.id,{amountMicros:'250000',usage:{providerResponseId:'synthetic-target'},actorId:'isolated-admin',resolutionReference:'synthetic-reviewed-usage'});
  await assert.rejects(core.prepare(db,actor,scope,'DELETE'),/AI wallet financial history blocks store deletion/);
  const before=await allRows(),prep=await core.prepare(db,actor,scope,'RESET');
  assert.deepEqual(prep.counts.find(c=>c.table==='AiOwnerWalletEntry'),{table:'AiOwnerWalletEntry',count:1,action:'KEEP'});
  await assert.rejects(reservation('target','during-maintenance'),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
  const request=(await db.$queryRawUnsafe(`SELECT "result" FROM "StoreLifecycleExecution" WHERE "id"=$1`,prep.operationId))[0].result.recoveryRequest;
  const archive=path.join(directory,'fixture.dump');await writeFile(path.join(directory,'job.json'),JSON.stringify(request),{mode:0o600});await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--file='+archive,url.href],{timeout:60000,encoding:'utf8',maxBuffer:1048576});assert.equal(dump.status,0,'isolated full-schema pg_dump failed');await chmod(archive,0o600);
  const script="import json,sys;sys.path.insert(0,sys.argv[1]);from verify_restore import verify_archive;print(json.dumps(verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])))";
  const verify=result=>{assert.equal(result.status,0,'full schema private recovery failed: '+result.stderr);const p=JSON.parse(result.stdout);assert.equal(p.restoredSnapshotHash,prep.snapshotHash);assert.equal(p.selectiveRestoreVerified,true);assert.equal(p.controlsUnchanged,true);assert.equal(p.fullRestoreAudit.dataMatches,true);assert.equal(p.selectiveRestoreAudit.dataMatches,true);return p;};
  proof=verify(spawnSync('python3',['-c',script,path.join(root,'ops/backup/lifecycle'),archive,path.join(directory,'job.json'),path.join(directory,'manifest.json'),path.join(root,'server/scripts/store-lifecycle-verify-copy.py')],{timeout:120000,encoding:'utf8',maxBuffer:1048576,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}}));
  if(process.env.CI)assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'PG18 production recovery image required');
  if(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)proof=verify(spawnSync('docker',['run','--rm','--network=none','--memory=256m','--pids-limit=80','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script,'/backup/lifecycle','/fixture/fixture.dump','/fixture/job.json','/fixture/manifest.json','/backup/lifecycle/store-lifecycle-verify-copy.py'],{timeout:120000,encoding:'utf8',maxBuffer:1048576}));
  assert.deepEqual(await allRows(),before,'private archive verification cannot change the source');
  const result=await core.execute(db,actor,{...scope,...prep});assert.equal(result.deleted.some(r=>r.table==='AiOwnerWalletEntry'),false);assert.equal(result.kept.find(r=>r.name==='AiOwnerWalletEntry').rowCount,1);
  assert.equal((await core.execute(db,actor,{...scope,...prep})).idempotentReplay,true);
  await core.reopen(db,actor,{...scope,operationId:prep.operationId});
  const after=await allRows();for(const table of tables.filter(n=>!['StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone'].includes(n)))assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.FtextCashRequest,before.FtextCashRequest);
  for(const table of walletTables)assert.deepEqual(after[table],before[table],table);
  const fresh=await reservation('target','fresh-after-reset');
  await repository.review('fixture-company',fresh.id);
  await repository.settle('fixture-company',fresh.id,{amountMicros:'100000',actorId:'isolated-admin',resolutionReference:'fresh-resolution'});
  const settled=await reservation('target','second-fresh-after-reset');
  await repository.settle('fixture-company',settled.id,{amountMicros:'50000'});
  const sourceBeforeDrift=await allRows();
  await db.$executeRawUnsafe(`ALTER TABLE "AiOwnerWalletAudit" ADD COLUMN "unreviewed" text`);
  await assert.rejects(provisionAiWalletRecovery(db),e=>e.code==='AI_WALLET_RECOVERY_SCHEMA_CHANGED');
  await db.$executeRawUnsafe(`ALTER TABLE "AiOwnerWalletAudit" DROP COLUMN "unreviewed"`);
  assert.deepEqual(await allRows(),sourceBeforeDrift);
  await validateAiWalletSchema(db);
  await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'0')),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
 }finally{await db?.$disconnect();try{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);}finally{await admin.$disconnect();await rm(directory,{recursive:true,force:true});}}
});

test('native wallet startup is concurrent/idempotent and refuses maintenance or constraint drift without touching funds',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wallet_bootstrap_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.href}),b=new PrismaClient({datasourceUrl:url.href});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA ${q(schema)}`);
  await a.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("maintenance" boolean NOT NULL)`);
  await a.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES (true)`);
  await assert.rejects(provisionAiWalletRecovery(a),e=>e.code==='AI_WALLET_RECOVERY_MAINTENANCE');
  assert.equal((await a.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'AiOwnerWallet'))::text AS name`))[0].name,null);
  await a.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET maintenance=false`);
  const results=await Promise.all([provisionAiWalletRecovery(a),provisionAiWalletRecovery(b)]);assert.ok(results.every(r=>r.available&&!r.chargingEnabled));
  await a.$executeRawUnsafe(`INSERT INTO "AiOwnerWallet"("companyId","cycleId","balanceMicros") VALUES ('synthetic-company','synthetic-cycle',5000000)`);
  const rows=()=>a.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "AiOwnerWallet" t ORDER BY "companyId"`),before=await rows();
  await provisionAiWalletRecovery(a);assert.deepEqual(await rows(),before);
  for(const name of ['AiOwnerWalletEntry','AiOwnerWalletNotice','AiOwnerWalletAudit'])assert.equal((await a.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${q(name)}`))[0].n,0);
  await a.$executeRawUnsafe(`ALTER TABLE "AiOwnerWallet" DROP CONSTRAINT "AiOwnerWallet_balanceMicros_check"`);
  await assert.rejects(provisionAiWalletRecovery(b),e=>e.code==='AI_WALLET_RECOVERY_SCHEMA_CHANGED');assert.deepEqual(await rows(),before);
 }finally{await a.$disconnect();await b.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`);await admin.$disconnect()}
});
