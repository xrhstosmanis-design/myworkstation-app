import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createLifecycleExecutionCore,lifecycleExecutionSnapshotHash} from '../src/services/store-lifecycle-executor.js';
import {STORE_RECOVERY_FORMAT,persistLifecycleRecovery,openLifecycleRecovery} from '../src/services/store-lifecycle-recovery.js';
import {persistLifecycleRecoveryStream,readLifecycleRecoveryStream,verifyLifecycleRecoveryStream,digestLifecycleRows} from '../src/services/store-lifecycle-recovery-stream.js';
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
 for(const user of [null,{id:'owner',role:'OWNER'},{id:'fake',role:'SUPER_ADMIN'}])for(const method of ['install','prepare','execute','abort'])await assert.rejects(core[method](db,user,scope,'RESET'),e=>e.status===403);
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
