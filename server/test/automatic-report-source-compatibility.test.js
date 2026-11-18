import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareOperationalReportInspection,operationalReportCompatibilityDDL} from '../src/services/automatic-report-source-compatibility.js';
const fixture=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/report-operational-compatibility.proposed.json',import.meta.url),'utf8'));
const catalogueKeys=['relations','columns','constraints','indexes','triggers'];
const metadataTx=(catalogue,other=[])=>({$queryRawUnsafe:async sql=>{
 if(sql.includes('c.relowner=')&&sql.includes('c.relreplident'))return catalogue.relations;
 if(sql.includes('a.attnum::int AS position'))return catalogue.columns;
 if(sql.includes('c.condeferrable'))return catalogue.constraints;
 if(sql.includes('i.indisreplident'))return catalogue.indexes;
 if(sql.includes('p.prosupport'))return catalogue.triggers;
 return other;
}});

test('immutable operational fixture contains exactly the reviewed nine non-owning relations and package function',()=>{
 assert.equal(fixture.tables.length,9);assert.equal(new Set(fixture.tables.map(t=>t.name)).size,9);
 assert.deepEqual(operationalReportCompatibilityDDL(),fixture.ddl);
 for(const table of fixture.tables)assert.deepEqual(table.columns,fixture.catalogue.columns.filter(c=>c.table===table.name).map(c=>[c.name,c.type,c.notNull]));
 const trigger=fixture.catalogue.triggers[0];assert.equal(trigger.table,'StoreProduct');assert.equal(trigger.mask,23);
 assert.equal(fixture.packageTrigger.bodySha256,createHash('sha256').update(trigger.body).digest('hex'));
});

test('verified compatibility proxy filters only known old-core metadata and preserves unrelated queries and rows',async()=>{
 const oldRows=[{name:'StoreStockPackage',table:'StoreStockPackage'},{name:'UnknownOperationalRelation',table:'UnknownOperationalRelation'},{name:'mws_guard_package_stock_change',table:'StoreProduct'},{name:'unexpected_trigger',table:'StoreProduct'}];
 const raw=metadataTx(fixture.catalogue,oldRows),prepared=await prepareOperationalReportInspection(raw,'public');
 assert.equal(prepared.evidence.executionEnabled,false);assert.equal(prepared.evidence.preservedTables.length,9);
 const sql='SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,p.prosrc AS body FROM pg_trigger t';
 assert.deepEqual(await prepared.tx.$queryRawUnsafe(sql,'public'),oldRows.slice(1).filter(row=>row.name!=='mws_guard_package_stock_change'));
 assert.deepEqual(await prepared.tx.$queryRawUnsafe('SELECT * FROM pg_class','public'),oldRows);
 assert.deepEqual(await prepared.tx.$queryRawUnsafe(sql,'other'),oldRows);
 assert.deepEqual(await prepared.tx.$queryRawUnsafe(sql,'public','extra'),oldRows);
});

test('catalogue shape, ownership, FK, default and executable trigger drift are rejected before a proxy is returned',async()=>{
 for(const key of catalogueKeys){const changed=structuredClone(fixture.catalogue);changed[key].push({unexpected:true});await assert.rejects(prepareOperationalReportInspection(metadataTx(changed),'public'),{code:'REPORT_OPERATIONAL_CATALOGUE_CHANGED'});}
 for(const [section,index,field,value] of [
  ['relations',0,'rls',true],['relations',0,'ownedByCurrentUser',false],['relations',0,'inherited',true],
  ['columns',0,'defaultExpression',"'changed'::text"],['columns',0,'notNull',false],
  ['constraints',0,'validated',false],['indexes',0,'valid',false],
  ['triggers',0,'definer',true],['triggers',0,'settings',['search_path=evil']],
  ['triggers',0,'returnType','integer'],['triggers',0,'mask',19],['triggers',0,'body','BEGIN RETURN NEW; END']
 ]){const changed=structuredClone(fixture.catalogue);changed[section][index][field]=value;await assert.rejects(prepareOperationalReportInspection(metadataTx(changed),'public'),{code:'REPORT_OPERATIONAL_CATALOGUE_CHANGED'});}
});

const pgliteModule=process.env.MWS_TEST_PGLITE_MODULE;
test('real PostgreSQL WASM catalog rejects DDL drift and never hides unknown relations',{skip:!pgliteModule,timeout:120000},async()=>{
 const {PGlite}=await import(pgliteModule),db=new PGlite();
 const tx={$queryRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).rows};
 try{
  await db.exec('CREATE TABLE "StoreProduct" ("id" text primary key,"storeId" text,"productId" text,"currentStock" numeric)');
  for(const sql of operationalReportCompatibilityDDL())await db.exec(sql);
  assert.equal((await prepareOperationalReportInspection(tx,'public')).evidence.preservedTables.length,9);
  const changes=[
   'ALTER TABLE "PosScannedCashReturn" ALTER COLUMN "createdAt" SET DEFAULT clock_timestamp()',
   'ALTER TABLE "PosScannedCashReturn" ADD COLUMN surprise text',
   'ALTER TABLE "PosScannedCashReturn" ENABLE ROW LEVEL SECURITY',
   'ALTER TABLE "PosScannedCashReturn" FORCE ROW LEVEL SECURITY',
   'ALTER TABLE "PosScannedCashReturn" DROP CONSTRAINT "PosScannedCashReturn_pkey"',
   'CREATE INDEX "unexpected_index" ON "PosScannedCashReturn" ("storeId")',
   'ALTER TABLE "PosInternalTransfer" DROP CONSTRAINT "PosInternalTransfer_check"',
   'ALTER TABLE "PosInternalTransferLine" DROP CONSTRAINT "PosInternalTransferLine_transferId_fkey"',
   'CREATE TABLE "UnknownIncomingReference" (id text REFERENCES "PosInternalTransfer"(id))',
   'ALTER TABLE "PosScannedCashReturn" ADD FOREIGN KEY ("storeId") REFERENCES "StoreProduct"(id)',
   'ALTER TABLE "PosScannedCashReturn" OWNER TO drift_owner',
   'CREATE TRIGGER "unexpected_trigger" BEFORE INSERT ON "PosScannedCashReturn" FOR EACH ROW EXECUTE FUNCTION "mws_guard_package_stock"()',
   'ALTER TABLE "StoreProduct" DISABLE TRIGGER "mws_guard_package_stock_change"',
   'ALTER FUNCTION "mws_guard_package_stock"() SECURITY DEFINER',
   'ALTER FUNCTION "mws_guard_package_stock"() SET search_path=public',
   'ALTER FUNCTION "mws_guard_package_stock"() OWNER TO drift_owner',
   'CREATE OR REPLACE FUNCTION "mws_guard_package_stock"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$'
  ];
  await db.exec('CREATE ROLE drift_owner');
  for(const sql of changes){
   await db.exec('BEGIN');
   try{await db.exec(sql);await assert.rejects(prepareOperationalReportInspection(tx,'public'),{code:'REPORT_OPERATIONAL_CATALOGUE_CHANGED'},sql)}finally{await db.exec('ROLLBACK')}
  }
  await db.exec('CREATE TABLE "UnknownOperationalRelation" (id text)');
  const prepared=await prepareOperationalReportInspection(tx,'public');
  const rows=await prepared.tx.$queryRawUnsafe('SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind=\'r\' ORDER BY c.relname','public');
  assert.ok(rows.some(row=>row.name==='UnknownOperationalRelation'));assert.ok(rows.some(row=>row.name==='StoreProduct'));assert.ok(!rows.some(row=>row.name==='StoreStockPackage'));
 }finally{await db.close()}
});
