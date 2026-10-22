import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {withStoreModuleMutation} from '../src/services/store-module-mutation.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';

function harness(options={}){
 const events=[],writes=[];
 const store={id:'s',companyId:'c',name:'Inactive configurable store'};
 const tx={
  $queryRawUnsafe:async(sql,...values)=>{
   events.push(sql.includes('current_schema')?'metadata':sql.includes('set_config')?'epoch':'lifecycle');
   if(sql.includes('current_schema'))return [{schema:'isolated',fence:options.enrolled?'fence':null}];
   if(sql.includes('set_config'))return [];
   return [{companyId:'c',generation:options.generation||'7',maintenance:!!options.maintenance,retired:false}];
  },
  $queryRaw:async(strings,...values)=>{events.push('store-lock');assert.match(strings.join('?'),/FOR NO KEY UPDATE NOWAIT/);assert.doesNotMatch(strings.join('?'),/active/);assert.deepEqual(values,['s','c']);if(options.busy)throw options.busy;return options.missing?[]:[store]},
  $executeRaw:async(strings,...values)=>{events.push('write');assert.match(strings.join('?'),/INSERT INTO "StorePaidModule"/);writes.push(values);return 1},
  companyModule:{findUnique:async()=>{events.push('company-fallback');return {active:!!options.companyActive}}}
 };
 const db={
  $transaction:async callback=>{events.push('begin');try{const result=await callback(tx);if(options.commitError)throw options.commitError;events.push('commit');return result}catch(e){events.push('rollback');throw e}},
  $executeRaw:()=>assert.fail('root write bypassed transaction'),
  $queryRaw:async()=>[],
  store:{findFirst:async()=>{events.push('preflight');return options.missing?null:store}},
  companyModule:{findUnique:()=>assert.fail('root commercial fallback'),findMany:async()=>[]},
  authAudit:{create:async({data})=>{events.push('audit');return data}}
 };
 return {db,tx,store,events,writes};
}
test('helper locks lifecycle then scoped Store, callback uses same tx and commit result',async()=>{
 const h=harness({enrolled:true});
 const result=await withLifecycleContext({s:'7'},()=>withStoreModuleMutation(h.db,{companyId:'c',storeId:'s'},async({tx,store})=>{assert.equal(tx,h.tx);assert.equal(store,h.store);h.events.push('callback');return 42}));
 assert.equal(result,42);assert.deepEqual(h.events,['begin','metadata','lifecycle','epoch','store-lock','callback','commit']);
});
test('captures scope and original lifecycle epoch before deferred transaction checkout',async()=>{
 const h=harness({enrolled:true}),scope={companyId:'c',storeId:'s'};let callback;
 h.db.$transaction=work=>{callback=work;return 'scheduled'};
 assert.equal(withLifecycleContext({s:'7'},()=>withStoreModuleMutation(h.db,scope,()=>42)),'scheduled');
 scope.storeId='other';scope.companyId='other';
 assert.equal(await withLifecycleContext({s:'8'},()=>callback(h.tx)),42);
});
for(const busy of [{code:'55P03'},{code:'P2010',meta:{code:'55P03'}}])test('Store NOWAIT busy is explicit 409 without callback or retry '+JSON.stringify(busy),async()=>{
 const h=harness({busy});await assert.rejects(withStoreModuleMutation(h.db,{companyId:'c',storeId:'s'},()=>assert.fail('callback')),e=>e.status===409&&e.code==='STORE_MODULE_BUSY');assert.equal(h.events.filter(x=>x==='begin').length,1);
});
test('missing/foreign Store is 404 and cannot write',async()=>{const h=harness({missing:true});await assert.rejects(withStoreModuleMutation(h.db,{companyId:'c',storeId:'s'},()=>assert.fail('callback')),e=>e.status===404&&e.code==='STORE_MODULE_STORE_NOT_FOUND')});
for(const options of [{enrolled:true},{enrolled:true,maintenance:true}])test('stale or maintenance lifecycle stops before Store lock '+JSON.stringify(options),async()=>{const h=harness(options);await assert.rejects(withStoreModuleMutation(h.db,{companyId:'c',storeId:'s'},()=>assert.fail('callback')),e=>e.status===409&&e.code.startsWith('STORE_LIFECYCLE_'));assert.ok(!h.events.includes('store-lock'))});
test('unexpected lock/commit error propagates unchanged without retry',async()=>{for(const kind of ['busy','commitError']){const error=new Error(kind),h=harness({[kind]:error});await assert.rejects(withStoreModuleMutation(h.db,{companyId:'c',storeId:'s'},()=>1),e=>e===error);assert.equal(h.events.filter(x=>x==='begin').length,1)}});

// Load the actual complete Router with imports substituted; handlers are neither
// copied nor rewritten. Real Express HTTP routing and the real helper execute.
const routerSource=fs.readFileSync(new URL('../src/routes/platform-store-modules.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm,'').replace('export default router;','return router;');
async function request(h,path,body,{role='SUPER_ADMIN'}={}){
 const deps={crypto,Router:express.Router,z,prisma:h.db,auth:(req,res,next)=>{req.user={id:'actor',role};next()},moduleCatalog:[{key:'CORE',commercialReady:true},{key:'PREVIEW',name:'Preview',commercialReady:false}],moduleKeys:['CORE','PREVIEW'],companyModuleState:async()=>({}),buildModuleAccessMatrix:()=>({}),platformWorkforceV2Routes:express.Router(),AI_STAFF_SCHEDULER:'AI_STAFF_SCHEDULER',PERSONNEL_PACKAGE_DEFINITIONS:[],PERSONNEL_WRITABLE_MODULE_KEYS:[],ensureStorePaidModulesSchema:async()=>{h.events.push('schema')},isSuperAdmin:u=>u.role==='SUPER_ADMIN',storePaidModuleState:async()=>({}),storePaidModuleStates:async()=>({states:[],legacy:null}),storePaidModuleCatalogStates:async()=>[],withStoreModuleMutation};
 const app=express();app.use(express.json());app.use(new Function(...Object.keys(deps),routerSource)(...Object.values(deps)));app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message,code:e.code}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/companies/c/stores/s${path}`,{method:'PUT',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
for(const path of ['','/check-packages/BASIC_CHECK']){
 test('mounted PUT '+path+' uses locked tx, preserves values, audit after commit and response',async()=>{
  const h=harness(),r=await request(h,path,{moduleKey:'CORE',active:true,monthlyPrice:'12.5',notes:' note ',startsAt:'2026-10-01T00:00:00.000Z',endsAt:null});
  assert.equal(r.status,200);assert.equal(r.body.store.id,'s');assert.equal(h.writes.length,1);const values=h.writes[0];assert.deepEqual(values.slice(1,6),['c','s',path?'BASIC_CHECK':'CORE',true,12.5]);assert.ok(values[6] instanceof Date);assert.equal(values[7],null);assert.equal(values[8],'note');assert.equal(values[9],'actor');assert.ok(h.events.indexOf('store-lock')<h.events.indexOf('write'));assert.ok(h.events.indexOf('commit')<h.events.indexOf('audit'));
 });
 test('mounted PUT '+path+' blocks busy/stale/missing and cannot audit',async()=>{for(const options of [{busy:{code:'55P03'}},{enrolled:true},{missing:true},{commitError:new Error('ambiguous commit')}]){const h=harness(options),r=await request(h,path,{moduleKey:'CORE',active:true,monthlyPrice:1});assert.ok(r.status>=400);assert.ok(!h.events.includes('audit'));if(!options.commitError)assert.equal(h.writes.length,0)}});
}
test('mounted commercial fallback reads tx after Store lock, refusal rolls back',async()=>{for(const companyActive of [true,false]){const h=harness({companyActive}),r=await request(h,'',{moduleKey:'PREVIEW',active:true,monthlyPrice:1});assert.equal(r.status,companyActive?200:400);assert.ok(h.events.indexOf('store-lock')<h.events.indexOf('company-fallback'));assert.equal(h.writes.length,companyActive?1:0)}});
test('mounted role, CORE, invalid dates and price checks cannot write',async()=>{for(const [path,body,opts,status] of [['',{active:true,monthlyPrice:1},{role:'OWNER'},403],['',{moduleKey:'CORE',active:false,monthlyPrice:1},{},400],['/check-packages/BASIC_CHECK',{active:true,monthlyPrice:-1},{},400],['/check-packages/BASIC_CHECK',{active:true,startsAt:'2026-10-02T00:00:00Z',endsAt:'2026-10-01T00:00:00Z'},{},400]]){const h=harness(),r=await request(h,path,body,opts);assert.equal(r.status,status);assert.equal(h.writes.length,0);assert.ok(!h.events.includes('audit'))}});

test('invalid scope descriptors/callback/database fail before transaction without getter execution',()=>{
 let getters=0,transactions=0;const db={$transaction:()=>{transactions++}};
 for(const scope of [null,{},[],{companyId:'',storeId:'s'},{companyId:'c',storeId:' '},{companyId:'c',storeId:'s\0bad'},Object.create({companyId:'c',storeId:'s'}),{get companyId(){getters++;return 'c'},storeId:'s'}])assert.throws(()=>withStoreModuleMutation(db,scope,()=>1));
 assert.throws(()=>withStoreModuleMutation(db,{companyId:'c',storeId:'s'},null),TypeError);
 assert.throws(()=>withStoreModuleMutation(null,{companyId:'c',storeId:'s'},()=>1),TypeError);
 assert.equal(getters,0);assert.equal(transactions,0);
});
test('mounted missing Store retains 404 before CORE or body validation',async()=>{for(const body of [{moduleKey:'CORE',active:false,monthlyPrice:1},{active:true,monthlyPrice:-1}]){const h=harness({missing:true}),r=await request(h,'',body);assert.equal(r.status,404);assert.ok(!h.events.includes('begin'))}});
