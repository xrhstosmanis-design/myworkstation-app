import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {createMonthlyInventorySnapshotInstallation as createSnapshot,createMonthlyInventoryCaptureInstallation as createCapture} from '../src/services/monthly-inventory-snapshot-installation.js';
import {createLifecycleExecutionCore,createLifecycleInspectionCore} from '../src/services/store-lifecycle-executor.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {monthlyInventoryCaptureLifecycleManifestProposal,validateMonthlyInventoryCaptureSchema,createMonthlyInventoryCaptureSchema} from '../src/services/monthly-inventory-capture-schema.js';
import {createMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {monthlyInventorySnapshotLifecycleManifestProposal,validateMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
const q=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'",revision='a'.repeat(40),actor={id:'synthetic-admin',isSuperAdmin:true},scope={companyId:'fixture-company',storeId:'target'};
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
const noRecovery=async()=>{assert.fail('Installation must never invoke recovery/reset')};
async function fixture(capture=false){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_install_'+randomBytes(10).toString('hex')+'_test';let db,other,created=false;
 try{
  assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory');await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
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
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('fixture-company','SYNTHETIC',NOW()),('foreign-company','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","name","companyId","updatedAt") VALUES ('target','SYNTHETIC','fixture-company',NOW()),('sibling','CONTROL','fixture-company',NOW()),('foreign','CONTROL','foreign-company',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('shared-product','fixture-company','SYNTHETIC SHARED'),('foreign-product','foreign-company','CONTROL')`);
  for(const [store,company,product] of [['target','fixture-company','shared-product'],['sibling','fixture-company','shared-product'],['foreign','foreign-company','foreign-product']]){
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ($1,$2,$3,-12.3456)`,store+'-stock',store,product);
   await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES ($1,$2,$3,'SYNTHETIC',-12.3456)`,store+'-movement',store,product);
   await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","openedBy","status") VALUES ($1,$2,$3,'synthetic-user','CLOSED')`,store+'-shift',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","type","amount","actorId","actorName") VALUES ($1,$2,$3,'SYNTHETIC',12.34,'synthetic-user','SYNTHETIC')`,store+'-payment',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total") VALUES ($1,$2,$3,12.34)`,store+'-sale',company,store);
  }
  await db.$executeRawUnsafe(`INSERT INTO "ProviderOutbox"("id","companyId","aggregateType","aggregateId","action","idempotencyKey","payloadHash") VALUES ('synthetic-outbox','fixture-company','SYNTHETIC','synthetic','NONE','synthetic-idempotency','synthetic-hash')`);
  const rows=async()=>{
   const tables=await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename`);
   return db.$queryRawUnsafe(tables.map(t=>`SELECT ${literal(t.name)} AS table_name,row_to_json(t)::text AS row FROM ${q(t.name)} t`).join(' UNION ALL ')+' ORDER BY table_name,row');
  };
  const catalogue=async()=>{
   const queries=[
    `SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname`,
    `SELECT c.relname AS table_name,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=current_schema() AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    `SELECT c.relname AS table_name,x.conname,x.contype::text,x.convalidated,x.condeferrable,x.condeferred,pg_get_constraintdef(x.oid) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() ORDER BY c.relname,x.conname`,
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() ORDER BY tablename,indexname`,
    `SELECT c.relname AS table_name,t.tgname,t.tgenabled::text,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.prokind IN ('f','p') ORDER BY p.proname,arguments`,
    `SELECT tablename,rulename,definition FROM pg_rules WHERE schemaname=current_schema() ORDER BY tablename,rulename`
   ];return Promise.all(queries.map(sql=>db.$queryRawUnsafe(sql)));
  };
  return {db,other,rows,catalogue,service:(capture?createCapture:createSnapshot)(db,{sourceRevision:revision,enabled:true}),close:async()=>{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();}};
 }catch(error){await db?.$disconnect();await other?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();throw error;}
}
const state=async f=>({rows:await f.rows(),catalogue:await f.catalogue()});
const request=async f=>({...scope,packet:(await f.service.inspect(actor,scope)).packet});
const snapshotMissing=async db=>(await db.$queryRawUnsafe(`SELECT to_regclass('"MonthlyInventorySnapshot"') IS NULL AS missing`))[0].missing;
const hold=e=>e.status===409||e.status===400;

// This guard never turns an absent CI database into a reported native PASS.
for(const capture of [false,true])
test(capture?'native CAPTURE3 installation atomically provisions all three relations and preserves legacy safety boundaries':'native installation composes exact schema and guards atomically, holds old plans and preserves every business/control row',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:300000
},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const create=capture?createCapture:createSnapshot,targetManifest=capture?monthlyInventoryCaptureLifecycleManifestProposal():monthlyInventorySnapshotLifecycleManifestProposal(),f=await fixture(capture);let installed;
 try{
  if(capture)await t.test('partial monthly pairs, snapshot-only intermediate enrollment and complete-but-unguarded target are refused without repair',async()=>{
   for(const variant of ['SNAPSHOT_ONLY','CAPTURE_PAIR','UNGUARDED_THREE','SNAPSHOT_ENROLLED','BASE_WITH_CAPTURE_FENCE']){
    const partial=await fixture(true);try{
     if(variant==='BASE_WITH_CAPTURE_FENCE'){const old=createLifecycleExecutionCore(reviewedFreshStoreManifest(),{sourceRevision:revision,persistAndVerifyRecovery:noRecovery});await old.install(partial.db,actor,scope);await partial.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"='target'`,partial.service.describe().targetPlanHash);}
     else if(variant==='SNAPSHOT_ENROLLED'){const old=createSnapshot(partial.db,{sourceRevision:revision,enabled:true});await old.install(actor,{...scope,packet:(await old.inspect(actor,scope)).packet});}
     else await partial.db.$transaction(async tx=>{if(variant!=='CAPTURE_PAIR')await createMonthlyInventorySnapshotSchema(tx);if(variant!=='SNAPSHOT_ONLY')await createMonthlyInventoryCaptureSchema(tx)});
     const before=await state(partial);await assert.rejects(partial.service.inspect(actor,scope));assert.deepEqual(await state(partial),before,'no partial-profile repair or old enrollment migration');
    }finally{await partial.close();}
   }
  });
  await t.test('BASE inspect is readonly and records genuinely absent enrollment without an inferred epoch',async()=>{
   const before=await state(f),inspection=await f.service.inspect(actor,scope);assert.equal(inspection.eligible,true);assert.equal(inspection.packet.profile,'BASE');assert.deepEqual(inspection.packet.enrollment,{enrolled:false,generation:null,planHash:null,maintenance:null,retired:null,operationId:null});assert.match(inspection.packet.catalogueSignature,/^[a-f0-9]{64}$/);assert.match(inspection.packet.globalStateSignature,/^[a-f0-9]{64}$/);assert.equal(await snapshotMissing(f.db),true);assert.deepEqual(await state(f),before);
  });
  await t.test('foreign selected scope and stale revision/plan/catalogue/global-state packets refuse before DDL',async()=>{
   const before=await state(f);await assert.rejects(f.service.inspect(actor,{...scope,companyId:'foreign-company'}));const input=await request(f);
   for(const key of ['sourceRevision','oldPlanHash','targetPlanHash','catalogueSignature','globalStateSignature']){const packet=structuredClone(input.packet);packet[key]=(key==='sourceRevision'?'b'.repeat(40):'b'.repeat(64));await assert.rejects(f.service.install(actor,{...input,packet}));}
   assert.deepEqual(await state(f),before);
  });
  await t.test('unknown actual catalogue is refused without repair or schema provision',async()=>{
   const input=await request(f);await f.db.$executeRawUnsafe('CREATE TABLE "UnreviewedMonthlyObject"("id" text PRIMARY KEY)');const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,input));assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe('DROP TABLE "UnreviewedMonthlyObject"');
  });
  await t.test('late post-callback exception rolls back table, functions, global guards and selected enrollment together',async()=>{
   const input=await request(f),before=await state(f),late=create({$transaction:(fn,options)=>f.db.$transaction(async tx=>{const value=await fn(tx);assert.equal(value.installed,true);throw new Error('SYNTHETIC_LATE_INSTALL_ROLLBACK')},options)},{sourceRevision:revision,enabled:true});
   await assert.rejects(late.install(actor,input),/SYNTHETIC_LATE_INSTALL_ROLLBACK/);assert.deepEqual(await state(f),before);assert.equal(await snapshotMissing(f.db),true);
  });
  await t.test('two real installers with one BASE packet commit exactly one complete installation',async()=>{
   const input=await request(f),before=await f.rows();let entered,release;const blocked=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
   const first=create({$transaction:(fn,options)=>f.db.$transaction(async tx=>{const result=await fn(tx);entered();await resume;return result},options)},{sourceRevision:revision,enabled:true});
   const a=first.install(actor,input);await Promise.race([blocked,a.then(()=>assert.fail('Installer must reach transaction barrier'))]);
   const second=create(f.other,{sourceRevision:revision,enabled:true});const b=second.install(actor,input);release();const result=await Promise.allSettled([a,b]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);installed=result.find(r=>r.status==='fulfilled').value;assert.equal(installed.installed,true);if(capture){assert.equal(installed.installationProfile,'CAPTURE3');assert.deepEqual(installed.createdTables,['MonthlyInventorySnapshot','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob']);await validateMonthlyInventoryCaptureSchema(f.db)}else assert.equal(installed.createdSnapshotTable,true);assert.equal(installed.createdEnrollment,true);assert.equal(installed.lifecycleGeneration,'0');assert.equal(installed.productionActivated,false);assert.equal(installed.captureEnabled,false);
   await validateMonthlyInventorySnapshotSchema(f.db);const after=await f.rows();assert.deepEqual(after.filter(r=>!r.table_name.startsWith('StoreLifecycle')),before);assert.deepEqual(after.filter(r=>r.table_name==='StoreLifecycleFence').map(r=>JSON.parse(r.row).storeId),['target']);assert.equal(after.filter(r=>r.table_name==='StoreLifecycleExecution'||r.table_name==='StoreLifecycleTombstone').length,0);
   // Full target validation checks every global scoped row/TRUNCATE guard, not only monthly's table.
   const inspection=createLifecycleInspectionCore(targetManifest,{sourceRevision:revision});assert.equal((await inspection.inspect(f.db,actor,scope)).guardsInstalled,true);
  });
  if(capture)await t.test('capture authority relations and every own/global capture guard are strictly validated without repair',async()=>{
   for(const table of ['MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob']){
    const input=await request(f);await f.db.$executeRawUnsafe(`ALTER TABLE ${q(table)} ADD COLUMN "unreviewed" text`);
    try{const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,input));assert.deepEqual(await state(f),before)}finally{await f.db.$executeRawUnsafe(`ALTER TABLE ${q(table)} DROP COLUMN "unreviewed"`)}
    const triggers=await f.db.$queryRawUnsafe(`SELECT tgname AS name FROM pg_trigger WHERE tgrelid=to_regclass($1) AND NOT tgisinternal ORDER BY tgname`,q(table));assert.equal(triggers.length,3);
    for(const trigger of triggers){const reviewed=await request(f);await f.db.$executeRawUnsafe(`ALTER TABLE ${q(table)} DISABLE TRIGGER ${q(trigger.name)}`);
     try{const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,reviewed));assert.deepEqual(await state(f),before,'unreviewed own/lifecycle guards are never overwritten')}finally{await f.db.$executeRawUnsafe(`ALTER TABLE ${q(table)} ENABLE ALWAYS TRIGGER ${q(trigger.name)}`)}
    }
   }
  });
  await t.test('TARGET replay preserves a genuine nonzero generation and exact detached history bytes',async()=>{
   await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=7 WHERE "storeId"='target'`);
   const observed='2026-10-01T04:00:00.123Z',started='2026-10-01T04:00:00.000Z';
   const candidate=buildMonthlyInventorySnapshotCandidate({companyId:scope.companyId,storeId:scope.storeId,lifecycleGeneration:'7',issueMonth:'2026-09',sourceObservedAt:observed,sourceRevision:revision,valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0},products:[],invoices:{period:'2026-09',items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}}),text=serializeMonthlyInventorySnapshotCandidate(candidate),hash=createHash('sha256').update(text).digest('hex');
   await f.db.$transaction(async tx=>{await tx.$queryRawUnsafe("SELECT set_config('mws.lifecycle_generations',$1,true)",JSON.stringify({target:'7'}));await tx.$executeRawUnsafe(`INSERT INTO "MonthlyInventorySnapshot"("id","companyId","storeId","lifecycleGeneration","issueMonth","scheduledFor","transactionStartedAt","sourceReadStartedAt","sourceReadFinishedAt","sourceObservedAt","observationStatus","delayMs","sourceRevision","formatVersion","valuationBasis","sourceHash","payloadHash","candidateJsonText","storedBytesSha256","sourceCoverage","capturePrincipal") VALUES ('synthetic-history',$1,$2,7,'2026-09',$3::timestamptz,$4::timestamptz,$4::timestamptz,$5::timestamptz,$5::timestamptz,'LATE',123,$6,1,'CURRENT_OPERATIONAL_V1',$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,scope.companyId,scope.storeId,candidate.period.scheduledFor,started,observed,revision,candidate.sourceHash,candidate.payloadHash,text,hash,JSON.stringify(candidate.coverage),JSON.stringify({type:'BACKOFFICE_USER',userId:'synthetic-user',authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'}));});
   const before=await state(f),input=await request(f);assert.equal(input.packet.profile,'TARGET');assert.equal(input.packet.enrollment.generation,'7');const receipt=await f.service.install(actor,input);assert.equal(receipt.createdEnrollment,false);if(capture)assert.deepEqual(receipt.createdTables,[]);else assert.equal(receipt.createdSnapshotTable,false);assert.equal(receipt.lifecycleGeneration,'7');assert.deepEqual(await state(f),before);
   for(const sql of ['UPDATE "MonthlyInventorySnapshot" SET "issueMonth"=\'2026-08\'','DELETE FROM "MonthlyInventorySnapshot"','TRUNCATE "MonthlyInventorySnapshot"'])await assert.rejects(f.db.$executeRawUnsafe(sql),/MONTHLY_SNAPSHOT_IMMUTABLE/);
   assert.deepEqual(await state(f),before);
  });
  await t.test('packet is bound to selected company/store and an unenrolled sibling cannot borrow it',async()=>{
   const input=await request(f),before=await state(f);await assert.rejects(f.service.install(actor,{...input,storeId:'sibling'}));await assert.rejects(f.service.install(actor,{...input,companyId:'foreign-company',storeId:'foreign'}));assert.deepEqual(await state(f),before);
  });
  await t.test('any OLD or unknown plan enrollment is HOLD without automatic transition or global fence relabel',async()=>{
   for(const plan of [installed.oldPlanHash,'f'.repeat(64)]){
    await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId","generation","planHash") VALUES ('sibling','fixture-company',19,$1)`,plan);
    const before=await state(f),inspection=await f.service.inspect(actor,scope);assert.equal(inspection.eligible,false);assert.ok(inspection.reasons.includes('MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'));await assert.rejects(f.service.install(actor,{...scope,packet:inspection.packet}),{code:'MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'});assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(`DELETE FROM "StoreLifecycleFence" WHERE "storeId"='sibling'`);
   }
  });
  await t.test('changed generation or actual global fence state invalidates an otherwise valid packet',async()=>{
   const input=await request(f);await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=8 WHERE "storeId"='target'`);const before=await state(f);await assert.rejects(f.service.install(actor,input),{code:'MONTHLY_INSTALL_STATE_CHANGED'});assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=7 WHERE "storeId"='target'`);
   const absent={...await request(f)};absent.packet=structuredClone(absent.packet);absent.packet.enrollment={enrolled:false,generation:null,planHash:null,maintenance:null,retired:null,operationId:null};await assert.rejects(f.service.install(actor,absent),{code:'MONTHLY_INSTALL_STATE_CHANGED'});
  });
  await t.test('maintenance retirement operation state and in-flight execution all refuse without clearing controls',async()=>{
   for(const [column,value] of [['maintenance',true],['retired',true],['operationId','synthetic-operation']]){
    await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET ${q(column)}=$1 WHERE "storeId"='target'`,value);const before=await state(f),inspection=await f.service.inspect(actor,scope);assert.equal(inspection.eligible,false);await assert.rejects(f.service.install(actor,{...scope,packet:inspection.packet}),hold);assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET ${q(column)}=$1 WHERE "storeId"='target'`,column==='operationId'?null:false);
   }
   await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleExecution"("id","companyId","storeId","mode","planHash","snapshotHash","state","expiresAt") VALUES ('synthetic-running','fixture-company','sibling','RESET',$1,$2,'DRAINING',NOW()+INTERVAL '1 hour')`,installed.targetPlanHash,'0'.repeat(64));const before=await state(f),inspection=await f.service.inspect(actor,scope);assert.equal(inspection.eligible,false);await assert.rejects(f.service.install(actor,{...scope,packet:inspection.packet}));assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(`DELETE FROM "StoreLifecycleExecution" WHERE "id"='synthetic-running'`);
  });
  await t.test('malformed actual internal control columns constraints indexes RLS and triggers cannot be masked by IF NOT EXISTS',async()=>{
   const alterations=[
    ['ALTER TABLE "StoreLifecycleFence" ADD COLUMN "unreviewed" text','ALTER TABLE "StoreLifecycleFence" DROP COLUMN "unreviewed"'],
    ['ALTER TABLE "StoreLifecycleFence" ALTER COLUMN "generation" SET DEFAULT 1','ALTER TABLE "StoreLifecycleFence" ALTER COLUMN "generation" SET DEFAULT 0'],
    ['ALTER TABLE "StoreLifecycleFence" ADD CONSTRAINT "unreviewed_check" CHECK("generation">=0)','ALTER TABLE "StoreLifecycleFence" DROP CONSTRAINT "unreviewed_check"'],
    ['CREATE INDEX "unreviewed_fence_index" ON "StoreLifecycleFence"("companyId")','DROP INDEX "unreviewed_fence_index"'],
    ['ALTER TABLE "StoreLifecycleFence" ENABLE ROW LEVEL SECURITY','ALTER TABLE "StoreLifecycleFence" DISABLE ROW LEVEL SECURITY'],
    ['CREATE TRIGGER "unreviewed_control_guard" BEFORE UPDATE ON "StoreLifecycleFence" FOR EACH ROW EXECUTE FUNCTION monthly_inventory_snapshot_immutable_guard()','DROP TRIGGER "unreviewed_control_guard" ON "StoreLifecycleFence"']
   ];
   for(const [alter,restore] of alterations){const input=await request(f);await f.db.$executeRawUnsafe(alter);const before=await state(f);await assert.rejects(f.service.inspect(actor,scope),{code:'MONTHLY_INSTALL_CONTROL_SCHEMA_CHANGED'});await assert.rejects(f.service.install(actor,input),{code:'MONTHLY_INSTALL_CONTROL_SCHEMA_CHANGED'});assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(restore);}
  });
  await t.test('altered immutable or global row/TRUNCATE guards refuse without repair-by-overwrite',async()=>{
   for(const trigger of ['monthly_inventory_snapshot_immutable','mws_lifecycle_MonthlyInventorySnapshot','mws_lifecycle_MonthlyInventorySnapshot_truncate']){
    // Discover the hashed lifecycle names rather than assuming an identifier format.
    const actual=trigger.startsWith('mws_')?(await f.db.$queryRawUnsafe(`SELECT tgname AS name FROM pg_trigger WHERE tgrelid='"MonthlyInventorySnapshot"'::regclass AND tgname LIKE 'mws_lifecycle_%' AND tgtype=$1::smallint`,trigger.endsWith('_truncate')?34:31))[0]?.name:trigger;
    assert.ok(actual);const input=await request(f);await f.db.$executeRawUnsafe(`ALTER TABLE "MonthlyInventorySnapshot" DISABLE TRIGGER ${q(actual)}`);const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,input));assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe(`ALTER TABLE "MonthlyInventorySnapshot" ENABLE ALWAYS TRIGGER ${q(actual)}`);
   }
   const fn=(await f.db.$queryRawUnsafe(`SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='"MonthlyInventorySnapshot"'::regclass AND t.tgname LIKE 'mws_lifecycle_%' AND t.tgtype=31`))[0];assert.ok(fn);
   const reviewed=await request(f);
   await f.db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.${q(fn.name)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
   try{const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,reviewed));assert.deepEqual(await state(f),before,'altered body must not be overwritten by installation');}finally{await f.db.$executeRawUnsafe(fn.definition);}
   for(const [createSql,dropSql] of [
    [`CREATE FUNCTION public.mws_lifecycle_detached_unreviewed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`,'DROP FUNCTION public.mws_lifecycle_detached_unreviewed()'],
    [`CREATE FUNCTION public.${q(fn.name)}(integer) RETURNS integer LANGUAGE sql AS $$ SELECT $1 $$`,`DROP FUNCTION public.${q(fn.name)}(integer)`]
   ]){
    const input=await request(f);await f.db.$executeRawUnsafe(createSql);
    try{const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,input));assert.deepEqual(await state(f),before,'reserved detached/overloaded guard function must remain refused without repair');}finally{await f.db.$executeRawUnsafe(dropSql);}
   }
  });
  await t.test('partial target table shape refuses without adding missing columns or weakening validators',async()=>{
   const input=await request(f);await f.db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" ADD COLUMN "unreviewed" text');const before=await state(f);await assert.rejects(f.service.inspect(actor,scope));await assert.rejects(f.service.install(actor,input));assert.deepEqual(await state(f),before);await f.db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" DROP COLUMN "unreviewed"');
  });
  await t.test('real existing writer FOR SHARE fence and transaction relation locks fail promptly with no partial DDL',async()=>{
   const input=await request(f),before=await state(f);await f.other.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT 1 FROM "StoreLifecycleFence" WHERE "storeId"='target' FOR SHARE`);const started=Date.now();await assert.rejects(f.service.install(actor,input));assert.ok(Date.now()-started<10000,'actual lock contention must be bounded')},{timeout:30000});assert.deepEqual(await state(f),before);
  });
  await t.test('genuine legacy beginDrain excludes installer and its operation state is never reset or overwritten',async()=>{
   const input=await request(f),core=createLifecycleExecutionCore(targetManifest,{sourceRevision:revision,persistAndVerifyRecovery:noRecovery});
   let entered,release;const blocked=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
   const draining=core.beginDrain({$transaction:(fn,options)=>f.other.$transaction(async tx=>{const result=await fn(tx);entered(result);await resume;throw new Error('SYNTHETIC_ROLLBACK_DRAIN')},options)},actor,scope,'RESET');const drain=await Promise.race([blocked,draining.then(()=>assert.fail('Drain must reach transaction barrier'))]);assert.equal(drain.state,'DRAINING');const started=Date.now();await assert.rejects(f.service.install(actor,input));assert.ok(Date.now()-started<10000);release();await assert.rejects(draining,/SYNTHETIC_ROLLBACK_DRAIN/);assert.equal((await f.db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "StoreLifecycleExecution"`))[0].count,0);assert.equal((await f.db.$queryRawUnsafe(`SELECT "maintenance" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].maintenance,false);
  });
  await t.test('actor and nested request mutations after asynchronous entry cannot change admitted identity or scope',async()=>{
   const input=await request(f),mutable=structuredClone(input),mutableActor={...actor},before=await state(f);let entered,release;const blocked=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
   const delayed=create({$transaction:async(fn,options)=>{entered();await resume;return f.db.$transaction(fn,options)}},{sourceRevision:revision,enabled:true});const promise=delayed.install(mutableActor,mutable);await blocked;mutableActor.isSuperAdmin=false;mutableActor.id='changed';mutable.storeId='foreign';mutable.companyId='foreign-company';mutable.packet.enrollment.generation='999';mutable.packet.catalogueSignature='0'.repeat(64);release();const receipt=await promise;assert.equal(receipt.storeId,'target');assert.equal(receipt.companyId,'fixture-company');assert.equal(receipt.lifecycleGeneration,'7');assert.deepEqual(await state(f),before);
  });
  await t.test('genuine canonical legacy enrollment is HOLD before monthly DDL and preserves the complete OLD catalogue',async()=>{
   const old=await fixture(capture);try{
    const core=createLifecycleExecutionCore(reviewedFreshStoreManifest(),{sourceRevision:revision,persistAndVerifyRecovery:noRecovery});await core.install(old.db,actor,scope);await old.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=23 WHERE "storeId"='target'`);const before=await state(old),inspection=await old.service.inspect(actor,scope);assert.equal(inspection.eligible,false);assert.equal(inspection.packet.profile,'BASE');assert.equal(inspection.packet.enrollment.generation,'23');assert.ok(inspection.reasons.includes('MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'));await assert.rejects(old.service.install(actor,{...scope,packet:inspection.packet}),{code:'MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED'});assert.equal(await snapshotMissing(old.db),true);assert.deepEqual(await state(old),before);
   }finally{await old.close();}
  });
 }finally{await f.close();}
});
