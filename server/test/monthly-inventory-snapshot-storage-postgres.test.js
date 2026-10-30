import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {buildMonthlyInventorySnapshotCandidate as build,serializeMonthlyInventorySnapshotCandidate as serialize} from '../src/services/monthly-inventory-snapshot-payload.js';
import {createMonthlyInventorySnapshotRepository} from '../src/services/monthly-inventory-snapshot-repository.js';
import {provisionMonthlyInventorySnapshotSchema,validateMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
const owner={id:'owner',companyId:'c',role:'OWNER'},q=value=>'"'+value.replaceAll('"','""')+'"';
const definitions={User:'"id" text PRIMARY KEY,"role" text,"companyId" text',Company:'"id" text PRIMARY KEY,"name" text,"active" bool,"licenseStatus" text,"subscriptionEndsAt" timestamp',CompanyModule:'"id" text PRIMARY KEY,"companyId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',Store:'"id" text PRIMARY KEY,"companyId" text,"name" text,"active" bool',StorePaidModule:'"companyId" text,"storeId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',OwnerCompanyAccess:'"ownerId" text,"companyId" text',StoreLifecycleFence:'"storeId" text PRIMARY KEY,"companyId" text,"generation" bigint NOT NULL,"maintenance" bool NOT NULL,"retired" bool NOT NULL'};

test('native monthly immutable storage verifies exact bytes, current admission, concurrency and honest stored-only receipts',{
 skip:!isolated()&&!process.env.CI?'Isolated PostgreSQL unavailable locally':false,timeout:180000
},async t=>{
 assert.ok(isolated(),'Isolated PostgreSQL is mandatory in CI');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_storage_'+randomUUID().replaceAll('-','')+'_test';let db,other,created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
  for(const [table,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)}(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','SYNTHETIC',true,'ACTIVE',NULL),('x','FOREIGN',true,'ACTIVE',NULL),('platform','PLATFORM',true,'ACTIVE',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c'),('employee','EMPLOYEE','c'),('sa','SUPER_ADMIN','platform')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','SYNTHETIC',true),('sibling','c','CONTROL',true),('foreign','x','FOREIGN',true),('unenrolled','c','NO FENCE',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('module','c','INVENTORY',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false),('sibling','c',0,false,false),('foreign','x',0,false,false)`);
  await provisionMonthlyInventorySnapshotSchema(db);await validateMonthlyInventorySnapshotSchema(db);
  const repository=createMonthlyInventorySnapshotRepository(db),controls=async()=>JSON.stringify(await Promise.all(Object.keys(definitions).map(table=>db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM ${q(table)} t ORDER BY row_to_json(t)::text`))));
  const request=async({month='2000-01',storeId='s',companyId='c',generation='0',offsetMs=0,quantity='-9007199254740993.123456789012'}={})=>{
   const [clock]=await db.$queryRawUnsafe(`SELECT to_char((clock_timestamp()+($1::bigint*interval '1 millisecond')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`,String(offsetMs));
   const candidate=build({companyId,storeId,lifecycleGeneration:generation,issueMonth:month,sourceObservedAt:clock.now,sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:1,invoiceCount:1,pendingOriginalCount:1},products:[{id:'synthetic-stock',companyId,storeId,name:'Ωμέγα — synthetic only',sku:'SKU',unit:'kg',quantity,retailUnitPrice:'0.000000000001',purchaseUnitCost:false}],invoices:{period:month,items:[{id:'invoice',companyId,storeId,issueDay:month+'-03',documentNumber:'A 1',supplierName:'SYNTHETIC',categories:['UNPOSTED_DOCUMENT'],totalAmount:'-999999999999999999.123456789012'}]},pendingOriginals:{period:'ALL_MONTHS',items:[{id:'pending',companyId,storeId,documentDate:'1999-01-01',documentNumber:'P 1',supplierName:'SYNTHETIC',status:'AWAITING_INVOICE',amount:null}]}});
   return {candidateJsonText:serialize(candidate),transactionStartedAt:clock.now,sourceReadStartedAt:clock.now,sourceReadFinishedAt:clock.now};
  };
  let first,firstRequest;
  await t.test('admitted insert preserves signed decimal/canonical UTF8 bytes and actual timestamps without claiming authentic stock capture',async()=>{
   const before=await controls();firstRequest=await request();first=await repository.store(owner,firstRequest);
   assert.equal(first.status,'STORED');assert.equal(first.receiptBasis,'FORMAT_VALIDATED_STORED_ONLY');assert.equal(first.sourceAuthenticityVerified,false);assert.equal(first.candidateJsonText,firstRequest.candidateJsonText);assert.equal(first.storedBytesSha256,createHash('sha256').update(firstRequest.candidateJsonText).digest('hex'));assert.match(first.storedAt,/\.\d{6}Z$/);
   const candidate=JSON.parse(first.candidateJsonText);assert.equal(candidate.products[0].quantity,'-9007199254740993.123456789012');assert.equal(candidate.products[0].retailValue,'-9007.199254740993123456789012');assert.equal(candidate.products[0].purchaseUnknownReason,'INVALID');assert.equal(candidate.pendingOriginals.items[0].amountUnknownReason,'MISSING');assert.equal(candidate.persisted,false);assert.equal(candidate.candidateOnly,true);
   assert.equal(await controls(),before);assert.notEqual(first.storedBytesSha256,first.payloadHash);
  });
  await t.test('first success wins and even an aged retry returns the verified original receipt, never the later candidate',async()=>{
   const later=await request({quantity:'5'}),replay=await repository.store(owner,later);assert.equal(replay.status,'ALREADY_CAPTURED');assert.equal(replay.id,first.id);assert.equal(replay.candidateJsonText,first.candidateJsonText);assert.notEqual(later.candidateJsonText,replay.candidateJsonText);
   const aged=await request({offsetMs:-60000}),old=await repository.store(owner,aged);assert.equal(old.status,'ALREADY_CAPTURED');assert.equal(old.storedBytesSha256,first.storedBytesSha256);
   assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot" WHERE "storeId"='s' AND "issueMonth"='2000-01'`))[0].n,1);
  });
  await t.test('concurrent producers insert one row and both return its original readback',async()=>{
   const a=await request({month:'2000-02',quantity:'3'}),b=await request({month:'2000-02',quantity:'7'}),results=await Promise.all([repository.store(owner,a),createMonthlyInventorySnapshotRepository(other).store(owner,b)]);
   assert.deepEqual(results.map(r=>r.status).sort(),['ALREADY_CAPTURED','STORED']);assert.equal(results[0].id,results[1].id);assert.equal(results[0].candidateJsonText,results[1].candidateJsonText);
  });
  await t.test('native UPDATE DELETE and TRUNCATE guards plus corrupt-existing verification never silently replace history',async()=>{
   for(const sql of [`UPDATE "MonthlyInventorySnapshot" SET "payloadHash"=repeat('0',64) WHERE "id"='${first.id}'`,`DELETE FROM "MonthlyInventorySnapshot" WHERE "id"='${first.id}'`,`TRUNCATE "MonthlyInventorySnapshot"`])await assert.rejects(db.$executeRawUnsafe(sql),/MONTHLY_SNAPSHOT_IMMUTABLE/);
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" DISABLE TRIGGER monthly_inventory_snapshot_immutable');
   await db.$executeRawUnsafe(`UPDATE "MonthlyInventorySnapshot" SET "storedBytesSha256"=repeat('0',64) WHERE "id"=$1`,first.id);
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" ENABLE ALWAYS TRIGGER monthly_inventory_snapshot_immutable');
   await assert.rejects(repository.store(owner,await request()),{code:'MONTHLY_SNAPSHOT_STORED_INVALID'});
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" DISABLE TRIGGER monthly_inventory_snapshot_immutable');
   await db.$executeRawUnsafe(`UPDATE "MonthlyInventorySnapshot" SET "storedBytesSha256"=$2 WHERE "id"=$1`,first.id,first.storedBytesSha256);
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" ENABLE ALWAYS TRIGGER monthly_inventory_snapshot_immutable');
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" DISABLE TRIGGER monthly_inventory_snapshot_immutable');
   await assert.rejects(db.$executeRawUnsafe(`UPDATE "MonthlyInventorySnapshot" SET "transactionStartedAt"="transactionStartedAt"-interval '1 microsecond' WHERE "id"=$1`,first.id),/mws_snapshot_time_precision/);
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" ENABLE ALWAYS TRIGGER monthly_inventory_snapshot_immutable');
  });
  await t.test('current persisted personal role, module, support, scope and enrollment are mandatory even on replay',async()=>{
   const before=await controls();await assert.rejects(repository.store({...owner,tokenType:'STORE_OPERATOR'},await request()));await assert.rejects(repository.store({...owner,id:'employee'},await request()));
   await db.$executeRawUnsafe(`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`);await assert.rejects(repository.store(owner,await request()),e=>e.status===403);await db.$executeRawUnsafe(`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`);
   await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('c','s','INVENTORY',false,NULL,NULL)`);await assert.rejects(repository.store(owner,await request()),e=>e.status===403);await db.$executeRawUnsafe('DELETE FROM "StorePaidModule"');
   await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='EXPIRED' WHERE "id"='c'`);await assert.rejects(repository.store(owner,await request()),e=>e.status===403);await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='c'`);
   await assert.rejects(repository.store(owner,await request({storeId:'foreign',companyId:'x'})));await assert.rejects(repository.store(owner,await request({storeId:'unenrolled'})),{code:'MONTHLY_SNAPSHOT_ENROLLMENT_REQUIRED'});
   await assert.rejects(repository.store({id:'sa',role:'SUPER_ADMIN',companyId:'c',supportContext:{companyId:'x',storeId:'foreign'}},await request()),e=>e.status===403);assert.equal(await controls(),before);
  });
  await t.test('source age/future, fresh generation and actual lifecycle maintenance locks refuse without writes',async()=>{
   const count=async()=>(await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot"'))[0].n,before=await count();
   await assert.rejects(repository.store(owner,await request({month:'2000-03',offsetMs:-60000})),{code:'MONTHLY_SNAPSHOT_SOURCE_STALE'});await assert.rejects(repository.store(owner,await request({month:'2000-03',offsetMs:60000})),{code:'MONTHLY_SNAPSHOT_SOURCE_STALE'});
   await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`);await assert.rejects(repository.store(owner,await request()),{code:'STORE_LIFECYCLE_STALE_GENERATION'});await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='s'`);
   await other.$transaction(async tx=>{await tx.$queryRawUnsafe(`SELECT 1 FROM "StoreLifecycleFence" WHERE "storeId"='s' FOR UPDATE`);await assert.rejects(repository.store(owner,await request({month:'2000-03'})),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE')},{timeout:30000});
   const held=createMonthlyInventorySnapshotRepository({$transaction:fn=>db.$transaction(fn,{isolationLevel:'RepeatableRead',timeout:30000})});await assert.rejects(held.store(owner,await request()),{code:'MONTHLY_SNAPSHOT_FRESH_WRITE_REQUIRED'});
   assert.equal(await count(),before);
  });
  await t.test('missing and changed actual schema fail closed without any bootstrap or altered source controls',async()=>{
   const before=await controls();await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" RENAME TO "SavedMonthlySnapshot"');await assert.rejects(repository.store(owner,await request({month:'2000-03'})),{code:'MONTHLY_SNAPSHOT_SCHEMA_UNAVAILABLE'});
   assert.equal((await db.$queryRawUnsafe(`SELECT to_regclass('"MonthlyInventorySnapshot"') IS NULL AS missing`))[0].missing,true);await db.$executeRawUnsafe('ALTER TABLE "SavedMonthlySnapshot" RENAME TO "MonthlyInventorySnapshot"');
   await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" ADD COLUMN "unreviewed" text');await assert.rejects(repository.store(owner,await request()),{code:'MONTHLY_SNAPSHOT_SCHEMA_CHANGED'});await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventorySnapshot" DROP COLUMN "unreviewed"');assert.equal(await controls(),before);
  });
 }finally{
  await db?.$disconnect();await other?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();
 }
});
