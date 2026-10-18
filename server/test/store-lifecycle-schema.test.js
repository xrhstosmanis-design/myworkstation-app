import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {captureLifecycleSchema,lifecycleSchemaFingerprint,reviewLifecycleSchema} from '../src/services/store-lifecycle-schema.js';
const actor={id:'admin',isSuperAdmin:true};
const empty=()=>({schema:'app',tables:[],columns:[],constraints:[],indexes:[],triggers:[],types:[],sequences:[],views:[]});
test('schema fingerprint is key-order stable and separates DDL from row freshness',()=>{
 assert.equal(lifecycleSchemaFingerprint({a:1,b:{c:2,d:3}}),lifecycleSchemaFingerprint({b:{d:3,c:2},a:1}));
 assert.notEqual(lifecycleSchemaFingerprint({...empty(),columns:[{table:'Sale',name:'amount',type:'numeric(18,2)'}]}),lifecycleSchemaFingerprint(empty()));
});
test('schema review flags undeclared identifiers, attachment storage, complex tables and triggers without readiness claims',()=>{
 const m={...empty(),columns:[{table:'Sale',name:'storeId',type:'text'},{table:'Sale',name:'sourceId',type:'text'},{table:'Attachment',name:'storageKey',type:'text'},{table:'Attachment',name:'raw',type:'bytea'}],constraints:[{schema:'app',table:'Sale',kind:'f',columns:['storeId']}],tables:[{name:'Sale',kind:'r',partition:false,rowSecurity:true,forceRowSecurity:false}],triggers:[{table:'Sale',name:'audit'}]};
 const r=reviewLifecycleSchema(m);assert.deepEqual(r.undeclaredIdColumns,[{table:'Sale',column:'sourceId'}]);assert.equal(r.attachmentCandidates.length,2);assert.equal(r.complexTables.length,1);assert.equal(r.userTriggers.length,1);assert.equal(r.executionAvailable,false);assert.equal(r.restoreReady,false);
});
test('unauthorized schema capture fails before accessing database',async()=>{
 const db={$transaction(){throw Error('unexpected database access')}};
 for(const user of [null,{id:'owner',role:'OWNER'},{id:'ordinary',role:'SUPER_ADMIN'}])await assert.rejects(captureLifecycleSchema(db,user,{companyId:'c',storeId:'s'}),e=>e.status===403);
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native read-only schema capture handles composite keys, enum/domain, quoted names, sequence, view, trigger and RLS; no tenant rows are exported',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_schema_'+randomUUID().replaceAll('-','');
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const u=new URL(process.env.DATABASE_URL);u.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:u.toString()});
 try{
  for(const sql of [
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"name" text)',
   `INSERT INTO "Store" VALUES('target','company','PRIVATE TARGET'),('sibling','company','PRIVATE SIBLING'),('foreign','other','PRIVATE FOREIGN')`,
   `CREATE TYPE "OrderState" AS ENUM ('OPEN','CLOSED')`,
   'CREATE DOMAIN "Nonnegative" AS numeric(18,2) CHECK(VALUE>=0)',
   'CREATE TABLE "Sale"("companyId" text,"id" text,"storeId" text REFERENCES "Store"("id"),"sourceId" text,"amount" "Nonnegative","state" "OrderState" DEFAULT \'OPEN\',PRIMARY KEY("companyId","id"))',
   'CREATE TABLE "Line"("companyId" text,"saleId" text,FOREIGN KEY("companyId","saleId") REFERENCES "Sale"("companyId","id") DEFERRABLE INITIALLY DEFERRED)',
   'CREATE TABLE "Quoted "" attachment"("id" text PRIMARY KEY,"storageKey" text,"raw" bytea)',
   'CREATE SEQUENCE "RecoverySequence" START 9007199254740993',
   'CREATE VIEW "SalesView" AS SELECT "id","amount" FROM "Sale"',
   'CREATE FUNCTION "capture_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$',
   'CREATE TRIGGER "CaptureAudit" BEFORE INSERT ON "Sale" FOR EACH ROW EXECUTE FUNCTION "capture_trigger"()',
   `INSERT INTO "Sale" VALUES('company','sale','target','PRIVATE SOURCE',12,'OPEN'),('company','control','sibling','PRIVATE CONTROL',13,'OPEN')`,
   'ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY'
  ])await db.$executeRawUnsafe(sql);
  const rows=async()=>({stores:await db.$queryRawUnsafe('SELECT row_to_json(t)::text AS row FROM "Store" t ORDER BY "id"'),sales:await db.$queryRawUnsafe('SELECT row_to_json(t)::text AS row FROM "Sale" t ORDER BY "id"')});
  const before=await rows(),result=await captureLifecycleSchema(db,actor,{companyId:'company',storeId:'target'});
  assert.deepEqual(await rows(),before);assert.equal(result.review.restoreReady,false);assert.equal(result.review.executionAvailable,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE TARGET|PRIVATE SIBLING|PRIVATE FOREIGN|PRIVATE SOURCE|PRIVATE CONTROL/);
  const fk=result.metadata.constraints.find(x=>x.table==='Line'&&x.kind==='f');assert.deepEqual(fk.columns,['companyId','saleId']);assert.deepEqual(fk.parentColumns,['companyId','id']);assert.equal(fk.deferrable,true);assert.equal(fk.deferred,true);
  assert.deepEqual(result.metadata.types.find(x=>x.name==='OrderState').labels,['OPEN','CLOSED']);assert.ok(result.metadata.types.some(x=>x.name==='Nonnegative'&&x.kind==='d'));
  assert.equal(result.metadata.sequences.find(x=>x.name==='RecoverySequence').start,'9007199254740993');assert.ok(result.metadata.views.some(x=>x.name==='SalesView'));
  assert.ok(result.review.attachmentCandidates.some(x=>x.table==='Quoted " attachment'&&x.column==='storageKey'));assert.ok(result.review.undeclaredIdColumns.some(x=>x.table==='Sale'&&x.column==='sourceId'));assert.ok(result.review.userTriggers.some(x=>x.name==='CaptureAudit'));assert.match(result.metadata.triggers[0].functionHash,/^[a-f0-9]{64}$/);assert.equal(result.metadata.triggers[0].functionDefinition,undefined);assert.ok(result.review.complexTables.some(x=>x.table==='Sale'&&x.rowSecurity));
  assert.equal((await captureLifecycleSchema(db,actor,{companyId:'company',storeId:'target'})).schemaFingerprint,result.schemaFingerprint);
  await db.$executeRawUnsafe(`UPDATE "Sale" SET "amount"=14 WHERE "id"='sale'`);assert.equal((await captureLifecycleSchema(db,actor,{companyId:'company',storeId:'target'})).schemaFingerprint,result.schemaFingerprint);
  await db.$executeRawUnsafe('ALTER TABLE "Sale" ADD COLUMN "newField" text');assert.notEqual((await captureLifecycleSchema(db,actor,{companyId:'company',storeId:'target'})).schemaFingerprint,result.schemaFingerprint);
  for(const bad of [{companyId:'other',storeId:'target'},{companyId:'company',storeId:'foreign'}])await assert.rejects(captureLifecycleSchema(db,actor,bad),e=>e.status===404);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
