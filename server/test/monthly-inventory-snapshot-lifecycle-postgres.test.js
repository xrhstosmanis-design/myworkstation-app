import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {provisionMonthlyInventorySnapshotSchema,validateMonthlyInventorySnapshotSchema,monthlyInventorySnapshotLifecycleManifestProposal,assertMonthlySnapshotLifecycleCatalogue} from '../src/services/monthly-inventory-snapshot-schema.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'";
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('monthly history remains an exact proposed extension; native CI must execute recovery',()=>{
 assertMonthlySnapshotLifecycleCatalogue();
 const read=file=>JSON.parse(readFileSync(path.join(root,'ops/backup/lifecycle',file),'utf8'));
 const proposed=read('monthly-inventory-snapshot-column-review.proposed.json'),canonical=read('column-review.json');
 assert.equal(proposed.executionEnabled,false);assert.equal(proposed.columns.filter(c=>c.column.startsWith('MonthlyInventorySnapshot.')).length,22);
 proposed.profileId=canonical.profileId;proposed.columns=proposed.columns.filter(c=>!c.column.startsWith('MonthlyInventorySnapshot.'));assert.deepEqual(proposed,canonical);
 assert.equal(metadata.format,'FTEXT_FULL_SCHEMA_METADATA_NO_BUSINESS_ROWS_V1');if(process.env.CI)assert.equal(isolated(),true);
});
test('native monthly detached history survives reset and real full/selective private recovery with immutable guards and cross-scope controls',{skip:!isolated(),timeout:300000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_history_full_'+randomBytes(10).toString('hex')+'_test',directory=await mkdtemp(path.join(tmpdir(),'wallet-full-recovery-'));
 const actor={id:'isolated-admin',isSuperAdmin:true},scope={companyId:'fixture-company',storeId:'target'},manifest=monthlyInventorySnapshotLifecycleManifestProposal(),revision='1'.repeat(40);
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
  await ensureStoreChatInteractions(db);
  await provisionMonthlyInventorySnapshotSchema(db,{manifest});

  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  const observed='2026-10-01T04:00:00.123Z',started='2026-10-01T04:00:00.000Z';
  for(const [id,companyId,storeId,generation] of [['target-old','fixture-company','target','0'],['sibling-control','fixture-company','sibling','0'],['foreign-control','foreign-company','foreign','0']]){
   const candidate=buildMonthlyInventorySnapshotCandidate({companyId,storeId,lifecycleGeneration:generation,issueMonth:'2026-09',sourceObservedAt:observed,sourceRevision:revision,valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:1,invoiceCount:0,pendingOriginalCount:0},products:[{id:'detached-product',companyId,storeId,name:'Συνθετικό ιστορικό \ " /',sku:'EXACT',unit:'τεμάχιο',quantity:'-9007199254740993.123456789012',retailUnitPrice:'0.000000000001',purchaseUnitCost:null}],invoices:{period:'2026-09',items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
   const text=serializeMonthlyInventorySnapshotCandidate(candidate),bytes=createHash('sha256').update(text).digest('hex');
   await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventorySnapshot"("id","companyId","storeId","lifecycleGeneration","issueMonth","scheduledFor","transactionStartedAt","sourceReadStartedAt","sourceReadFinishedAt","sourceObservedAt","observationStatus","delayMs","sourceRevision","formatVersion","valuationBasis","sourceHash","payloadHash","candidateJsonText","storedBytesSha256","sourceCoverage","capturePrincipal") VALUES ($1,$2,$3,$4::bigint,'2026-09',$5::timestamptz,$6::timestamptz,$6::timestamptz,$7::timestamptz,$7::timestamptz,'LATE',123,$8,1,'CURRENT_OPERATIONAL_V1',$9,$10,$11,$12,$13::jsonb,$14::jsonb)`,id,companyId,storeId,generation,candidate.period.scheduledFor,started,observed,revision,candidate.sourceHash,candidate.payloadHash,text,bytes,JSON.stringify(candidate.coverage),JSON.stringify({type:'BACKOFFICE_USER',userId:'synthetic-user',authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'}));
  }
  await validateMonthlyInventorySnapshotSchema(db);
  for(const sql of [`DELETE FROM "Store" WHERE "id"='target'`,`UPDATE "Store" SET "id"='renamed' WHERE "id"='target'`,`DELETE FROM "Company" WHERE "id"='fixture-company'`])await assert.rejects(db.$executeRawUnsafe(sql),/mws_snapshot_(store|company)_parent/);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('detached-product','fixture-company','SYNTHETIC SHARED PRODUCT'),('foreign-product','foreign-company','CONTROL')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ('target-stock','target','detached-product',-12.3456),('sibling-stock','sibling','detached-product',7.0001),('foreign-stock','foreign','foreign-product',3.0001)`);
  await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES ('target-movement','target','detached-product','SYNTHETIC',-12.3456),('sibling-movement','sibling','detached-product','SYNTHETIC',7.0001),('foreign-movement','foreign','foreign-product','SYNTHETIC',3.0001)`);
  const allRows=async()=>{const result={};for(const table of manifest.knownTables)result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text`);return result;};
  const before=await allRows();
  for(const sql of [`UPDATE "MonthlyInventorySnapshot" SET "issueMonth"='2026-08'`,'DELETE FROM "MonthlyInventorySnapshot"','TRUNCATE "MonthlyInventorySnapshot"'])await assert.rejects(db.$executeRawUnsafe(sql),/MONTHLY_SNAPSHOT_IMMUTABLE/);
  assert.deepEqual(await allRows(),before);
  const core=createLifecycleExecutionCore(manifest,{sourceRevision:revision,persistAndVerifyRecovery:async(snapshot)=>{assert.ok(proof);assert.equal(proof.restoredSnapshotHash,snapshot.snapshotHash);return {...proof,...snapshot.scope,sourceRevision:revision,manifestHash:snapshot.planHash,snapshotHash:snapshot.snapshotHash,storageReadbackVerified:true,artifactSha256:createHash('sha256').update(await readFile(path.join(directory,'fixture.dump'))).digest('hex')};}});
  await core.install(db,actor,scope);await validateMonthlyInventorySnapshotSchema(db);
  await assert.rejects(core.prepare(db,actor,scope,'DELETE'),/Monthly inventory snapshot history blocks store deletion/);
  const prep=await core.prepare(db,actor,scope,'RESET');assert.deepEqual(prep.counts.find(c=>c.table==='MonthlyInventorySnapshot'),{table:'MonthlyInventorySnapshot',count:1,action:'KEEP'});
  const request=(await db.$queryRawUnsafe(`SELECT "result" FROM "StoreLifecycleExecution" WHERE "id"=$1`,prep.operationId))[0].result.recoveryRequest;
  const archive=path.join(directory,'fixture.dump');await writeFile(path.join(directory,'job.json'),JSON.stringify(request),{mode:0o600});await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
  const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--file='+archive,url.href],{timeout:60000,encoding:'utf8',maxBuffer:1048576});assert.equal(dump.status,0,'isolated full-schema pg_dump failed');await chmod(archive,0o600);
  const script="import json,sys;sys.path.insert(0,sys.argv[1]);from verify_restore import verify_archive;print(json.dumps(verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])))";
  const verify=result=>{assert.equal(result.status,0,'full schema private recovery failed: '+result.stderr);const p=JSON.parse(result.stdout);assert.equal(p.restoredSnapshotHash,prep.snapshotHash);assert.equal(p.selectiveRestoreVerified,true);assert.equal(p.controlsUnchanged,true);assert.equal(p.fullRestoreAudit.dataMatches,true);assert.equal(p.selectiveRestoreAudit.dataMatches,true);return p;};
  proof=verify(spawnSync('python3',['-c',script,path.join(root,'ops/backup/lifecycle'),archive,path.join(directory,'job.json'),path.join(directory,'manifest.json'),path.join(root,'server/scripts/store-lifecycle-verify-copy.py')],{timeout:120000,encoding:'utf8',maxBuffer:1048576,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}}));
  if(process.env.CI)assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'PG18 recovery image required');
  if(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)proof=verify(spawnSync('docker',['run','--rm','--network=none','--memory=256m','--pids-limit=80','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script,'/backup/lifecycle','/fixture/fixture.dump','/fixture/job.json','/fixture/manifest.json','/backup/lifecycle/store-lifecycle-verify-copy.py'],{timeout:120000,encoding:'utf8',maxBuffer:1048576}));
  assert.deepEqual(await allRows(),before,'private archive verification cannot change source rows');
  const result=await core.execute(db,actor,{...scope,...prep});assert.equal(result.deleted.some(r=>r.table==='MonthlyInventorySnapshot'),false);assert.equal(result.kept.find(r=>r.name==='MonthlyInventorySnapshot').rowCount,1);assert.equal(result.generation,'1');
  assert.equal((await core.execute(db,actor,{...scope,...prep})).idempotentReplay,true);
  await core.reopen(db,actor,{...scope,operationId:prep.operationId});
  const expected=structuredClone(before);for(const table of ['StoreProduct','StockMovement'])expected[table]=expected[table].filter(r=>JSON.parse(r.row).storeId!=='target');
  assert.deepEqual(await allRows(),expected,'reset removes target business stock but preserves exact detached history, shared Product and sibling/foreign controls');
  await validateMonthlyInventorySnapshotSchema(db);
  await assert.rejects(db.$transaction(tx=>assertLifecycleMutation(tx,scope,'0')),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
  await assert.rejects(core.prepare(db,actor,scope,'DELETE'),/Monthly inventory snapshot history blocks store deletion/);
 }finally{await db?.$disconnect();try{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)}`);}finally{await admin.$disconnect();await rm(directory,{recursive:true,force:true});}}
});
