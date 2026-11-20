import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
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
const chatTables=['StoreChatGroup','StoreChatGroupMember','StoreChatGroupMessage','StoreChatMutedTopic'];
const isolated=()=>{
 try{
  const url=new URL(process.env.DATABASE_URL);
  return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(url.protocol)
   &&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&!url.search&&!url.hash
   &&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(url.pathname));
 }catch{return false;}
};

async function fixture(){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='report_chat_install_'+randomBytes(10).toString('hex')+'_test';let db,other,created=false;
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

async function assertRefusalPreserves(service,f,packet){
 const before=await snapshot(f);
 await assert.rejects(service.inspect(actor,scope));
 await assert.rejects(service.install(actor,packet));
 assert.deepEqual(await snapshot(f),before);
}

test('native V3 installation preserves all four Chat tables and rejects catalogue drift atomically',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,
 timeout:300000
},async t=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');
 const f=await fixture();
 try{
  await f.service.install(actor,{...scope,packet:(await f.service.inspect(actor,scope)).packet});
  await f.db.$executeRawUnsafe(`INSERT INTO "User"("id","email","passwordHash","fullName","companyId","role","updatedAt") VALUES ('synthetic-admin','synthetic@example.invalid','SYNTHETIC','SYNTHETIC','fixture-company','SUPER_ADMIN',NOW())`);
  await addCurrentReportSources(f.db);
  const service=createEvents(f.db,{sourceRevision:revision,enabled:true,profile:'CAPTURE_REPORTS_ONLY_V3'});
  await t.test('missing or partially provisioned Chat tables are refused without repair',async()=>{
   const absent=await snapshot(f);
   await assert.rejects(service.inspect(actor,scope));
   assert.deepEqual(await snapshot(f),absent);
   for(const sql of reportChatCompatibilityDDL())await f.db.$executeRawUnsafe(sql);
   // Remove each relation in a fresh empty layout. No extra relation can
   // mask failure to enforce the exact four-table requirement.
   for(const table of chatTables){
    await f.db.$executeRawUnsafe(`DROP TABLE ${q(table)} CASCADE`);
    const partial=await snapshot(f);
    await assert.rejects(service.inspect(actor,scope));
    assert.deepEqual(await snapshot(f),partial);
    for(const name of [...chatTables].reverse())await f.db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${q(name)} CASCADE`);
    for(const sql of reportChatCompatibilityDDL())await f.db.$executeRawUnsafe(sql);
   }
  });
  await seedChat(f.db);
  const v2=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2'});
  const v2Before=JSON.stringify(v2);
  const v2Hash=createLifecycleInstallationCore(v2,{sourceRevision:revision}).describe().planHash;
  assert.equal(v2Hash,'5289a68fb0c18be65ff51a970f395029853afab7ea43bf068039ed300fb6b84e');
  const packet=await request(service);
  await t.test('all four Chat column layouts and unknown objects reject before mutation',async()=>{
   const variants=chatTables.map(table=>[
    `ALTER TABLE ${q(table)} ADD COLUMN "unreviewed" text`,
    `ALTER TABLE ${q(table)} DROP COLUMN "unreviewed"`
   ]);
   variants.push(['CREATE TABLE "UnreviewedChatObject"("id" text)','DROP TABLE "UnreviewedChatObject"']);
   variants.push([`ALTER TABLE "StoreChatGroup" ALTER COLUMN "name" SET DEFAULT 'unreviewed'`,'ALTER TABLE "StoreChatGroup" ALTER COLUMN "name" DROP DEFAULT']);
   variants.push(['CREATE INDEX "UnreviewedChatIndex" ON "StoreChatGroupMessage"("senderId")','DROP INDEX "UnreviewedChatIndex"']);
   variants.push(['ALTER TABLE "StoreChatGroupMember" ADD CONSTRAINT "UnreviewedChatCheck" CHECK(length("userId")>0)','ALTER TABLE "StoreChatGroupMember" DROP CONSTRAINT "UnreviewedChatCheck"']);
   for(const [change,restore] of variants){
    await f.db.$executeRawUnsafe(change);
    await assertRefusalPreserves(service,f,packet);
    await f.db.$executeRawUnsafe(restore);
   }
  });
  await t.test('unexpected inbound and altered reviewed foreign keys reject before mutation',async()=>{
   await f.db.$executeRawUnsafe('CREATE TABLE "UnreviewedChatChild"("id" text PRIMARY KEY,"groupId" text REFERENCES "StoreChatGroup"("id"))');
   await assertRefusalPreserves(service,f,packet);
   await f.db.$executeRawUnsafe('DROP TABLE "UnreviewedChatChild"');
   await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatGroupMember" DROP CONSTRAINT "StoreChatGroupMember_groupId_fkey"');
   await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatGroupMember" ADD CONSTRAINT "StoreChatGroupMember_groupId_fkey" FOREIGN KEY("groupId") REFERENCES "StoreChatGroup"("id") ON DELETE RESTRICT');
   await assertRefusalPreserves(service,f,packet);
   await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatGroupMember" DROP CONSTRAINT "StoreChatGroupMember_groupId_fkey"');
   await f.db.$executeRawUnsafe('ALTER TABLE "StoreChatGroupMember" ADD CONSTRAINT "StoreChatGroupMember_groupId_fkey" FOREIGN KEY("groupId") REFERENCES "StoreChatGroup"("id") ON DELETE CASCADE');
  });
  await t.test('additional Chat trigger rejects without executing or replacing it',async()=>{
   await f.db.$executeRawUnsafe('CREATE FUNCTION "UnreviewedChatTrigger"() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$');
   await f.db.$executeRawUnsafe('CREATE TRIGGER "UnreviewedChatTrigger" BEFORE UPDATE ON "StoreChatGroup" FOR EACH ROW EXECUTE FUNCTION "UnreviewedChatTrigger"()');
   await assertRefusalPreserves(service,f,packet);
   await f.db.$executeRawUnsafe('DROP TRIGGER "UnreviewedChatTrigger" ON "StoreChatGroup"');
   await f.db.$executeRawUnsafe('DROP FUNCTION "UnreviewedChatTrigger"()');
  });
  const fresh=await request(service);
  await t.test('late installation failure rolls back schema, guards and enrollment together',async()=>{
   const before=await snapshot(f);
   const rollbackDb={$transaction:(fn,options)=>f.db.$transaction(async tx=>{
    const receipt=await fn(tx);
    assert.equal(receipt.installed,true);
    throw Error('V3_LATE_ROLLBACK');
   },options)};
   const rollbackService=createEvents(rollbackDb,{sourceRevision:revision,enabled:true,profile:'CAPTURE_REPORTS_ONLY_V3'});
   await assert.rejects(rollbackService.install(actor,fresh),/V3_LATE_ROLLBACK/);
   assert.deepEqual(await snapshot(f),before);
  });
  const beforeTables=await f.db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename");
  const beforeRows=await f.rows();
  const beforeFences=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
  const receipt=await service.install(actor,await request(service));
  assert.equal(receipt.installed,true);
  assert.deepEqual((await f.rows()).filter(row=>row.table_name!=='StoreLifecycleFence'),
   beforeRows.filter(row=>row.table_name!=='StoreLifecycleFence'));
  const afterFences=await f.db.$queryRawUnsafe('SELECT * FROM "StoreLifecycleFence" ORDER BY "storeId"');
  assert.deepEqual(afterFences.map(({planHash,...rest})=>rest),beforeFences.map(({planHash,...rest})=>rest));
  assert(afterFences.every(row=>row.planHash===service.describe().targetPlanHash));
  assert.equal((await service.inspect(actor,scope)).packet.installed,true);
  const afterTables=await f.db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename");
  const existingNames=new Set(beforeTables.map(row=>row.tablename));
  assert.deepEqual(afterTables.filter(row=>!existingNames.has(row.tablename)).map(row=>row.tablename),['AutomaticReportEventConsent']);
  const eventGuards=await f.db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='"AutomaticReportEventConsent"'::regclass`);
  assert.equal(eventGuards[0].count,2);

  const chatTriggers=await f.db.$queryRawUnsafe(`SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname=ANY($1::text[])`,chatTables);
  assert.deepEqual(chatTriggers,[]);
  const preserved=await f.db.$queryRawUnsafe(chatTables.map(table=>`SELECT ${literal(table)} AS name,count(*)::int AS count FROM ${q(table)}`).join(' UNION ALL ')+' ORDER BY name');
  assert(preserved.every(row=>row.count===3),'target, same-company control and foreign-company Chat rows all remain');
  assert.equal(JSON.stringify(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2'})),v2Before);
  assert.equal(createLifecycleInstallationCore(v2,{sourceRevision:revision}).describe().planHash,v2Hash);
 }finally{await f.close();}
});
