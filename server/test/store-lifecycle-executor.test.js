import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createLifecycleExecutionCore,createLifecycleInspectionCore,lifecycleExecutionSnapshotHash} from '../src/services/store-lifecycle-executor.js';
import {STORE_RECOVERY_FORMAT,persistLifecycleRecovery,openLifecycleRecovery} from '../src/services/store-lifecycle-recovery.js';
import {persistLifecycleRecoveryStream,readLifecycleRecoveryStream,verifyLifecycleRecoveryStream,digestLifecycleRows} from '../src/services/store-lifecycle-recovery-stream.js';
import {FRESH_STORE_KEEP} from '../src/services/store-lifecycle-policy.js';
const actor={id:'admin',isSuperAdmin:true},scope={companyId:'company',storeId:'target'};
const manifest={id:'ISOLATED_REVIEWED_FIXTURE_V1',reviewedColumns:['StoreRbsInstallationSettings.config'],tables:[
 {name:'Store',owner:{kind:'ROOT'},reset:'KEEP'},
 {name:'Sale',owner:{kind:'DIRECT'},reset:'REMOVE'},
 {name:'SaleLine',owner:{kind:'CHILD',parent:'Sale',columns:[['saleId','id']]},reset:'REMOVE'},
 {name:'StoreRbsInstallationSettings',owner:{kind:'DIRECT'},reset:'KEEP'},
 ...['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice'].map(name=>({name,owner:{kind:'DIRECT'},reset:'KEEP'}))
]};
const ddl=s=>[
 `CREATE TABLE "${s}"."Store"("id" text PRIMARY KEY,"companyId" text NOT NULL,"name" text)`,
 `CREATE TABLE "${s}"."Sale"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${s}"."Store"("id"),"amount" numeric(30,9))`,
 `CREATE TABLE "${s}"."SaleLine"("id" text PRIMARY KEY,"companyId" text NOT NULL,"saleId" text REFERENCES "${s}"."Sale"("id"),"storeId" text REFERENCES "${s}"."Store"("id"),"quantity" bigint)`,
 ...['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice'].map(name=>`CREATE TABLE "${s}"."${name}"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text REFERENCES "${s}"."Store"("id"),"terminalPos" text NOT NULL,"active" boolean NOT NULL,"settings" text NOT NULL)`),
 `CREATE TABLE "${s}"."StoreRbsInstallationSettings"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text REFERENCES "${s}"."Store"("id"),"config" jsonb)`
];
test('executor requires a server manifest/recovery adapter and rejects unauthorized calls before DB access',async()=>{
 assert.throws(()=>createLifecycleExecutionCore(manifest),/restore verification adapter/);
 assert.throws(()=>createLifecycleExecutionCore({...manifest,tables:[]},{persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)}));
 const core=createLifecycleExecutionCore(manifest,{persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)}),db={$transaction(){throw Error('unexpected database access')}};
 for(const user of [null,{id:'owner',role:'OWNER'},{id:'fake',role:'SUPER_ADMIN'}])for(const method of ['inspect','install','prepare','execute','abort','beginDrain'])await assert.rejects(core[method](db,user,scope,'RESET'),e=>e.status===403);
 await assert.rejects(core.prepare(db,actor,scope,'OTHER'),e=>e.status===400);
 await assert.rejects(core.execute(db,actor,{...scope,operationId:'not-a-uuid',snapshotHash:'a'.repeat(64)}),e=>e.status===400);
});
test('reset plans cannot remove either register installation, EFTPOS/RBS settings, credentials or licenses',()=>{
 const protectedNames=['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings','CloudDevice','ConnectorDevice','StoreIntegrationCredential','StorePaidModule'];
 for(const name of protectedNames){
  const bad=structuredClone(manifest),existing=bad.tables.find(t=>t.name===name);
  if(existing)existing.reset='REMOVE';else bad.tables.push({name,owner:{kind:'DIRECT'},reset:'REMOVE'});
  assert.throws(()=>createLifecycleExecutionCore(bad,{persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)}),new RegExp('must retain installation/configuration: '+name));
 }
});
test('explicit fresh-store policy retains every register/configuration boundary and cannot use an unknown policy or historical ownership',()=>{
 const options={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)};
 for(const name of FRESH_STORE_KEEP){const bad=structuredClone(manifest);bad.resetPolicy='FRESH_STORE_V1';const row=bad.tables.find(t=>t.name===name);if(row)row.reset='REMOVE';else bad.tables.push({name,owner:{kind:'DIRECT'},reset:'REMOVE'});assert.throws(()=>createLifecycleExecutionCore(bad,options),/must retain installation\/configuration/)}
 assert.throws(()=>createLifecycleExecutionCore({...manifest,resetPolicy:'SILENT_BROAD_DELETE'},options),/Unknown reset policy/);
 const shift={name:'ShiftType',owner:{kind:'DIRECT'},reset:'REMOVE'};
 assert.throws(()=>createLifecycleExecutionCore({...manifest,tables:[...manifest.tables,shift]},options),/must retain/);
 assert.doesNotThrow(()=>createLifecycleExecutionCore({...manifest,resetPolicy:'FRESH_STORE_V1',tables:[...manifest.tables,shift]},options));
 assert.throws(()=>createLifecycleExecutionCore({...manifest,resetPolicy:'FRESH_STORE_V1',tables:[...manifest.tables,{name:'AiReaderJob',owner:{kind:'DIRECT'},reset:'KEEP'}]},options),/Fresh-store business rows must be removed/);
 const bad=structuredClone(manifest);bad.tables[1].owner.historical=true;assert.throws(()=>createLifecycleExecutionCore(bad,options),/Ownership cannot be historical/);
 bad.tables[1].owner={kind:'DIRECT'};bad.tables[1].references=[{parent:'Store',columns:[['storeId','id']],historical:'yes'}];assert.throws(()=>createLifecycleExecutionCore(bad,options),/Invalid reviewed application references/);
 const credentials={...manifest,resetPolicy:'FRESH_STORE_V1',tables:[...manifest.tables,{name:'StoreIntegrationCredential',owner:{kind:'DIRECT'},reset:'REMOVE'}]};assert.throws(()=>createLifecycleExecutionCore(credentials,options),/exact non-fiscal kind guard/);
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
async function fixture({proofOverride,afterVerified,extraManifest,extraDdl=()=>[],populate}={}){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_exec_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const u=new URL(process.env.DATABASE_URL);u.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:u.toString()}),directory=await mkdtemp(path.join(tmpdir(),'mws-executor-')),key=randomBytes(32);let proofCalls=0;
 for(const sql of [...ddl(schema),...extraDdl(schema),`CREATE TABLE "${schema}"."Product"("id" text PRIMARY KEY,"name" text)`,
 `INSERT INTO "${schema}"."Store" VALUES('target','company','Target'),('sibling','company','Sibling'),('foreign','other','Foreign')`,
 `INSERT INTO "${schema}"."Sale" VALUES('sale','company','target',9007199254740993.123456789),('control','company','sibling',2),('foreign-sale','other','foreign',3)`,
 `INSERT INTO "${schema}"."SaleLine" VALUES('line','company','sale','target',9007199254740993),('control-line','company','control','sibling',1)`,
 `INSERT INTO "${schema}"."StoreRbsInstallationSettings" VALUES('settings','company','target','{"key":"PRIVATE RETAINED CONFIG"}'),('control-settings','company','sibling','{}')`,
 ...['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice'].map(name=>`INSERT INTO "${schema}"."${name}" VALUES('${name}-1','company','target','KAT-POS-01',true,'PRIVATE UNCHANGED 1'),('${name}-2','company','target','KAT-POS-02',true,'PRIVATE UNCHANGED 2'),('${name}-control','company','sibling','SIBLING',true,'CONTROL')`),
 `INSERT INTO "${schema}"."StoreRbsInstallationSettings" VALUES('settings-2','company','target','{"terminalPos":"KAT-POS-02","key":"PRIVATE RETAINED SECOND CONFIG"}')`,
 `INSERT INTO "${schema}"."Product" VALUES('shared','SHARED CATALOG CONTROL')`
 ])await db.$executeRawUnsafe(sql);
 if(populate)await populate(db,schema);
 const selectedManifest=extraManifest||manifest;
 const persistAndVerifyRecovery=async (snapshot,reader)=>{
  proofCalls++;if(proofOverride)return proofOverride(snapshot);
  if(selectedManifest.streaming){
   const opts={directory,encryptionKey:key,keyId:'isolated-stream-test-key',expectedScope:snapshot.scope,expectedManifestHash:snapshot.planHash,expectedSourceRevision:'1'.repeat(40),expectedSchemaSignature:snapshot.schemaSignature};
   const saved=await persistLifecycleRecoveryStream({...snapshot,manifestHash:snapshot.planHash},{...opts,readRows:reader.readRows});
   const bytes=await readFile(saved.artifactPath),readOptions={...opts,expectedSnapshotHash:saved.snapshotHash},restore='lifecycle_stream_restore_'+randomUUID().replaceAll('-','');
   try{
    await verifyLifecycleRecoveryStream(bytes,readOptions);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${restore}"`);for(const sql of [...ddl(restore),...extraDdl(restore)])await admin.$executeRawUnsafe(sql);
    await admin.$transaction(async tx=>{for await(const chunk of readLifecycleRecoveryStream(bytes,readOptions))for(const row of chunk.rows)await tx.$executeRawUnsafe(`INSERT INTO "${restore}"."${chunk.table}" SELECT * FROM json_populate_record(NULL::"${restore}"."${chunk.table}",$1::json)`,row)},{timeout:120000});
    const tables=[];for(const table of snapshot.tables){
     const rows=async function*(){for(let offset=0;;offset++){const r=await admin.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${restore}"."${table.name}" t ORDER BY "id" OFFSET $1 LIMIT 1`,offset);if(!r.length)return;yield r[0].row}};
     tables.push({name:table.name,action:table.action,...await digestLifecycleRows(rows())});
    }
    const restoredSnapshotHash=lifecycleExecutionSnapshotHash({...snapshot,tables});assert.equal(restoredSnapshotHash,snapshot.snapshotHash);
    if(afterVerified)await afterVerified(snapshot);
    return {sourceRevision:'1'.repeat(40),manifestHash:snapshot.planHash,...snapshot.scope,snapshotHash:snapshot.snapshotHash,restoredSnapshotHash,artifactSha256:saved.sha256,storageReadbackVerified:true};
   }finally{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${restore}" CASCADE`)}
  }
  const artifact={...snapshot,format:STORE_RECOVERY_FORMAT,manifestHash:snapshot.planHash,sourceRevision:'1'.repeat(40),createdAt:new Date().toISOString()},opts={encryptionKey:key,keyId:'isolated-test-key',expectedScope:snapshot.scope,expectedManifestHash:snapshot.planHash,expectedSourceRevision:'1'.repeat(40)};
  const saved=await persistLifecycleRecovery(artifact,{...opts,directory}),opened=openLifecycleRecovery(await readFile(saved.artifactPath),opts),restore='lifecycle_restore_'+randomUUID().replaceAll('-','');
  try{
   await admin.$executeRawUnsafe(`CREATE SCHEMA "${restore}"`);for(const sql of ddl(restore))await admin.$executeRawUnsafe(sql);
   await admin.$transaction(async tx=>{for(const table of opened.tables)for(const row of table.rows)await tx.$executeRawUnsafe(`INSERT INTO "${restore}"."${table.name}" SELECT * FROM json_populate_record(NULL::"${restore}"."${table.name}",$1::json)`,row)});
   const tables=[];for(const table of opened.tables){const rows=await admin.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${restore}"."${table.name}" t ORDER BY row_to_json(t)::text`);tables.push({...table,rows:rows.map(r=>r.row)})}
   const restoredSnapshotHash=lifecycleExecutionSnapshotHash({...snapshot,tables});assert.equal(restoredSnapshotHash,snapshot.snapshotHash);if(afterVerified)await afterVerified(snapshot);
   return {sourceRevision:opened.sourceRevision,manifestHash:opened.manifestHash,companyId:opened.scope.companyId,storeId:opened.scope.storeId,mode:opened.scope.mode,snapshotHash:snapshot.snapshotHash,restoredSnapshotHash,artifactSha256:saved.sha256,storageReadbackVerified:saved.storageReadbackVerified};
  }finally{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${restore}" CASCADE`)}
 };
 const core=createLifecycleExecutionCore(selectedManifest,{persistAndVerifyRecovery,sourceRevision:'1'.repeat(40)});
 const snapshot=async()=>{const result={};for(const table of [...selectedManifest.tables.map(t=>t.name),'Product'])result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${schema}"."${table}" t ORDER BY row_to_json(t)::text`);return result};
 return {db,admin,schema,core,snapshot,proofCalls:()=>proofCalls,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect();await rm(directory,{recursive:true,force:true})}};
}
const matches=pattern=>e=>pattern.test(String(e.message)+' '+JSON.stringify(e.meta||{}));
test('native RESET verifies persisted encrypted full fixture restore, deletes only scoped rows, retains configuration, blocks old writes and replays once',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();await assert.rejects(f.core.install(f.db,actor,{companyId:'other',storeId:'target'}),e=>e.status===404);await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('blocked','company','target',1)`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('other-live','company','sibling',4)`);
  const result=await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(result.maintenance,true);assert.equal(result.reopenRequired,true);assert.deepEqual(result.deleted.map(t=>t.table),['SaleLine','Sale']);
  const after=await f.snapshot();for(const name of ['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice']){assert.deepEqual(after[name],before[name]);assert.equal(after[name].filter(r=>r.row.includes('"storeId":"target"')).length,2)}assert.deepEqual(after.Store,before.Store);assert.deepEqual(after.StoreRbsInstallationSettings,before.StoreRbsInstallationSettings);assert.deepEqual(after.Product,before.Product);assert.equal(after.Sale.length,3);assert.equal(after.SaleLine.length,1);assert.ok(after.Sale.every(r=>!r.row.includes('"id":"sale"')));
  assert.equal((await f.core.execute(f.db,actor,{...scope,...prep})).idempotentReplay,true);assert.equal(f.proofCalls(),1);
  await assert.rejects(f.core.abort(f.db,actor,{...scope,...prep}),/unexecuted/);
  // Fixture-only reopen models the future authenticated generation adapter; no reopen API exists.
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`);
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('old-offline','company','target',1)`),matches(/STORE_LIFECYCLE_STALE_GENERATION/));
  await f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations',$1,true)`,JSON.stringify({target:1}));await tx.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('fresh','company','target',1)`)});
 }finally{await f.close()}
});
test('native DELETE removes only the selected store, preserves other companies/catalog and leaves a retired identity fence',{skip:!isolated},async()=>{
 const f=await fixture();try{await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'DELETE');const before=await f.snapshot(),result=await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(result.mode,'DELETE');const after=await f.snapshot();assert.equal(after.Store.length,2);assert.equal(after.Sale.length,2);assert.equal(after.SaleLine.length,1);assert.equal(after.StoreRbsInstallationSettings.length,1);assert.deepEqual(after.Product,before.Product);assert.deepEqual(after.Store,before.Store.filter(r=>!r.row.includes('"id":"target"')));await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('target','company','Reused')`),matches(/STORE_LIFECYCLE_MAINTENANCE/));assert.equal((await f.core.execute(f.db,actor,{...scope,...prep})).idempotentReplay,true)}finally{await f.close()}
});
test('native streamed executor recovers over 32MiB of inline documents before reset, preserves both registers and rejects stale writes',{skip:!isolated},async()=>{
 const extraManifest={...manifest,streaming:true,reviewedColumns:[...manifest.reviewedColumns,'DocumentAttachment.contentData'],tables:[...manifest.tables,{name:'DocumentAttachment',owner:{kind:'DIRECT'},reset:'REMOVE'}]};
 const f=await fixture({extraManifest,extraDdl:s=>[`CREATE TABLE "${s}"."DocumentAttachment"("id" numeric(30,0) PRIMARY KEY,"companyId" text,"storeId" text REFERENCES "${s}"."Store"("id"),"contentData" text)`],populate:async(db,schema)=>{
  for(let n=0;n<18;n++)await db.$executeRawUnsafe(`INSERT INTO "${schema}"."DocumentAttachment" VALUES($1::numeric,'company','target',$2)`,String(9007199254740993n+BigInt(n)),'INLINE DOCUMENT '+n+'x'.repeat(2*1024*1024));
  await db.$executeRawUnsafe(`INSERT INTO "${schema}"."DocumentAttachment" VALUES(1,'company','sibling','UNCHANGED CONTROL')`);
 }});
 try{
  await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  assert.equal(prep.counts.find(t=>t.table==='DocumentAttachment').count,18);
  const before=await f.db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "StoreInstallationTerminal" t ORDER BY "id"`);
  const result=await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(result.deleted.find(t=>t.table==='DocumentAttachment').count,18);
  assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "StoreInstallationTerminal" t ORDER BY "id"`),before);
  assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT "contentData" FROM "DocumentAttachment"`),[{contentData:'UNCHANGED CONTROL'}]);
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES(2,'company','target','OLD OFFLINE REQUEST')`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  assert.equal((await f.core.execute(f.db,actor,{...scope,...prep})).idempotentReplay,true);assert.equal(f.proofCalls(),1);
 }finally{await f.close()}
});
test('native missing restore proof refuses all deletion and an exact unexecuted preparation can be aborted',{skip:!isolated},async()=>{
 const f=await fixture({proofOverride:async()=>({restoreVerified:true})});try{const before=await f.snapshot();await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep}),/not verified/);assert.deepEqual(await f.snapshot(),before);await assert.rejects(f.core.abort(f.db,actor,{...scope,operationId:randomUUID()}));await f.core.abort(f.db,actor,{...scope,...prep});await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('resumed','company','target',1)`)}finally{await f.close()}
});
test('native commit-time failure rolls every deletion back, retaining a prepared operation for a verified retry',{skip:!isolated},async()=>{
 const f=await fixture();try{const before=await f.snapshot();await f.core.install(f.db,actor,scope);await f.db.$executeRawUnsafe(`ALTER TABLE "StoreLifecycleExecution" ADD CONSTRAINT "fixture_reject_complete" CHECK("state"<>'COMPLETED')`);const prep=await f.core.prepare(f.db,actor,scope,'RESET');await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep}),matches(/fixture_reject_complete/));assert.deepEqual(await f.snapshot(),before);assert.equal((await f.db.$queryRawUnsafe(`SELECT "generation"::text AS value FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].value,'0');await f.db.$executeRawUnsafe(`ALTER TABLE "StoreLifecycleExecution" DROP CONSTRAINT "fixture_reject_complete"`);await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(f.proofCalls(),2)}finally{await f.close()}
});
test('native unknown dependencies, cross-store links, tampered guards, expiry and changed rows fail closed',{skip:!isolated},async()=>{
 const f=await fixture();try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot();
  await f.db.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "referenceId" text`);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Unreviewed application/);await f.db.$executeRawUnsafe(`ALTER TABLE "Product" DROP COLUMN "referenceId"`);
  await f.db.$executeRawUnsafe(`CREATE TABLE "UnreviewedChild"("saleId" text REFERENCES "Sale"("id"))`);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Unreviewed incoming/);await f.db.$executeRawUnsafe(`DROP TABLE "UnreviewedChild"`);
  await f.db.$executeRawUnsafe(`UPDATE "SaleLine" SET "storeId"='sibling' WHERE "id"='line'`);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Cross-store/);await f.db.$executeRawUnsafe(`UPDATE "SaleLine" SET "storeId"='target' WHERE "id"='line'`);
  const prep=await f.core.prepare(f.db,actor,scope,'RESET');await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep,companyId:'other'}),e=>e.status===404);
  await assert.rejects(f.db.$executeRawUnsafe(`TRUNCATE "Sale" CASCADE`),matches(/STORE_LIFECYCLE_TRUNCATE_FORBIDDEN/));assert.deepEqual(await f.snapshot(),before);
  const trigger=(await f.db.$queryRawUnsafe(`SELECT tgname AS name FROM pg_trigger WHERE tgrelid='"Sale"'::regclass AND NOT tgisinternal AND (tgtype&1)=1`))[0].name;await f.db.$executeRawUnsafe(`ALTER TABLE "Sale" DISABLE TRIGGER "${trigger}"`);await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep}),/Changed database guard/);await f.db.$executeRawUnsafe(`ALTER TABLE "Sale" ENABLE ALWAYS TRIGGER "${trigger}"`);
  await f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_operation',$1,true)`,prep.operationId);await tx.$executeRawUnsafe(`UPDATE "Sale" SET "amount"=14 WHERE "id"='sale'`)});await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep}),/Rows changed/);assert.equal(f.proofCalls(),0);
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleExecution" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "id"=$1`,prep.operationId);await assert.rejects(f.core.execute(f.db,actor,{...scope,...prep}),/expired/);await f.core.abort(f.db,actor,{...scope,...prep});
 }finally{await f.close()}
});
test('native preparation drains an in-flight target writer; other-store writes continue during backup/execution',{skip:!isolated},async()=>{
 let enteredBackup,releaseBackup;const backupEntered=new Promise(r=>enteredBackup=r),backupRelease=new Promise(r=>releaseBackup=r);
 const f=await fixture({afterVerified:async()=>{enteredBackup();await backupRelease}});let releaseWriter;const writerRelease=new Promise(r=>releaseWriter=r);let enteredWriter;const writerEntered=new Promise(r=>enteredWriter=r);
 try{
  await f.core.install(f.db,actor,scope);
  const writer=f.db.$transaction(async tx=>{await tx.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('inflight','company','target',5)`);enteredWriter();await writerRelease},{timeout:10000});await writerEntered;
  let prepared=false;const pending=f.core.prepare(f.db,actor,scope,'RESET').then(v=>{prepared=true;return v});await new Promise(r=>setTimeout(r,80));assert.equal(prepared,false);releaseWriter();await writer;const prep=await pending;assert.equal(prep.counts.find(r=>r.table==='Sale').count,2);
  const executing=f.core.execute(f.db,actor,{...scope,...prep});await backupEntered;
  await assert.rejects(f.db.$executeRawUnsafe(`UPDATE "Sale" SET "amount"=9 WHERE "id"='sale'`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('sibling-during-execute','company','sibling',6)`);releaseBackup();await executing;
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Sale" WHERE "id"='sibling-during-execute'`))[0].n,1);
 }finally{releaseWriter?.();releaseBackup?.();await f.close()}
});

test('native active shift guard rolls preparation back; closing the synthetic shift permits a new preparation',{skip:!isolated},async()=>{
 const extraManifest={...manifest,tables:[...manifest.tables,{name:'CashShiftSession',owner:{kind:'DIRECT'},reset:'REMOVE'}]},f=await fixture({extraManifest});
 try{await f.db.$executeRawUnsafe(`CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text REFERENCES "Store"("id"),"status" text)`);await f.db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES('shift','company','target','OPEN')`);await f.core.install(f.db,actor,scope);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Active shift/);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);await f.db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`);const prep=await f.core.prepare(f.db,actor,scope,'RESET');await f.core.abort(f.db,actor,{...scope,...prep});assert.equal(f.proofCalls(),0)}finally{await f.close()}
});

const rawOwnershipManifest={...manifest,id:'ISOLATED_REVIEWED_RAW_LINKS_V1',streaming:true,reviewedColumns:[...manifest.reviewedColumns,'RawChild.parentId','BaseIdentity.baseStoreId','BaseChild.identityId'],tables:[...manifest.tables,
 {name:'RawChild',owner:{kind:'LINK',parent:'RawParent',columns:[['parentId','id']]},reset:'REMOVE'},
 {name:'RawParent',owner:{kind:'DIRECT'},reset:'REMOVE'},
 {name:'BaseChild',owner:{kind:'LINK',parent:'BaseIdentity',columns:[['identityId','id']]},reset:'REMOVE'},
 {name:'BaseIdentity',owner:{kind:'BASE_STORE'},reset:'REMOVE'}
]};
const rawOwnershipDdl=(schema,{unique=true,nullable=false}={})=>[
 `CREATE TABLE "${schema}"."RawParent"("id" text ${unique?'PRIMARY KEY':'NOT NULL'},"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${schema}"."Store"("id"))`,
 `CREATE TABLE "${schema}"."RawChild"("id" text PRIMARY KEY,"companyId" text NOT NULL,"parentId" text ${nullable?'':'NOT NULL'},"amount" numeric(30,9))`,
 `CREATE TABLE "${schema}"."BaseIdentity"("id" text PRIMARY KEY,"companyId" text NOT NULL,"baseStoreId" text)`,
 `CREATE TABLE "${schema}"."BaseChild"("id" text PRIMARY KEY,"identityId" text NOT NULL,"value" text)`
];
async function populateRawOwnership(db){
 await db.$executeRawUnsafe(`INSERT INTO "RawParent" VALUES('raw-target','company','target'),('raw-sibling','company','sibling'),('raw-foreign','other','foreign')`);
 await db.$executeRawUnsafe(`INSERT INTO "RawChild" VALUES('child-target','company','raw-target',9007199254740993.123456789),('child-sibling','company','raw-sibling',2),('child-foreign','other','raw-foreign',3)`);
 await db.$executeRawUnsafe(`INSERT INTO "BaseIdentity" VALUES('identity-target','company','target'),('identity-sibling','company','sibling'),('identity-global','company',NULL)`);
 await db.$executeRawUnsafe(`INSERT INTO "BaseChild" VALUES('base-child-target','identity-target','TARGET'),('base-child-sibling','identity-sibling','CONTROL'),('base-child-global','identity-global','UNASSIGNED GLOBAL CONTROL')`);
}
async function rawFixture(options={}){return fixture({extraManifest:rawOwnershipManifest,extraDdl:s=>rawOwnershipDdl(s,options),populate:async(db,s)=>{await populateRawOwnership(db);if(options.populate)await options.populate(db,s)}})}

test('raw ownership is explicit, acyclic and requires distinct paired column names',()=>{
 const opts={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)};
 for(const columns of [[['parentId','id'],['parentId','other']],[['parentId','id'],['other','id']],[],[['parentId']]]){
  const bad=structuredClone(rawOwnershipManifest);bad.tables.find(t=>t.name==='RawChild').owner.columns=columns;assert.throws(()=>createLifecycleExecutionCore(bad,opts),/Invalid ownership columns/);
 }
 const bad=structuredClone(rawOwnershipManifest);bad.tables.find(t=>t.name==='RawChild').owner.parent='RawChild';assert.throws(()=>createLifecycleExecutionCore(bad,opts),/Cyclic ownership/);
});

test('native reviewed raw/base ownership restores exact scoped rows, deletes children first and blocks retired raw references without affecting global controls',{skip:!isolated},async()=>{
 const f=await rawFixture();try{
  const before=await f.snapshot();await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "RawChild" VALUES('busy','company','raw-target',1)`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  const result=await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(f.proofCalls(),1);
  const order=result.deleted.map(t=>t.table);assert.ok(order.indexOf('RawChild')<order.indexOf('RawParent'));assert.ok(order.indexOf('BaseChild')<order.indexOf('BaseIdentity'));
  const after=await f.snapshot(),removed=new Set(['raw-target','child-target','identity-target','base-child-target']);
  for(const name of ['RawParent','RawChild','BaseIdentity','BaseChild'])assert.deepEqual(after[name],before[name].filter(r=>!removed.has(JSON.parse(r.row).id)));
  for(const name of ['Store','Product','StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings'])assert.deepEqual(after[name],before[name]);
  const retired=await f.db.$queryRawUnsafe(`SELECT "parentTable","refColumns","refValues","generation"::text AS generation FROM "StoreLifecycleTombstone" ORDER BY "parentTable"`);
  assert.deepEqual(retired,[{parentTable:'BaseIdentity',refColumns:['id'],refValues:['identity-target'],generation:'0'},{parentTable:'RawParent',refColumns:['id'],refValues:['raw-target'],generation:'0'}]);
  assert.equal((await f.core.execute(f.db,actor,{...scope,...prep})).idempotentReplay,true);assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreLifecycleTombstone"`))[0].count,2);
  // Fixture-only reopen; the production application has no safe-reopen endpoint.
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`);
  for(const sql of [`INSERT INTO "RawChild" VALUES('old-raw','company','raw-target',1)`,`INSERT INTO "BaseChild" VALUES('old-base','identity-target','OLD')`]){
   await assert.rejects(f.db.$executeRawUnsafe(sql),matches(/STORE_LIFECYCLE_RETIRED_REFERENCE/));
   await assert.rejects(f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations','{"target":"1"}',true)`);await tx.$executeRawUnsafe(sql)}),matches(/STORE_LIFECYCLE_RETIRED_REFERENCE/));
  }
  await f.db.$executeRawUnsafe(`INSERT INTO "RawChild" VALUES('unaffected-sibling','company','raw-sibling',4)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "BaseChild" VALUES('unaffected-global','identity-global','GLOBAL')`);
  // Existing behavior for an unbound, unrelated company row is not made a new universal FK.
  await f.db.$executeRawUnsafe(`INSERT INTO "RawChild" VALUES('unrelated-unbound','other','unknown-parent',5)`);
 }finally{await f.close()}
});

test('native raw ownership refuses ambiguous/nullable parents and preexisting unowned links before any cleanup',{skip:!isolated},async()=>{
 for(const options of [{unique:false},{nullable:true},{populate:db=>db.$executeRawUnsafe(`INSERT INTO "RawChild" VALUES('orphan','other','missing-parent',1)`)}]){
  const f=await rawFixture(options);try{
   const before=await f.snapshot();await assert.rejects(f.core.install(f.db,actor,scope),/unique parent key|non-null keys|Unowned application reference/);assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);
  }finally{await f.close()}
 }
});

test('native scoped snapshots reject inconsistent company rows and leave maintenance, source and recovery untouched',{skip:!isolated},async()=>{
 for(const table of ['Sale','RawChild','BaseIdentity']){
  const f=await rawFixture({populate:db=>db.$executeRawUnsafe(`UPDATE "${table}" SET "companyId"='other' WHERE "id"='${table==='Sale'?'sale':table==='RawChild'?'child-target':'identity-target'}'`)});try{
   await f.core.install(f.db,actor,scope);const before=await f.snapshot();await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/company mismatch/);assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);
  }finally{await f.close()}
 }
});

test('typed ownership accepts only reviewed exact text discriminator constants',()=>{
 const opts={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)};
 for(const match of [null,[],{},'DISPATCH_NOTE',{kind:3},{kind:''}]){const bad=structuredClone(rawOwnershipManifest);bad.tables.find(t=>t.name==='RawChild').owner.match=match;assert.throws(()=>createLifecycleExecutionCore(bad,opts),/Invalid typed application ownership/)}
 const bad=structuredClone(rawOwnershipManifest);bad.tables.find(t=>t.name==='RawParent').owner.match={kind:'DISPATCH_NOTE'};assert.throws(()=>createLifecycleExecutionCore(bad,opts),/Invalid typed application ownership/);
});

test('native typed raw links preserve other aggregate domains with identical IDs and reject only retired matching references',{skip:!isolated},async()=>{
 const extraManifest={...rawOwnershipManifest,reviewedColumns:[...rawOwnershipManifest.reviewedColumns,'TypedOutbox.aggregateId'],tables:[...rawOwnershipManifest.tables,{name:'TypedOutbox',owner:{kind:'LINK',parent:'RawParent',columns:[['aggregateId','id']],match:{aggregateType:'DISPATCH_NOTE'}},reset:'REMOVE'}]};
 const f=await fixture({extraManifest,extraDdl:s=>[...rawOwnershipDdl(s),`CREATE TABLE "${s}"."TypedOutbox"("id" text PRIMARY KEY,"companyId" text NOT NULL,"aggregateType" text NOT NULL,"aggregateId" text NOT NULL)`],populate:async db=>{
  await populateRawOwnership(db);
  await db.$executeRawUnsafe(`INSERT INTO "TypedOutbox" VALUES('owned','company','DISPATCH_NOTE','raw-target'),('different-domain','other','OTHER','raw-target'),('unrelated-unbound','other','OTHER','never-a-parent'),('sibling','company','DISPATCH_NOTE','raw-sibling')`);
 }});
 try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot(),prep=await f.core.prepare(f.db,actor,scope,'RESET');await f.core.execute(f.db,actor,{...scope,...prep});const after=await f.snapshot();assert.deepEqual(after.TypedOutbox,before.TypedOutbox.filter(r=>JSON.parse(r.row).id!=='owned'));
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`);
  await assert.rejects(f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations','{"target":"1"}',true)`);await tx.$executeRawUnsafe(`INSERT INTO "TypedOutbox" VALUES('old-matching','company','DISPATCH_NOTE','raw-target')`)}),matches(/STORE_LIFECYCLE_RETIRED_REFERENCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "TypedOutbox" VALUES('new-other-domain','other','OTHER','raw-target')`);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreLifecycleTombstone"`))[0].count,2);
 }finally{await f.close()}
});

const referenceManifest={...rawOwnershipManifest,reviewedColumns:[...rawOwnershipManifest.reviewedColumns,'ReferenceHolder.parentId'],tables:[...rawOwnershipManifest.tables,{name:'ReferenceHolder',owner:{kind:'DIRECT'},references:[{parent:'RawParent',columns:[['parentId','id']]}],reset:'REMOVE'}]};
async function referenceFixture({foreign=false,declared=false}={}){const reviewed=structuredClone(referenceManifest);if(declared)delete reviewed.tables.find(t=>t.name==='ReferenceHolder').references;return fixture({extraManifest:reviewed,extraDdl:s=>[...rawOwnershipDdl(s),`CREATE TABLE "${s}"."ReferenceHolder"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${s}"."Store"("id"),"parentId" text${declared?` REFERENCES "${s}"."RawParent"("id") ON DELETE CASCADE`:""})`],populate:async db=>{
 await populateRawOwnership(db);await db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('holder-target','company','target','raw-target'),('holder-empty','company','target',NULL),('holder-sibling','company','sibling','raw-sibling')`);
 if(foreign)await db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('foreign-reference','company','sibling','raw-target')`);
}})}

test('secondary raw references require an explicit existing parent and validated column/type mappings',()=>{
 const opts={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)};
 for(const references of [null,{},[{parent:'Missing',columns:[['parentId','id']]}],[{parent:'RawParent',columns:[]}],[{parent:'RawParent',columns:[['parentId','id']],match:{kind:1}}]]){
  const bad=structuredClone(referenceManifest);bad.tables.find(t=>t.name==='ReferenceHolder').references=references;assert.throws(()=>createLifecycleExecutionCore(bad,opts),/Invalid reviewed application references/);
 }
});

test('native non-owning raw references fence every touched store and reject parentless replay outside the cleared owner',{skip:!isolated},async()=>{
 const f=await referenceFixture();try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot(),prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('blocked-cross','company','sibling','raw-target')`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('other-live','company','sibling','raw-sibling')`);
  const result=await f.core.execute(f.db,actor,{...scope,...prep});const order=result.deleted.map(t=>t.table);assert.ok(order.indexOf('ReferenceHolder')<order.indexOf('RawParent'));
  const after=await f.snapshot();assert.deepEqual(after.StoreInstallationTerminal,before.StoreInstallationTerminal);assert.deepEqual(after.Product,before.Product);
  assert.equal(after.ReferenceHolder.length,2);assert.ok(after.ReferenceHolder.every(r=>JSON.parse(r.row).storeId==='sibling'));
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`);
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('late-cross','company','sibling','raw-target')`),matches(/STORE_LIFECYCLE_RETIRED_REFERENCE/));
  await f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations','{"target":"1"}',true)`);await tx.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('fresh-null','company','target',NULL)`)});
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreLifecycleTombstone"`))[0].count,2);
 }finally{await f.close()}
});

test('native preexisting other-store references to the selected raw parent block preparation without altering either owner',{skip:!isolated},async()=>{
 const f=await referenceFixture({foreign:true});try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot();await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Cross-store dependency/);assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);
 }finally{await f.close()}
});

// Declared foreign keys affect write protection, never inferred deletion ownership.
test('native declared secondary FK fences a sibling insert racing the frozen parent before CASCADE can delete another store', {skip:!isolated},async()=>{
 const f=await referenceFixture({declared:true});try{
  await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('cascade-race','company','sibling','raw-target')`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "ReferenceHolder" VALUES('sibling-live','company','sibling','raw-sibling')`);
  const before=await f.snapshot();await f.core.execute(f.db,actor,{...scope,...prep});const after=await f.snapshot();
  assert.deepEqual(after.ReferenceHolder,before.ReferenceHolder.filter(r=>JSON.parse(r.row).storeId==='sibling'));
  assert.deepEqual(after.StoreInstallationTerminal,before.StoreInstallationTerminal);
 }finally{await f.close()}
});

const drainManifest={...manifest,streaming:true,reviewedColumns:[...manifest.reviewedColumns,'CloudDevice.metadata'],tables:[...manifest.tables,{name:'CloudDevice',owner:{kind:'DIRECT'},reset:'KEEP'}]};
async function drainFixture(){return fixture({extraManifest:drainManifest,extraDdl:s=>[`CREATE TABLE "${s}"."CloudDevice"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${s}"."Store"("id"),"status" text,"lastSeenAt" timestamptz,"metadata" jsonb)`],populate:db=>db.$executeRawUnsafe(`INSERT INTO "CloudDevice" VALUES('writer','company','target','ACTIVE',NOW(),'{"binding":"PRIVATE PRESERVED"}'),('other-writer','company','sibling','ACTIVE',NOW(),'{}')`)})}
test('native RESET drain freezes new target work, preserves both registers and waits for connector quiet before preparing or executing',{skip:!isolated},async()=>{
 const f=await drainFixture();try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot(),drain=await f.core.beginDrain(f.db,actor,scope,'RESET');assert.equal(drain.state,'DRAINING');assert.equal(drain.executionAvailable,false);assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('busy','company','target',1)`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('sibling-live','company','sibling',1)`);
  await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/maintenance/);
  await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET',{drainOperationId:randomUUID()}),/Drain operation/);
  await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET',{drainOperationId:drain.operationId}),/Active shift, operator, Writer/);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "state" FROM "StoreLifecycleExecution" WHERE "id"=$1`,drain.operationId))[0].state,'DRAINING');assert.equal(f.proofCalls(),0);
  const draining=(await f.db.$queryRawUnsafe(`SELECT "snapshotHash" FROM "StoreLifecycleExecution" WHERE "id"=$1`,drain.operationId))[0];
  await assert.rejects(f.core.execute(f.db,actor,{...scope,...drain,snapshotHash:draining.snapshotHash}),/expired or unavailable/);
  // Fixture-only simulation of passage of time; production must observe real quiet.
  await f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_operation',$1,true)`,drain.operationId);await tx.$executeRawUnsafe(`UPDATE "CloudDevice" SET "lastSeenAt"=NOW()-INTERVAL '2 minutes' WHERE "id"='writer'`)});
  const prepared=await f.core.prepare(f.db,actor,scope,'RESET',{drainOperationId:drain.operationId});assert.equal(prepared.operationId,drain.operationId);
  const beforeExecution=await f.snapshot();await f.core.execute(f.db,actor,{...scope,...prepared});const after=await f.snapshot();assert.equal(f.proofCalls(),1);
  for(const name of ['Store','CloudDevice','StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings'])assert.deepEqual(after[name],beforeExecution[name]);
  assert.ok(after.Sale.every(row=>JSON.parse(row.row).storeId!=='target'));assert.ok(after.Sale.some(row=>JSON.parse(row.row).id==='sibling-live'));
 }finally{await f.close()}
});
test('native an unexecuted drain can be explicitly aborted without deletion or epoch upgrade; expired or changed source drains cannot prepare',{skip:!isolated},async()=>{
 const f=await drainFixture();try{
  await f.core.install(f.db,actor,scope);const before=await f.snapshot(),drain=await f.core.beginDrain(f.db,actor,scope,'RESET');
  await assert.rejects(f.core.abort(f.db,actor,{...scope,storeId:'sibling',operationId:drain.operationId}),/unexecuted/);
  const changed=createLifecycleExecutionCore(drainManifest,{persistAndVerifyRecovery:async()=>assert.fail('unexpected recovery'),sourceRevision:'2'.repeat(40)});
  await assert.rejects(changed.prepare(f.db,actor,scope,'RESET',{drainOperationId:drain.operationId}),/Drain operation/);
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleExecution" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "id"=$1`,drain.operationId);
  await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET',{drainOperationId:drain.operationId}),/Drain operation/);
  await f.core.abort(f.db,actor,{...scope,operationId:drain.operationId});assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);
  assert.deepEqual((await f.db.$queryRawUnsafe(`SELECT "generation"::text AS generation,"maintenance","operationId" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0],{generation:'0',maintenance:false,operationId:null});
  await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('resumed','company','target',1)`);
 }finally{await f.close()}
});

test('reviewed existing guards require exact bounded metadata and cannot impersonate lifecycle guards',()=>{
 const options={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)},good={name:'old_guard',functionSchema:'public',functionName:'old_guard_fn',enabled:'O',mask:23,attributes:'',condition:null,definer:false,language:'plpgsql',bodySha256:'1'.repeat(64)};
 for(const existingTriggers of [null,{},[{...good,bodySha256:'bad'}],[{...good,enabled:'D'}],[{...good,definer:true}],[{...good,name:'mws_lifecycle_unsafe'}],[good,good]]){const reviewed=structuredClone(manifest);reviewed.tables.find(t=>t.name==='Sale').existingTriggers=existingTriggers;assert.throws(()=>createLifecycleExecutionCore(reviewed,options),/Invalid reviewed existing triggers/)}
 assert.throws(()=>createLifecycleExecutionCore({...manifest,knownTables:['Store','Store']},options),/Invalid reviewed database catalogue/);
});
test('native exact reviewed business triggers remain active alongside lifecycle guards and drift is refused before maintenance',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const body=`BEGIN IF NEW."amount"<0 THEN RAISE EXCEPTION 'EXISTING_AMOUNT_GUARD' USING ERRCODE='55000'; END IF; RETURN NEW; END;`;
  await f.db.$executeRawUnsafe(`CREATE FUNCTION "${f.schema}".existing_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $body$${body}$body$`);
  await f.db.$executeRawUnsafe(`CREATE TRIGGER existing_amount BEFORE INSERT OR UPDATE OF "amount" ON "Sale" FOR EACH ROW EXECUTE FUNCTION existing_amount_guard()`);
  const reviewed=structuredClone(manifest);reviewed.tables.find(t=>t.name==='Sale').existingTriggers=[{name:'existing_amount',functionSchema:f.schema,functionName:'existing_amount_guard',enabled:'O',mask:23,attributeNames:['amount'],condition:null,definer:false,language:'plpgsql',bodySha256:createHash('sha256').update(body).digest('hex')}];
  const core=createLifecycleExecutionCore(reviewed,{persistAndVerifyRecovery:async()=>assert.fail('unexpected proof'),sourceRevision:'1'.repeat(40)});await core.install(f.db,actor,scope);
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('negative','company','target',-1)`),matches(/EXISTING_AMOUNT_GUARD/));await f.db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('allowed','company','target',1)`);
  const prep=await core.prepare(f.db,actor,scope,'RESET');await core.abort(f.db,actor,{...scope,operationId:prep.operationId});
  const before=await f.snapshot();await f.db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${f.schema}".existing_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
  await assert.rejects(core.prepare(f.db,actor,scope,'RESET'),/Changed reviewed database guard/);assert.deepEqual(await f.snapshot(),before);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);
 }finally{await f.close()}
});
test('native closed database catalogue rejects unreviewed global relations even without an obvious store key',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const reviewed={...manifest,knownTables:[...manifest.tables.map(t=>t.name),'Product']};const core=createLifecycleExecutionCore(reviewed,{persistAndVerifyRecovery:async()=>assert.fail('unexpected proof'),sourceRevision:'1'.repeat(40)});
  await f.db.$executeRawUnsafe(`CREATE TABLE "UnreviewedGlobal"("value" integer)`);const before=await f.snapshot();await assert.rejects(core.install(f.db,actor,scope),/Unreviewed database relation/);assert.deepEqual(await f.snapshot(),before);
  await f.db.$executeRawUnsafe(`DROP TABLE "UnreviewedGlobal"`);await core.install(f.db,actor,scope);await f.db.$executeRawUnsafe(`CREATE TABLE "UnreviewedGlobal"("value" integer)`);await assert.rejects(core.prepare(f.db,actor,scope,'RESET'),/Unreviewed database relation/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close()}
});
test('native table rewrite rules and inheritance refuse preparation before recovery or deletion',{skip:!isolated},async()=>{
 for(const ddl of [`CREATE RULE refuse_delete AS ON DELETE TO "Sale" DO INSTEAD NOTHING`,`CREATE TABLE "InheritedSale"() INHERITS ("Sale")`]){
  const f=await fixture();try{await f.core.install(f.db,actor,scope);const before=await f.snapshot();await f.db.$executeRawUnsafe(ddl);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Complex or RLS relation/);assert.deepEqual(await f.snapshot(),before);assert.equal(f.proofCalls(),0);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false)}finally{await f.close()}
 }
});
test('native logical snapshot signature does not depend on physical unique index creation order',{skip:!isolated},async()=>{
 const f=await rawFixture();try{
  await f.db.$executeRawUnsafe(`CREATE UNIQUE INDEX raw_company_identity ON "RawParent"("companyId","id")`);await f.core.install(f.db,actor,scope);
  const first=await f.core.prepare(f.db,actor,scope,'RESET');await f.core.abort(f.db,actor,{...scope,operationId:first.operationId});
  await f.db.$executeRawUnsafe(`ALTER TABLE "RawParent" DROP CONSTRAINT "RawParent_pkey"`);await f.db.$executeRawUnsafe(`ALTER TABLE "RawParent" ADD PRIMARY KEY ("id")`);
  const second=await f.core.prepare(f.db,actor,scope,'RESET');assert.equal(second.snapshotHash,first.snapshotHash);await f.core.abort(f.db,actor,{...scope,operationId:second.operationId});assert.equal(f.proofCalls(),0);
 }finally{await f.close()}
});

const historicalPeerManifest={...manifest,streaming:true,resetPolicy:'FRESH_STORE_V1',reviewedColumns:[...manifest.reviewedColumns,'PeerA.peerId','PeerB.peerId'],tables:[...manifest.tables,
 {name:'PeerA',owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'PeerB',columns:[['peerId','id']],historical:true}]},
 {name:'PeerB',owner:{kind:'DIRECT'},reset:'REMOVE',references:[{parent:'PeerA',columns:[['peerId','id']],historical:true}]}
]};
const historicalPeerDdl=s=>['PeerA','PeerB'].map(name=>`CREATE TABLE "${s}"."${name}"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${s}"."Store"("id"),"peerId" text)`);
async function historicalPeerFixture(){return fixture({extraManifest:historicalPeerManifest,extraDdl:historicalPeerDdl,populate:async db=>{
 await db.$executeRawUnsafe(`INSERT INTO "PeerA" VALUES('a','company','target','b'),('a-control','company','sibling','already-absent-history')`);
 await db.$executeRawUnsafe(`INSERT INTO "PeerB" VALUES('b','company','target','a'),('b-control','company','sibling','a-control')`);
}})}
test('native historical non-owning cycles restore and clear scoped rows without weakening retired-key or register controls',{skip:!isolated},async()=>{
 const f=await historicalPeerFixture();try{
  const before=await f.snapshot();await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(f.proofCalls(),1);
  const after=await f.snapshot();for(const name of ['PeerA','PeerB'])assert.deepEqual(after[name],before[name].filter(row=>JSON.parse(row.row).storeId!=='target'));
  for(const name of ['Store','Product','StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings'])assert.deepEqual(after[name],before[name]);
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`);
  await assert.rejects(f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT set_config('mws.lifecycle_generations','{"target":"1"}',true)`);await tx.$executeRawUnsafe(`INSERT INTO "PeerA" VALUES('replay','company','target','b')`)}),matches(/STORE_LIFECYCLE_RETIRED_REFERENCE/));
  await f.db.$executeRawUnsafe(`INSERT INTO "PeerA" VALUES('unrelated-history','company','sibling','other-absent-history')`);
 }finally{await f.close()}
});
test('native historical references still refuse existing cross-store links and maintenance races',{skip:!isolated},async()=>{
 const f=await historicalPeerFixture();try{
  await f.db.$executeRawUnsafe(`UPDATE "PeerB" SET "peerId"='a' WHERE "id"='b-control'`);await f.core.install(f.db,actor,scope);
  await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Cross-store dependency/);assert.equal(f.proofCalls(),0);
  await f.db.$executeRawUnsafe(`UPDATE "PeerB" SET "peerId"='a-control' WHERE "id"='b-control'`);
  const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT INTO "PeerB" VALUES('other-race','company','sibling','a')`),matches(/STORE_LIFECYCLE_MAINTENANCE/));
  await f.core.abort(f.db,actor,{...scope,operationId:prep.operationId});assert.equal(f.proofCalls(),0);
 }finally{await f.close()}
});
test('reviewed value guards cannot silently accept an unknown rule or empty allowed set',()=>{
 const options={persistAndVerifyRecovery:async()=>{},sourceRevision:'1'.repeat(40)};
 for(const valueGuards of [null,{},[{table:'Unknown',column:'kind',allowed:['MYDATA']}],[{table:'Sale',column:'kind',allowed:[]}],[{table:'Sale',column:'kind',allowed:[null]}],[{table:'Sale',column:'kind',allowed:['MYDATA','MYDATA']}]])assert.throws(()=>createLifecycleExecutionCore({...manifest,valueGuards},options),/Invalid reviewed value guards/);
});
test('native fresh-profile value guard removes only reviewed business credentials and refuses a future physical kind before recovery',{skip:!isolated},async()=>{
 const m={...manifest,streaming:true,resetPolicy:'FRESH_STORE_V1',valueGuards:[{table:'StoreIntegrationCredential',column:'kind',allowed:['MYDATA','VAT_LOOKUP']}],tables:[...manifest.tables,{name:'StoreIntegrationCredential',owner:{kind:'DIRECT'},reset:'REMOVE'}]};
 const f=await fixture({extraManifest:m,extraDdl:s=>[`CREATE TABLE "${s}"."StoreIntegrationCredential"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "${s}"."Store"("id"),"kind" text NOT NULL,"secret" text NOT NULL)`],populate:async db=>{await db.$executeRawUnsafe(`INSERT INTO "StoreIntegrationCredential" VALUES('target-credential','company','target','FUTURE_FISCAL','PRIVATE RETAINED UNTIL REVIEW'),('control-credential','company','sibling','FUTURE_FISCAL','UNTOUCHED CONTROL')`)}});
 try{
  const before=await f.snapshot();await f.core.install(f.db,actor,scope);await assert.rejects(f.core.prepare(f.db,actor,scope,'RESET'),/Unreviewed value in selected store/);assert.equal(f.proofCalls(),0);assert.deepEqual(await f.snapshot(),before);
  await f.db.$executeRawUnsafe(`UPDATE "StoreIntegrationCredential" SET "kind"='MYDATA' WHERE "id"='target-credential'`);
  const prep=await f.core.prepare(f.db,actor,scope,'RESET');await f.core.execute(f.db,actor,{...scope,...prep});assert.equal(f.proofCalls(),1);
  const after=await f.snapshot();assert.deepEqual(after.StoreIntegrationCredential,before.StoreIntegrationCredential.filter(row=>JSON.parse(row.row).storeId==='sibling'));for(const name of ['StoreInstallationTerminal','StoreFiscalDevice','StoreEftposDevice','StoreRbsInstallationSettings'])assert.deepEqual(after[name],before[name]);
 }finally{await f.close()}
});
test('native closed column catalogue rejects an unscoped scalar reference even without an Id or JSON name',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const columns=await f.db.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,f.schema);
  const knownTables=[...manifest.tables.map(t=>t.name),'Product'],knownColumns=Object.fromEntries(knownTables.map(name=>[name,columns.filter(c=>c.table===name).map(c=>[c.name,c.type,c.notNull])]));
  const core=createLifecycleExecutionCore({...manifest,knownTables,knownColumns},{sourceRevision:'1'.repeat(40),persistAndVerifyRecovery:async()=>assert.fail('drift reached recovery')});
  await core.install(f.db,actor,scope);const before=await f.snapshot();
  await f.db.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "selectedRecord" text`);
  await assert.rejects(core.prepare(f.db,actor,scope,'RESET'),/Reviewed column catalogue changed: Product/);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);
  await f.db.$executeRawUnsafe(`ALTER TABLE "Product" DROP COLUMN "selectedRecord"`);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close()}
});
test('native inspection is read-only before enrollment, exposes no execution methods or row contents and rejects partial guards',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const inspector=createLifecycleInspectionCore(manifest,{sourceRevision:'1'.repeat(40)});assert.deepEqual(Object.keys(inspector),['inspect']);assert.ok(Object.isFrozen(inspector));
  const before=await f.snapshot();await assert.rejects(inspector.inspect(f.db,actor,{companyId:'other',storeId:'target'}),e=>e.status===404);
  const view=await inspector.inspect(f.db,actor,scope);assert.equal(view.guardsInstalled,false);assert.equal(view.executionAvailable,false);assert.equal(view.recoveryVerified,false);assert.equal(view.withinSnapshotLimits,true);assert.equal(view.counts.find(t=>t.table==='Sale').count,1);assert.equal(view.counts.find(t=>t.table==='StoreInstallationTerminal').count,2);assert.equal('snapshotHash' in view,false);assert.equal(view.inspectionFingerprint.length,64);assert.ok(!JSON.stringify(view).includes('PRIVATE RETAINED'));assert.equal((await f.db.$queryRawUnsafe(`SELECT to_regclass(format('%I.%I',current_schema(),'StoreLifecycleFence'))::text AS name`))[0].name,null);assert.deepEqual(await f.snapshot(),before);
  await f.core.install(f.db,actor,scope);assert.equal((await inspector.inspect(f.db,actor,scope)).guardsInstalled,true);
  const name='mws_lifecycle_'+createHash('sha256').update(JSON.stringify('Sale')).digest('hex').slice(0,16);await f.db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "Sale"`);
  await assert.rejects(inspector.inspect(f.db,actor,scope),/Missing or additional database guards|Partially installed/);assert.equal(f.proofCalls(),0);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close()}
});
test('native drain refuses active durable OCR work but can freeze a queued job without processing it',{skip:!isolated},async()=>{
 const m={...manifest,tables:[...manifest.tables,{name:'PosInvoiceBackgroundTask',owner:{kind:'DIRECT'},reset:'REMOVE'},{name:'AiReaderJob',owner:{kind:'DIRECT'},reset:'REMOVE'},{name:'NetlinkTransaction',owner:{kind:'DIRECT'},reset:'REMOVE'}]},f=await fixture({extraManifest:m,extraDdl:s=>[`CREATE TABLE "${s}"."PosInvoiceBackgroundTask"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"state" text)`,`CREATE TABLE "${s}"."AiReaderJob"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text)`,`CREATE TABLE "${s}"."NetlinkTransaction"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text)`],populate:async db=>{await db.$executeRawUnsafe(`INSERT INTO "PosInvoiceBackgroundTask" VALUES('active','company','target','RUNNING')`);await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob" VALUES('ai','company','target','AI_COMPLETE')`);await db.$executeRawUnsafe(`INSERT INTO "NetlinkTransaction" VALUES('netlink','company','target','COMPLETED')`)}});
 try{
  await f.core.install(f.db,actor,scope);await assert.rejects(f.core.beginDrain(f.db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);assert.equal(f.proofCalls(),0);
  await f.db.$executeRawUnsafe(`UPDATE "PosInvoiceBackgroundTask" SET "state"='QUEUED' WHERE "id"='active'`);
  await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "status"='POS_PROCESSING' WHERE "id"='ai'`);await assert.rejects(f.core.beginDrain(f.db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "status"='AI_COMPLETE' WHERE "id"='ai'`);
  await f.db.$executeRawUnsafe(`UPDATE "NetlinkTransaction" SET "status"='EXECUTING' WHERE "id"='netlink'`);await assert.rejects(f.core.beginDrain(f.db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);await f.db.$executeRawUnsafe(`UPDATE "NetlinkTransaction" SET "status"='FAILED' WHERE "id"='netlink'`);
  const drain=await f.core.beginDrain(f.db,actor,scope,'RESET');assert.equal(drain.state,'DRAINING');assert.equal((await f.db.$queryRawUnsafe(`SELECT "state" FROM "PosInvoiceBackgroundTask"`))[0].state,'QUEUED');await f.core.abort(f.db,actor,{...scope,operationId:drain.operationId});
 }finally{await f.close()}
});
test('native drain honors an actual myDATA receiving lock acquired before fence enrollment without taking that lock for read-only inspection',{skip:!isolated},async()=>{
 const m={...manifest,tables:[...manifest.tables,{name:'MyDataInboundDocument',owner:{kind:'DIRECT'},reset:'REMOVE'}]},f=await fixture({extraManifest:m,extraDdl:s=>[`CREATE TABLE "${s}"."MyDataInboundDocument"("id" text PRIMARY KEY,"companyId" text,"storeId" text)`]});
 let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);let receiving;
 try{
  receiving=f.db.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text`,'mydata:company:target');entered();await gate},{timeout:20000});await started;
  const view=await f.core.inspect(f.db,actor,scope);assert.equal(view.backgroundLocksChecked,false);assert.equal(view.executionAvailable,false);
  await f.core.install(f.db,actor,scope);await assert.rejects(f.core.beginDrain(f.db,actor,scope,'RESET'),/Active shift, operator, Writer or fiscal work/);assert.equal(f.proofCalls(),0);
  release();await receiving;const drain=await f.core.beginDrain(f.db,actor,scope,'RESET');await f.core.abort(f.db,actor,{...scope,operationId:drain.operationId});
 }finally{release?.();if(receiving)await receiving.catch(()=>{});await f.close()}
});

test('native queued recovery metadata drives real full archive and selective restore with exact bigints, retained registers and global/sibling controls',{skip:!isolated},async()=>{
 const {spawnSync}=await import('node:child_process'),{writeFile,chmod}=await import('node:fs/promises');
 const selected={...manifest,streaming:true},f=await fixture({extraManifest:selected});
 const directory=await mkdtemp(path.join(tmpdir(),'mws-private-archive-test-'));
 try{
  const before=await f.snapshot();await f.core.install(f.db,actor,scope);const prep=await f.core.prepare(f.db,actor,scope,'RESET');
  const queued=(await f.db.$queryRawUnsafe(`SELECT "result" FROM "${f.schema}"."StoreLifecycleExecution" WHERE "id"=$1`,prep.operationId))[0].result.recoveryRequest;
  assert.equal(queued.operationId,prep.operationId);const metadata=JSON.parse(queued.snapshotMetadataJson);assert.equal(metadata.snapshotHash,prep.snapshotHash);assert.ok(metadata.tables.every(t=>!('rows' in t)));
  assert.equal(lifecycleExecutionSnapshotHash(metadata),prep.snapshotHash);
  const archive=path.join(directory,'fixture.dump'),jobFile=path.join(directory,'job.json'),manifestFile=path.join(directory,'manifest.json');
  await writeFile(jobFile,JSON.stringify(queued),{mode:0o600});await writeFile(manifestFile,JSON.stringify(selected),{mode:0o600});
  const dump=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--schema='+f.schema,'--file='+archive,process.env.DATABASE_URL],{encoding:'utf8',timeout:60000});
  assert.equal(dump.status,0,'isolated pg_dump must be available and succeed');await chmod(archive,0o600);
  const script=`import json,sys;sys.path.insert(0,sys.argv[1]);from verify_restore import verify_archive;print(json.dumps(verify_archive(sys.argv[2],json.load(open(sys.argv[3])),json.load(open(sys.argv[4])),sys.argv[5])))`;
  const result=spawnSync('python3',['-c',script,path.resolve('../ops/backup/lifecycle'),archive,jobFile,manifestFile,path.resolve('scripts/store-lifecycle-verify-copy.py')],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
  assert.equal(result.status,0,'private PostgreSQL full/selective restoration failed: '+result.stderr.slice(-4000));
  const proof=JSON.parse(result.stdout);assert.equal(proof.restoredSnapshotHash,prep.snapshotHash);assert.equal(proof.selectiveRestoreVerified,true);assert.equal(proof.controlsUnchanged,true);assert.equal(proof.fullRestoreAudit.dataMatches,true);assert.equal(proof.selectiveRestoreAudit.dataMatches,true);assert.ok(proof.selectiveRestoreAudit.tables>=selected.tables.length+4);
  assert.deepEqual(await f.snapshot(),before,'private recovery may never change the live fixture');
  metadata.tables[0].sha256='0'.repeat(64);queued.snapshotMetadataJson=JSON.stringify(metadata);await writeFile(jobFile,JSON.stringify(queued));
  const invalid=spawnSync('python3',['-c',script,path.resolve('../ops/backup/lifecycle'),archive,jobFile,manifestFile,path.resolve('scripts/store-lifecycle-verify-copy.py')],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Job metadata binding differs/);
  await f.core.abort(f.db,actor,{...scope,...prep});
 }finally{await f.close();await rm(directory,{recursive:true,force:true})}
});
