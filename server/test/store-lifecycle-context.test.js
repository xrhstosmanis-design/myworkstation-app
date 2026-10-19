import test from 'node:test';
import assert from 'node:assert/strict';
import {withLifecycleContext,lifecycleContext,normalizeLifecycleContext,withLifecyclePrisma} from '../src/services/store-lifecycle-context.js';

function fixture(){
 const events=[];let setting={};
 const lazy=fn=>({then(resolve,reject){return Promise.resolve().then(fn).then(resolve,reject)}});
 const client={
  sale:{findMany:()=>lazy(()=>[]),create:args=>lazy(()=>{events.push({kind:'write',setting:{...setting},args});return args.data}),findUnique:()=>Object.assign(lazy(()=>({id:'sale'})),{lines:()=>lazy(()=>[{id:'line'}])})},
  $executeRawUnsafe:sql=>lazy(()=>{assert.match(sql,/^SET LOCAL "mws\.lifecycle_generations" = E'/);const encoded=sql.slice(sql.indexOf("E'")+2,-1).replace(/\\(['\\])/g,'$1');setting=JSON.parse(encoded);events.push({kind:'set',setting:{...setting}});return 0}),
  $queryRawUnsafe:sql=>lazy(()=>{events.push({kind:'raw',setting:{...setting}});return [{ok:true}]}),
  async $transaction(work,options){events.push({kind:'begin',options});try{return typeof work==='function'?await work(client):await work.reduce(async(result,query)=>[...await result,await query],Promise.resolve([]))}finally{setting={};events.push({kind:'end'})}},
  $disconnect:()=>Promise.resolve()
 };
 return {db:withLifecyclePrisma(client),events};
}

test('request epochs are validated, immutable and isolated across concurrent async work',async()=>{
 const input={target:'1'};await withLifecycleContext(input,async()=>{input.target='9';assert.equal(lifecycleContext().target,'1');assert.ok(Object.isFrozen(lifecycleContext()));await Promise.all([withLifecycleContext({sibling:'2'},async()=>{await Promise.resolve();assert.equal(lifecycleContext().sibling,'2')}),Promise.resolve().then(()=>assert.equal(lifecycleContext().target,'1'))])});assert.deepEqual(lifecycleContext(),{});
 for(const input of [[],{target:1},{target:'-1'},{target:'9223372036854775808'},{'':'1'},{target:null},{['bad\0store']:'1'}])assert.throws(()=>normalizeLifecycleContext(input));
});
test('root mutations carry their creation epoch transaction-locally and preserve results',async()=>{
 const f=fixture();const old=f.db.sale.create({data:{id:'old'}});const fresh=withLifecycleContext({target:'1'},()=>f.db.sale.create({data:{id:'fresh'}}));
 assert.deepEqual(await withLifecycleContext({target:'9'},()=>fresh),{id:'fresh'});assert.equal(f.events.find(e=>e.kind==='write').setting.target,'1');
 await withLifecycleContext({target:'9'},()=>old);assert.deepEqual(f.events.filter(e=>e.kind==='write').at(-1).setting,{});
 assert.equal(f.events.filter(e=>e.kind==='begin').length,1);
});
test('batch transactions retain each original epoch, options, ordering and untagged legacy zero',async()=>{
 const f=fixture(),old=f.db.sale.create({data:{id:'old'}}),one=withLifecycleContext({target:'1'},()=>f.db.sale.create({data:{id:'one'}})),two=withLifecycleContext({target:'2'},()=>f.db.sale.create({data:{id:'two'}}));
 const result=await withLifecycleContext({target:'9'},()=>f.db.$transaction([one,old,two],{timeout:12345,isolationLevel:'Serializable'}));assert.deepEqual(result,[{id:'one'},{id:'old'},{id:'two'}]);assert.deepEqual(f.events.filter(e=>e.kind==='write').map(e=>e.setting),[{target:'1'},{},{target:'2'}]);assert.equal(f.events.find(e=>e.kind==='begin').options.timeout,12345);
});
test('callback transactions tag once, preserve options, roll back failures and do not leak context',async()=>{
 const f=fixture();await assert.rejects(withLifecycleContext({target:'3'},()=>f.db.$transaction(async tx=>{await tx.sale.create({data:{id:'fail'}});throw Error('rollback')},{timeout:4567})),/rollback/);assert.equal(f.events.filter(e=>e.kind==='set').length,1);assert.equal(f.events.find(e=>e.kind==='write').setting.target,'3');await f.db.sale.create({data:{id:'outside'}});assert.deepEqual(f.events.filter(e=>e.kind==='write').at(-1).setting,{});
});
test('fluent relations and raw tagged queries remain awaitable, without duplicate execution',async()=>{
 const f=fixture();assert.deepEqual(await withLifecycleContext({target:'1'},()=>f.db.sale.findUnique({where:{id:'sale'}}).lines()),[{id:'line'}]);const raw=withLifecycleContext({target:'1'},()=>f.db.$queryRawUnsafe('SELECT 1'));assert.deepEqual(await raw,[{ok:true}]);await raw;assert.equal(f.events.filter(e=>e.kind==='raw').length,1);assert.equal(f.events.find(e=>e.kind==='raw').setting.target,'1');
});

const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native public Prisma raw, callback and mixed-epoch batches bind the original context and clear pooled connections after rollback',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),raw=new PrismaClient(),db=withLifecyclePrisma(raw);
 const current=client=>client.$queryRawUnsafe("SELECT COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),''),'{}')::jsonb AS context");
 try{
  const old=current(db),fresh=withLifecycleContext({target:'1'},()=>current(db));
  assert.deepEqual((await withLifecycleContext({target:'9'},()=>fresh))[0].context,{target:'1'});
  assert.deepEqual((await withLifecycleContext({target:'9'},()=>old))[0].context,{});
  const first=withLifecycleContext({target:'2'},()=>current(db)),legacy=current(db),last=withLifecycleContext({sibling:'4'},()=>current(db));
  assert.deepEqual((await db.$transaction([first,legacy,last],{isolationLevel:'Serializable'})).map(rows=>rows[0].context),[{target:'2'},{},{sibling:'4'}]);
  await assert.rejects(withLifecycleContext({target:'3'},()=>db.$transaction(async tx=>{assert.deepEqual((await current(tx))[0].context,{target:'3'});throw Error('rollback-context')})),/rollback-context/);
  const readonly=await withLifecycleContext({target:'5'},()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return current(tx)},{isolationLevel:'RepeatableRead'}));assert.deepEqual(readonly[0].context,{target:'5'});
  const unusual="store'\\\n;--";const escaped=await withLifecycleContext({[unusual]:'7'},()=>current(db));assert.deepEqual(escaped[0].context,{[unusual]:'7'});
  for(let i=0;i<8;i++)assert.deepEqual((await current(raw))[0].context,{});
 }finally{await raw.$disconnect()}
});

test('HTTP epoch metadata validates before handlers and never advances a missing legacy context',async()=>{
 const {storeLifecycleRequestContext}=await import('../src/middleware/store-lifecycle-context.js');
 const seen=[],response={status(value){this.code=value;return this},json(value){this.body=value;return this}};
 storeLifecycleRequestContext({headers:{'x-mws-store-generations':'{"target":"1"}'}},response,()=>seen.push(lifecycleContext().target));
 storeLifecycleRequestContext({headers:{}},response,()=>seen.push(lifecycleContext().target));
 assert.deepEqual(seen,['1',undefined]);
 for(const value of ['not-json','[]','{"target":1}','{"target":null}','x'.repeat(16385),['{}']]){storeLifecycleRequestContext({headers:{'x-mws-store-generations':value}},response,()=>assert.fail('invalid header reached handler'));assert.equal(response.code,400)}
});
