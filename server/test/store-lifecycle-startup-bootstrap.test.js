import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
import * as lifecycle from '../src/services/store-lifecycle-demo-seed.js';
const require=createRequire(import.meta.url),businessStop=Symbol('BUSINESS_STEP');
function loaded(file,state){
 const calls={schema:0,business:0,reconcile:[]},store={id:'kat-store',companyId:'company',name:'ΚΑΤ'};
 const db={
  async $transaction(work){return work(db)},
  async $queryRaw(strings){const sql=strings.join('');if(/FROM\s+"Store"(?:\s|$)/i.test(sql))return [store];calls.business++;throw businessStop},
  async $executeRaw(){calls.business++;throw businessStop},
  async $executeRawUnsafe(sql,...args){if(/^(?:CREATE|ALTER|SET|DROP)/i.test(sql.trim())){calls.schema++;return 0}if(sql.includes('WITH delivered AS')){calls.reconcile.push({sql,args});return 0}calls.business++;throw businessStop},
  async $queryRawUnsafe(sql){if(sql.includes('current_schema()'))return [{name:'public'}];if(sql.includes('to_regclass'))return [{name:'public.StoreLifecycleFence'}];if(sql.includes('SELECT "storeId"'))return [{storeId:store.id}];if(sql.includes('StoreLifecycleFence'))return [{companyId:store.companyId,...state}];calls.business++;throw businessStop}
 };
 const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),compiled=transformSync(source,{format:'cjs',target:'node20'}).code;
 const module={exports:{}};
 const mockRequire=name=>name==='./prisma.js'?{prisma:db}:name==='./services/store-lifecycle-demo-seed.js'?lifecycle:name==='./hot-table-schema.js'?{executeHotTableBootstrap:async()=>{calls.schema++}}:name==='./kat-preparation-defaults.js'?{ensureKatPreparationDefaults:async()=>{calls.business++;throw businessStop}}:name==='./online-members.js'?{ensureOnlineMemberSchema:async()=>{calls.schema++}}:name==='dotenv/config'?{}:require(name.startsWith('../')?new URL('../src/'+name,import.meta.url).pathname:name);
 const expose=file==='kat-online-ordering-bootstrap.js'?'\nmodule.exports.pilot=ensureKatPilotDefaults;module.exports.reconcile=reconcileDeliveredOnlineSales;':'';
 new Function('require','module','exports',compiled+expose)(mockRequire,module,module.exports);
 return {api:module.exports,calls};
}
const entries=[['kat-preparation-bootstrap.js','ensureKatPreparationSeed'],['kat-preparation-cleanup.js','ensureKatPreparationCleanup'],['kat-preparation-defaults.js','ensureKatPreparationDefaults'],['kat-online-ordering-bootstrap.js','pilot']];
test('actual KAT startup seed/default/cleanup functions preserve schema work but perform no business seeding after reset or during maintenance',async()=>{
 for(const [file,fn] of entries)for(const state of [{generation:'1',maintenance:false,retired:false},{generation:'0',maintenance:true,retired:false},{generation:'0',maintenance:false,retired:true}]){const f=loaded(file,state);await f.api[fn]();assert.equal(f.calls.business,0,file)}
});
test('actual startup first-install generation zero still reaches its original business path',async()=>{
 for(const [file,fn] of entries){const f=loaded(file,{generation:'0',maintenance:false,retired:false});await assert.rejects(f.api[fn](),error=>error===businessStop);assert.equal(f.calls.business,1,file)}
});
test('actual legacy online reconciliation binds exclusions to all three SQL statements instead of rewriting reset stores',async()=>{
 const f=loaded('kat-online-ordering-bootstrap.js',{generation:'1',maintenance:false,retired:false});await f.api.reconcile();assert.equal(f.calls.reconcile.length,3);for(const {sql,args} of f.calls.reconcile){assert.match(sql,/NOT \(o\."storeId"=ANY\(\$1::text\[\]\)\)/);assert.deepEqual(args,[['kat-store']])}
});
