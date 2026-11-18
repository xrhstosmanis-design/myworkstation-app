import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareReportColumnInspection,reportColumnCompatibilityDDL} from '../src/services/automatic-report-column-compatibility.js';
const fixture=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/report-column-compatibility.proposed.json',import.meta.url),'utf8'));
const raw=(catalogue,rows=[])=>({$queryRawUnsafe:async sql=>{
 if(sql.includes('a.attnum::int AS position'))return catalogue.columns;
 if(sql.includes('c.condeferrable'))return catalogue.constraints;
 if(sql.includes('pg_get_indexdef'))return catalogue.indexes;
 return rows;
}});

test('six-column source proxy removes exactly verified additions and preserves unknown fields and queries',async()=>{
 assert.equal(fixture.catalogue.columns.length,6);assert.equal(fixture.catalogue.constraints.length,1);assert.deepEqual(fixture.catalogue.indexes,[]);
 const rows=[{table:'PurchaseOrder',name:'awaitingInvoice'},{table:'StoreProduct',name:'costPriceOverride'},{table:'TableOrder',name:'cashParts'},{table:'StoreProduct',name:'unreviewedColumn'},{table:'OtherTable',name:'cashParts'}];
 const {tx,evidence}=await prepareReportColumnInspection(raw(fixture.catalogue,rows),'public');
 assert.equal(evidence.executionEnabled,false);assert.equal(evidence.reviewedColumns.length,6);
 const query='SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a';
 assert.deepEqual(await tx.$queryRawUnsafe(query,'public'),rows.slice(3));
 assert.deepEqual(await tx.$queryRawUnsafe(query,'other'),rows);
 assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM pg_attribute','public'),rows);
});

test('each physical-column change or added dependency prevents compatibility admission',async()=>{
 for(const key of ['columns','constraints','indexes']){
  const catalogue=structuredClone(fixture.catalogue);catalogue[key].push({unexpected:true});
  await assert.rejects(prepareReportColumnInspection(raw(catalogue),'public'),{code:'REPORT_COLUMN_CATALOGUE_CHANGED'});
 }
 for(const [field,value] of [['position',19],['type','text'],['notNull',false],['defaultExpression','true'],['identity','a'],['generated','s'],['acl','unexpected']]){
  const catalogue=structuredClone(fixture.catalogue);catalogue.columns[0][field]=value;
  await assert.rejects(prepareReportColumnInspection(raw(catalogue),'public'),{code:'REPORT_COLUMN_CATALOGUE_CHANGED'});
 }
});

test('real PostgreSQL WASM validates six source DDL additions and rejects defaults, checks, FKs and hidden index dependencies',{skip:!process.env.MWS_TEST_PGLITE_MODULE,timeout:120000},async()=>{
 const {PGlite}=await import(process.env.MWS_TEST_PGLITE_MODULE),db=new PGlite();
 const tx={$queryRawUnsafe:async(sql,...args)=>(await db.query(sql,args)).rows};
 try{
  const old=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json',import.meta.url),'utf8'));
  for(const {name} of fixture.tables)await db.exec('CREATE TABLE "'+name+'" ('+old.knownColumns[name].map(([column,type])=>'"'+column+'" '+type).join(',')+')');
  await db.exec('CREATE TABLE "OtherReference" (id text primary key)');
  for(const sql of reportColumnCompatibilityDDL())await db.exec(sql);
  assert.equal((await prepareReportColumnInspection(tx,'public')).evidence.reviewedColumns.length,6);
  const changes=[
   'ALTER TABLE "PurchaseOrder" ALTER COLUMN "awaitingInvoice" SET DEFAULT TRUE',
   'ALTER TABLE "PurchaseOrder" ALTER COLUMN "awaitingInvoice" DROP NOT NULL',
   'ALTER TABLE "TableOrder" ALTER COLUMN "cashParts" SET DEFAULT \'{}\'::jsonb',
   'ALTER TABLE "StoreProduct" ALTER COLUMN "costPriceOverride" TYPE numeric(14,4)',
   'ALTER TABLE "StoreProduct" DROP CONSTRAINT "StoreProduct_costPriceOverride_check"',
   'ALTER TABLE "StoreProduct" ADD CHECK ("categoryIdOverride" IS NULL)',
   'ALTER TABLE "StoreProduct" ADD FOREIGN KEY ("categoryIdOverride") REFERENCES "OtherReference"(id)',
   'CREATE INDEX unexpected_direct ON "StoreProduct"("categoryIdOverride")',
   'CREATE INDEX unexpected_expression ON "StoreProduct"(lower("categoryIdOverride"))',
   'CREATE INDEX unexpected_partial ON "StoreProduct"(id) WHERE "categoryIdOverride" IS NOT NULL',
   'ALTER TABLE "TableOrder" DROP COLUMN "cashParts"'
  ];
  for(const sql of changes){
   await db.exec('BEGIN');
   try{await db.exec(sql);await assert.rejects(prepareReportColumnInspection(tx,'public'),{code:'REPORT_COLUMN_CATALOGUE_CHANGED'},sql)}finally{await db.exec('ROLLBACK')}
  }
  await db.exec('ALTER TABLE "StoreProduct" ADD COLUMN "unexpectedColumn" text');
  const {tx:proxy}=await prepareReportColumnInspection(tx,'public');
  const columns=await proxy.$queryRawUnsafe('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped','public');
  assert.ok(columns.some(column=>column.name==='unexpectedColumn'));
  assert.ok(!columns.some(column=>column.name==='cashParts'));
 }finally{await db.close()}
});
