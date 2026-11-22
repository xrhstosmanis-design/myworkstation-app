import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {createMonthlyInventoryCaptureInstallation as createCapture} from '../src/services/monthly-inventory-snapshot-installation.js';
import {createAutomaticReportEventInstallation as createEvents} from '../src/services/automatic-report-event-installation.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {operationalReportCompatibilityDDL} from '../src/services/automatic-report-source-compatibility.js';
import {reportColumnCompatibilityDDL} from '../src/services/automatic-report-column-compatibility.js';
import {reportChatCompatibilityDDL} from '../src/services/automatic-report-chat-compatibility.js';

const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
const q=value=>'"'+value.replaceAll('"','""')+'"';
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const revision='a'.repeat(40);
const actor={id:'synthetic-admin',isSuperAdmin:true};
const scope={companyId:'fixture-company',storeId:'target'};
const connectionString=process.env.REPORT_SECURITY_TEST_DATABASE_URL||process.env.DATABASE_URL;
const transitionProfile='REPORTS_ONLY_V3_TO_V4';
const sourceProfile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3';
const targetProfile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4';
const securityTable='StoreChatAccessRevocation';
const securityDDL='CREATE TABLE \"StoreChatAccessRevocation\" (\"companyId\" TEXT NOT NULL,\"storeId\" TEXT NOT NULL,\"userId\" TEXT NOT NULL,PRIMARY KEY(\"companyId\",\"storeId\",\"userId\"))';
const chatTables=['StoreChatGroup','StoreChatGroupMember','StoreChatGroupMessage','StoreChatMutedTopic'];
const isolated=()=>{
 try{
  const url=new URL(connectionString);
  return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(url.protocol)
   &&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.search&&!url.hash
   &&/^\/[^/]+_test$/i.test(decodeURIComponent(url.pathname));
 }catch{return false;}
};

// Local runs may use an explicitly supplied pg client; CI retains actual Prisma.
// Both adapters share the same URL guard before loading a client or connecting.
async function connect(url){
 assert.ok(isolated(),'Only explicit local test database URLs without overrides are permitted');
 if(!process.env.REPORT_SECURITY_PG_CLIENT){
  const {PrismaClient}=await import('@prisma/client');
  return new PrismaClient({datasourceUrl:url});
 }
 const require=createRequire(import.meta.url),{Client,types:pgTypes}=require(process.env.REPORT_SECURITY_PG_CLIENT);
 const client=new Client({connectionString:url});await client.connect();
 // Prisma binds strings as PostgreSQL text. Match that parameter contract so
 // polymorphic format()/to_regclass() calls do not receive untyped unknowns.
 const query=(sql,values=[])=>{const types=values.map(value=>typeof value==='string'?25:0);types.getTypeParser=pgTypes.getTypeParser.bind(pgTypes);return client.query({text:sql,values,types});};
 const tagged=(strings,values)=>strings.reduce((sql,part,i)=>sql+(i?'$'+i:'')+part,'');
 const db={
  $queryRawUnsafe:async(sql,...values)=>(await query(sql,values)).rows,
  $executeRawUnsafe:async(sql,...values)=>(await query(sql,values)).rowCount,
  $queryRaw:async(strings,...values)=>(await query(tagged(strings,values),values)).rows,
  $executeRaw:async(strings,...values)=>(await query(tagged(strings,values),values)).rowCount,
  $disconnect:()=>client.end(),
  $transaction:async(fn,options={})=>{
   await client.query('BEGIN ISOLATION LEVEL '+(options.isolationLevel==='RepeatableRead'?'REPEATABLE READ':'READ COMMITTED'));
   try{const result=await fn(db);await client.query('COMMIT');return result;}
   catch(error){await client.query('ROLLBACK');throw error;}
  }
 };return db;
}

async function fixture(){
 const admin=await connect(connectionString),name='report_security_transition_'+randomBytes(10).toString('hex')+'_test';let db,other,created=false;
 try{
  assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory');await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;
  const url=new URL(connectionString);url.pathname='/'+name;db=await connect(url.href);other=await connect(url.href);
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
  return {db,other,rows,catalogue,service:createCapture(db,{sourceRevision:revision,enabled:true}),close:async()=>{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();}};
 }catch(error){await db?.$disconnect();await other?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();throw error;}
}

const snapshot=async f=>({rows:await f.rows(),catalogue:await f.catalogue()});
const request=async service=>({...scope,packet:(await service.inspect(actor,scope)).packet,explicitAuthorization:true});

async function addCurrentReportSources(db){
 for(const sql of [...operationalReportCompatibilityDDL(),...reportColumnCompatibilityDDL()])await db.$executeRawUnsafe(sql);
 const supplier=readFileSync(new URL('../scripts/sql/automatic-report-supplier-comparison.sql',import.meta.url),'utf8');
 for(const sql of supplier.split(';').map(value=>value.trim()).filter(value=>value&&value!=='BEGIN'&&value!=='COMMIT'))await db.$executeRawUnsafe(sql);
  const seed=[
   `INSERT INTO "InventoryWarehouseEditAudit" VALUES ('audit','target','shared-product','historical-stocktake','historical-grant','{}','{}',NOW())`,
   `INSERT INTO "InvoiceQrSupplierLearning"("companyId","supplierVat","providerFormat","supplierName") VALUES ('fixture-company','123456789','epsilon','SYNTHETIC')`,
   `INSERT INTO "InvoiceStockExclusionEmail"("companyId","storeId","orderId","reopenVersion","payload") VALUES ('fixture-company','target','historical-order',0,'{}')`,
   `INSERT INTO "PosInternalTransfer"("id","companyId","sourceStoreId","destinationStoreId","createdByUserId","idempotencyKey") VALUES ('transfer','fixture-company','target','sibling','synthetic-admin','transfer-key')`,
   `INSERT INTO "PosInternalTransferLine" VALUES ('transfer','shared-product',1,1,24)`,
   `INSERT INTO "PosInternalTransferSettlement"("transferId","method","amount","bankReference","recordedByUserId") VALUES ('transfer','BANK_TRANSFER',1,'SYNTHETIC','synthetic-admin')`,
   `INSERT INTO "PosPackageStockPosting"("id","companyId","storeId","saleId","lineId","productId","baseProductId","unitsPerPackage","quantity") VALUES ('package-post','fixture-company','target','historical-sale','historical-line','package-product','shared-product',2,-1)`,
   `INSERT INTO "PosScannedCashReturn"("id","companyId","storeId","terminalPos","actorId","requestHash","resultJson") VALUES ('return','fixture-company','target','MAIN','synthetic-admin','synthetic-hash','{}')`,
   `INSERT INTO "StoreStockPackage"("companyId","storeId","productId","baseProductId","unitsPerPackage","updatedBy") VALUES ('fixture-company','target','package-product','shared-product',2,'synthetic-admin')`
  ];
  for(const sql of seed)await db.$executeRawUnsafe(sql);

}

async function seedChat(db){
 for(const [store,company] of [['target','fixture-company'],['sibling','fixture-company'],['foreign','foreign-company']]){
  const group=store+'-group',user=store+'-user';
  await db.$executeRawUnsafe('INSERT INTO "StoreChatGroup"("id","companyId","storeId","name","createdBy") VALUES ($1,$2,$3,$4,$5)',group,company,store,'SYNTHETIC '+store,user);
  await db.$executeRawUnsafe('INSERT INTO "StoreChatGroupMember"("groupId","userId") VALUES ($1,$2)',group,user);
  await db.$executeRawUnsafe('INSERT INTO "StoreChatGroupMessage"("id","groupId","senderId","senderName","body") VALUES ($1,$2,$3,$4,$5)',store+'-message',group,user,'SYNTHETIC','Preserve original '+store+' message');
  await db.$executeRawUnsafe('INSERT INTO "StoreChatMutedTopic"("companyId","storeId","userId","topic") VALUES ($1,$2,$3,$4)',company,store,user,'GENERAL');
 }
}

const expectedSourceHash='54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828';
const expectedTargetHash='e349bf37597939d918b098aaa434ce4dfd686b653b0fe013d8c4df83420ec68f';
const protectedProfiles=['MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2',sourceProfile,'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1'];
const manifests=()=>protectedProfiles.map(name=>({name,manifest:JSON.stringify(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:name})),planHash:createLifecycleInstallationCore(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:name}),{sourceRevision:revision}).describe().planHash}));

const seedSecurity=db=>db.$executeRawUnsafe(`INSERT INTO "StoreChatAccessRevocation" VALUES ('fixture-company','target','target-denied'),('fixture-company','sibling','sibling-denied'),('foreign-company','foreign','foreign-denied'),('unrelated-company','unregistered-store','global-denied')`);
async function restoreSecurityFixture(db){await db.$executeRawUnsafe('DROP TABLE "StoreChatAccessRevocation"');await db.$executeRawUnsafe(securityDDL);await seedSecurity(db);}
function barrier(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}

async function refuseUnchanged(f,service,input,{inspect=true}={}){
 const before=await snapshot(f);
 if(inspect)await assert.rejects(async()=>service.inspect(actor,scope));
 await assert.rejects(async()=>service.install(actor,input));
 assert.deepEqual(await snapshot(f),before);
}

// One new transition scenario reuses the canonical V3 source layout rather
// than repeating the old V1/V2/V3 compatibility test matrix.
test('native V3 to V4 security transition preserves global deny rows and all source state atomically',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,
 timeout:300000
},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');
 const historical=manifests(),f=await fixture();
 try{
  await f.service.install(actor,{...scope,packet:(await f.service.inspect(actor,scope)).packet});
  await f.db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","companyId","role","updatedAt") VALUES ('synthetic-admin','synthetic@example.invalid','SYNTHETIC','SYNTHETIC','fixture-company','SUPER_ADMIN',NOW())`);
  await addCurrentReportSources(f.db);
  for(const sql of reportChatCompatibilityDDL())await f.db.$executeRawUnsafe(sql);
  await seedChat(f.db);
  const v3=createEvents(f.db,{sourceRevision:revision,enabled:true,profile:'CAPTURE_REPORTS_ONLY_V3'});
  await v3.install(actor,await request(v3));
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=7 WHERE "storeId"='target'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId","generation","planHash") VALUES ('sibling','fixture-company',11,$1),('foreign','foreign-company',19,$1)`,expectedSourceHash);
  const service=createEvents(f.db,{sourceRevision:revision,enabled:true,profile:transitionProfile});
  assert.equal(service.describe().oldPlanHash,expectedSourceHash);
  assert.equal(service.describe().targetPlanHash,expectedTargetHash);
  assert.equal(service.describe().targetProfile,targetProfile);
  await t.test('missing security catalogue is refused, never automatically created',async()=>{
   const before=await snapshot(f);await assert.rejects(async()=>service.inspect(actor,scope));assert.deepEqual(await snapshot(f),before);
  });
  await f.db.$executeRawUnsafe(securityDDL);
  await seedSecurity(f.db);
  const requestV4=await request(service);
  await t.test('source metadata proof does not weaken historical V3 and all old profiles stay immutable',async()=>{
   const before=await snapshot(f);await assert.rejects(v3.inspect(actor,scope));assert.deepEqual(await snapshot(f),before);
   assert.deepEqual(manifests(),historical);
  });
  await t.test('drifted source metadata is refused without altering deny rows or fences',async()=>{
   const variants=[
    ['ALTER TABLE "StoreChatAccessRevocation" ADD COLUMN unreviewed text',()=>restoreSecurityFixture(f.db)],
    ['ALTER TABLE "StoreChatAccessRevocation" ALTER COLUMN "userId" SET DEFAULT \'x\'','ALTER TABLE "StoreChatAccessRevocation" ALTER COLUMN "userId" DROP DEFAULT'],
    ['CREATE INDEX unreviewed_security ON "StoreChatAccessRevocation"("userId")','DROP INDEX unreviewed_security'],
    ['ALTER TABLE "StoreChatAccessRevocation" ENABLE ROW LEVEL SECURITY','ALTER TABLE "StoreChatAccessRevocation" DISABLE ROW LEVEL SECURITY'],
    ['CREATE TABLE "UnreviewedSecuritySource"(id text)','DROP TABLE "UnreviewedSecuritySource"'],
    ['ALTER TABLE "StoreChatGroup" ALTER COLUMN "name" SET DEFAULT \'drift\'','ALTER TABLE "StoreChatGroup" ALTER COLUMN "name" DROP DEFAULT']
   ];
   for(const [change,restore] of variants){
    const pristine=await snapshot(f);await f.db.$executeRawUnsafe(change);
    try{await refuseUnchanged(f,service,requestV4);}finally{if(typeof restore==='function')await restore();else await f.db.$executeRawUnsafe(restore);}
    assert.deepEqual(await snapshot(f),pristine);
   }
  });
  await t.test('stale revision, changed generation and actor authority reject before transition',async()=>{
   const wrongRevision=createEvents(f.db,{sourceRevision:'b'.repeat(40),enabled:true,profile:transitionProfile});
   await refuseUnchanged(f,wrongRevision,requestV4,{inspect:false});
   await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=8 WHERE "storeId"='target'`);
   try{await refuseUnchanged(f,service,requestV4,{inspect:false});}finally{await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=7 WHERE "storeId"='target'`);}
   const before=await snapshot(f);
   await assert.rejects(async()=>service.install({...actor,isSuperAdmin:false},requestV4));
   await assert.rejects(async()=>service.install(actor,{...requestV4,explicitAuthorization:false}));
   await assert.rejects(async()=>service.install({...actor,id:'missing-admin'},requestV4));
   assert.deepEqual(await snapshot(f),before);
  });
  await t.test('wrong or mixed plans, unregistered target and maintenance flags reject atomically',async()=>{
   for(const mutation of [`"planHash"='${'0'.repeat(64)}'`,`"maintenance"=true`,`"retired"=true`,`"operationId"='synthetic-active-operation'`]){
    await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET ${mutation} WHERE "storeId"='sibling'`);
    try{await refuseUnchanged(f,service,requestV4);}finally{await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1,"maintenance"=false,"retired"=false,"operationId"=NULL WHERE "storeId"='sibling'`,expectedSourceHash);}
   }
   await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"='sibling'`,expectedTargetHash);
   try{await refuseUnchanged(f,service,requestV4);}finally{await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"='sibling'`,expectedSourceHash);}
   await f.db.$executeRawUnsafe(`DELETE FROM "StoreLifecycleFence" WHERE "storeId"='target'`);
   try{await refuseUnchanged(f,service,requestV4);}finally{await f.db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId","generation","planHash") VALUES ('target','fixture-company',7,$1)`,expectedSourceHash);}
  });
  await t.test('second-client security lock refuses EXCLUSIVE NOWAIT without partial fence changes',async()=>{
   const input=await request(service),before=await snapshot(f),entered=barrier(),release=barrier();
   const held=f.other.$transaction(async tx=>{
    try{await tx.$executeRawUnsafe('LOCK TABLE "StoreChatAccessRevocation" IN SHARE MODE');entered.resolve();await release.promise;}
    catch(error){entered.reject(error);throw error;}
   });
   try{
    await entered.promise;
    await assert.rejects(async()=>service.install(actor,input),error=>error.code==='55P03'||error.meta?.code==='55P03');
    assert.deepEqual(await snapshot(f),before);
   }finally{release.resolve();await held;}
  });
  await t.test('failure after the first real fence update rolls back partial global transition',async()=>{
   const before=await snapshot(f);let updates=0;
   const broken={$transaction:(fn,options)=>f.db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
    const original=Reflect.get(target,key);
    if(key!=='$executeRawUnsafe')return typeof original==='function'?original.bind(target):original;
    return async(sql,...args)=>{const result=await original.call(target,sql,...args);if(/^UPDATE .*"StoreLifecycleFence" SET "planHash"/.test(sql)&&++updates===1)throw Error('V4_PARTIAL_FENCE_ROLLBACK');return result;};
   }})),options)};
   const failing=createEvents(broken,{sourceRevision:revision,enabled:true,profile:transitionProfile});
   await assert.rejects(failing.install(actor,await request(service)),/V4_PARTIAL_FENCE_ROLLBACK/);assert.equal(updates,1);
   assert.deepEqual(await snapshot(f),before);
  });
  await t.test('late target metadata drift rolls back fence updates and its own DDL',async()=>{
   const before=await snapshot(f);let updates=0,injected=false;
   const broken={$transaction:(fn,options)=>f.db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
    const original=Reflect.get(target,key);
    if(key!=='$executeRawUnsafe')return typeof original==='function'?original.bind(target):original;
    return async(sql,...args)=>{const result=await original.call(target,sql,...args);
     if(/^UPDATE .*"StoreLifecycleFence" SET "planHash"/.test(sql)&&++updates===3){await original.call(target,'ALTER TABLE "StoreChatAccessRevocation" ADD COLUMN late_drift text');injected=true;}
     return result;
    };
   }})),options)};
   const failing=createEvents(broken,{sourceRevision:revision,enabled:true,profile:transitionProfile});
   await assert.rejects(failing.install(actor,await request(service)));assert.equal(updates,3);assert.equal(injected,true);
   assert.deepEqual(await snapshot(f),before);
  });
  await t.test('failure after successful target validation rolls back the complete transaction',async()=>{
   const before=await snapshot(f);let inspectedTarget=false;
   const rollback={$transaction:(fn,options)=>f.db.$transaction(async tx=>{const result=await fn(tx);assert.equal(result.installed,true);inspectedTarget=true;throw Error('V4_FINAL_TRANSACTION_ROLLBACK');},options)};
   const failing=createEvents(rollback,{sourceRevision:revision,enabled:true,profile:transitionProfile});
   await assert.rejects(failing.install(actor,await request(service)),/V4_FINAL_TRANSACTION_ROLLBACK/);
   assert.equal(inspectedTarget,true);assert.deepEqual(await snapshot(f),before);
  });
  await t.test('successful metadata-only transition preserves all rows, security, guards and generation; repeat is a no-op',async()=>{
   const input=await request(service);
   // Legitimate denial changes after inspection are not catalogue drift. The
   // installer must not read/hash/rewrite global security rows or reject this.
   await f.db.$executeRawUnsafe(`INSERT INTO "StoreChatAccessRevocation" VALUES ('late-company','unregistered-store','new-denied-after-inspect')`);
   const before=await snapshot(f),fencesBefore=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
   const receipt=await service.install(actor,input);assert.equal(receipt.installed,true);assert.equal(receipt.transitionedEnrollments,3);
   const after=await snapshot(f);assert.deepEqual(after.catalogue,before.catalogue);
   assert.deepEqual(after.rows.filter(r=>r.table_name!=='StoreLifecycleFence'),before.rows.filter(r=>r.table_name!=='StoreLifecycleFence'));
   const fences=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
   assert.deepEqual(fences.map(({planHash,...rest})=>rest),fencesBefore.map(({planHash,...rest})=>rest));assert.ok(fences.every(row=>row.planHash===expectedTargetHash));
   assert.equal((await service.inspect(actor,scope)).packet.installed,true);
   const repeat=await service.install(actor,await request(service));assert.equal(repeat.transitionedEnrollments,0);assert.deepEqual(await snapshot(f),after);
   assert.deepEqual(await f.db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "StoreChatAccessRevocation"'),[{n:5}]);
   assert.deepEqual(manifests(),historical);
  });
  await t.test('target metadata drift and stale V3 packet remain refused after success',async()=>{
   await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatAccessRevocation" ALTER COLUMN "userId" SET DEFAULT \'drift\'');
   try{await refuseUnchanged(f,service,requestV4);}finally{await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatAccessRevocation" ALTER COLUMN "userId" DROP DEFAULT');}
   await refuseUnchanged(f,service,requestV4,{inspect:false});
   assert.equal((await service.inspect(actor,scope)).packet.installed,true);
  });
 }finally{await f.close();}
});
