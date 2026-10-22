import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {assertDispatchStorageAbsent,captureDispatchCatalog,assertDispatchCatalog,DISPATCH_TABLES} from '../src/services/automatic-report-provision-catalog.js';
import {runProvision,REVIEWED_DDL_SHA256} from '../scripts/automatic-report-provision.mjs';
function isolated(value=process.env.DATABASE_URL){
 try{const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'&&/^[a-z_][a-z0-9_]{0,62}$/.test(v))continue;if(['connection_limit','pool_timeout','statement_cache_size'].includes(k)&&/^\d{1,4}$/.test(v))continue;return false;}return true;}catch{return false;}
}
test('provision native guard refuses production/remote/URL overrides',()=>{
 for(const u of ['postgresql://u:p@remote/module_test','postgresql://u:p@localhost/production','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=a&schema=b'])assert.equal(isolated(u),false);
 if(process.env.CI)assert.equal(isolated(),true,'CI native fixture must execute');
});
test('native full catalog oracle, collisions, mismatch rollback and operator isolation',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient();const schema='dispatch_operator_'+randomBytes(10).toString('hex');const u=new URL(process.env.DATABASE_URL);u.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:u.toString()}),b=new PrismaClient({datasourceUrl:u.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  let oracle;const captured=new Error('CAPTURE_ROLLBACK');
  await assert.rejects(a.$transaction(async tx=>{await provisionAutomaticReportDispatchSchema({$transaction:fn=>fn(tx)});oracle=await captureDispatchCatalog(tx,schema);assertDispatchCatalog(oracle,oracle);throw captured;},{timeout:15000}),e=>e===captured);
  await assertDispatchStorageAbsent(a,schema);
  if(process.env.MWS_REQUIRE_PROVISION_PG18==='true')assert.equal(oracle.serverMajor,18,'dedicated workflow must execute PG18');
  if(oracle.serverMajor===18){
   console.log('MWS_PG18_CATALOG_BASE64='+Buffer.from(JSON.stringify(oracle)).toString('base64'));
   try{const fixture=JSON.parse(await readFile(new URL('./fixtures/automatic-report-provision-catalog-pg18.json',import.meta.url),'utf8'));assertDispatchCatalog(oracle,fixture);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await t.test('full catalog oracle rejects changed defaults/checks/indexes/rows/RLS/types',()=>{
   for(const mutate of [x=>x.tables[0].rows++,x=>x.tables[0].columns[0].default_expression='unsafe',x=>x.tables[0].constraints.pop(),x=>x.tables[0].indexes.pop(),x=>x.tables[0].relation.rls=true,x=>x.tables[0].types.pop()]){const drift=structuredClone(oracle);mutate(drift);assert.throws(()=>assertDispatchCatalog(drift,oracle),/PROVISION_CATALOG_MISMATCH/);}
  });
  await t.test('transaction rolls back all six tables after a real catalog mismatch',async()=>{
   await assert.rejects(a.$transaction(async tx=>{await provisionAutomaticReportDispatchSchema({$transaction:fn=>fn(tx)});await tx.$executeRawUnsafe('ALTER TABLE "AutomaticReportDispatchPolicy" ALTER COLUMN "dispatchEnabled" SET DEFAULT true');assertDispatchCatalog(await captureDispatchCatalog(tx,schema),oracle);},{timeout:15000}),/PROVISION_CATALOG_MISMATCH/);await assertDispatchStorageAbsent(a,schema);
  });
  await t.test('all relation kinds and standalone type collisions refuse',async()=>{
   await a.$executeRawUnsafe('CREATE VIEW "AutomaticReportPayload" AS SELECT 1 AS n');await assert.rejects(assertDispatchStorageAbsent(a,schema),/PROVISION_STORAGE_EXISTS/);await a.$executeRawUnsafe('DROP VIEW "AutomaticReportPayload"');
   await a.$executeRawUnsafe('CREATE TYPE "AutomaticReportPayload" AS ENUM (\'synthetic\')');await assert.rejects(assertDispatchStorageAbsent(a,schema),/PROVISION_STORAGE_EXISTS/);await a.$executeRawUnsafe('DROP TYPE "AutomaticReportPayload"');
  });
  const options={serviceId:'srv-d9isenfavr4c73bdh52g',revision:'a'.repeat(40),host:u.hostname,port:Number(u.port||5432),database:decodeURIComponent(u.pathname.slice(1)),schema,ddlSha256:REVIEWED_DDL_SHA256,exclusiveMaintenance:true,execute:true,ack:'PROVISION_SIX_EMPTY_DISPATCH_TABLES_OFF',oracle};const env={DATABASE_URL:u.toString(),RENDER_SERVICE_ID:options.serviceId,RENDER_GIT_COMMIT:options.revision};
  if(oracle.serverMajor===18){
   await t.test('real maintenance contention refuses without DDL or retry',async()=>{
    await b.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2704,3075)::text');await assert.rejects(runProvision(a,options,env),/PROVISION_MAINTENANCE_BUSY/);});await assertDispatchStorageAbsent(a,schema);
   });
   await t.test('real operator mismatch rolls back every table',async()=>{
    const drift=structuredClone(oracle);drift.tables[0].columns[0].default_expression='42';await assert.rejects(runProvision(a,{...options,oracle:drift},env),/PROVISION_CATALOG_MISMATCH/);await assertDispatchStorageAbsent(a,schema);
   });
   await t.test('real operator creates exactly six empty tables and repeat refuses',async()=>{
    const r=await runProvision(a,options,env);assert.equal(r.mode,'PROVISIONED_SIX_EMPTY_TABLES');await a.$transaction(async tx=>assertDispatchCatalog(await captureDispatchCatalog(tx,schema),oracle));const rows=await a.$queryRawUnsafe('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name',schema);assert.deepEqual(rows.map(r=>r.table_name),DISPATCH_TABLES);await assert.rejects(runProvision(a,options,env),/PROVISION_STORAGE_EXISTS/);
   });
  }else{
   await t.test('actual non-PG18 database cannot execute production operator',async()=>{await assert.rejects(runProvision(a,{...options,oracle:{...oracle,serverMajor:18}},env),/PROVISION_DATABASE_IDENTITY/);await assertDispatchStorageAbsent(a,schema);});
  }
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);}finally{await admin.$disconnect();}}
});
