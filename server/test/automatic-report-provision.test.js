import test from 'node:test';
import assert from 'node:assert/strict';
import {runProvision,validateProvisionConnection,REVIEWED_DDL_SHA256} from '../scripts/automatic-report-provision.mjs';
import {assertDispatchStorageAbsent,assertDispatchCatalog,schemaIdentifier} from '../src/services/automatic-report-provision-catalog.js';
const options={serviceId:'srv-d9isenfavr4c73bdh52g',revision:'a'.repeat(40),host:'production.internal',port:5432,database:'production',schema:'public',ddlSha256:REVIEWED_DDL_SHA256,exclusiveMaintenance:true};
const env={RENDER_SERVICE_ID:options.serviceId,RENDER_GIT_COMMIT:options.revision,DATABASE_URL:'postgresql://private:secret@production.internal/production'};
test('provision rejects connection identity and every unsafe override',()=>{
 assert.equal(validateProvisionConnection(env.DATABASE_URL,options),true);
 for(const url of ['postgresql://u:p@other/production','postgresql://u:p@production.internal:5433/production','postgresql://u:p@production.internal/other','postgresql://u:p@production.internal/production?host=evil','postgresql://u:p@production.internal/production?options=-csearch_path=evil','postgresql://u:p@production.internal/production?schema=public&schema=public','postgresql://u:p@production.internal/production?sslmode=disable','postgresql://u:p@production.internal/production?schema=other'])assert.throws(()=>validateProvisionConnection(url,options));
 assert.throws(()=>schemaIdentifier('public;DROP SCHEMA public'));assert.throws(()=>assertDispatchCatalog({},null));
});
test('identity, OFF, source, acknowledgment and PG18 oracle gates open no transaction',async()=>{
 let n=0;const db={$transaction:async()=>{n++;throw new Error('unexpected');}};
 for(const [o,e]of [[{...options,revision:'b'.repeat(40)},env],[options,{...env,RENDER_SERVICE_ID:'other'}],[options,{...env,AUTOMATIC_REPORT_ACTIVATION_CONTROL:'{}'}],[{...options,ddlSha256:'b'.repeat(64)},env],[{...options,exclusiveMaintenance:false},env],[{...options,execute:true},env],[{...options,execute:true,ack:'PROVISION_SIX_EMPTY_DISPATCH_TABLES_OFF',oracle:{serverMajor:16}},env]])await assert.rejects(runProvision(db,o,e),/PROVISION_/);
 assert.equal(n,0);
});
test('default preflight is explicitly read-only and never executes DDL',async()=>{
 const sql=[];const tx={$executeRawUnsafe:async s=>{sql.push(s)},$queryRawUnsafe:async s=>s.startsWith('SELECT current_database')?[{database:'production',schema:'public',port:5432,version:180004}]:s.includes('pg_event_trigger')?[{count:0}]:[]};
 const result=await runProvision({$transaction:async(fn,limits)=>{assert.deepEqual(limits,{maxWait:5000,timeout:15000});return fn(tx)}},options,env);
 assert.equal(sql[0],'SET TRANSACTION READ ONLY');assert.equal(sql.some(s=>s.startsWith('CREATE')),false);assert.equal(result.storage,'ALL_SIX_ABSENT');
});
test('absence guard rejects relation or type collision of any kind',async()=>{
 await assert.rejects(assertDispatchStorageAbsent({$queryRawUnsafe:async()=>[{name:'AutomaticReportPayload'}]},'public'),/PROVISION_STORAGE_EXISTS/);
});
