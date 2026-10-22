import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {withStoreModuleMutation} from '../src/services/store-module-mutation.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';

function isolated(value=process.env.DATABASE_URL,mode=process.env.NODE_ENV){
 try{
  const u=new URL(value),database=decodeURIComponent(u.pathname);
  if(mode!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(database))return false;
  const seen=new Set();
  for(const[key,entry]of u.searchParams){
   if(seen.has(key))return false;seen.add(key);
   if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(entry))return false;continue}
   const allowed={connection_limit:[1,1000],pool_timeout:[0,600],statement_cache_size:[0,100000]},bounds=Object.hasOwn(allowed,key)?allowed[key]:null;
   if(!bounds||!/^\d{1,6}$/.test(entry)||Number(entry)<bounds[0]||Number(entry)>bounds[1])return false;
  }
  return true;
 }catch{return false}
}
const selected={companyId:'module-company',storeId:'selected'};
const ORIGINAL_GENERATION='9007199254740993';
const wire=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
async function bounded(promise,label,ms=6000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Module fixture barrier timed out: ${label}`)),ms)})])}finally{clearTimeout(timer)}}
function kind(sql){
 if(sql.includes('"StoreLifecycleFence"')&&/FOR\s+SHARE\s+NOWAIT/i.test(sql))return'lifecycle-lock';
 if(/FOR\s+NO\s+KEY\s+UPDATE\s+NOWAIT/i.test(sql)&&sql.includes('"Store"'))return'store-lock';
 if(/^\s*INSERT INTO\s+"StorePaidModule"/i.test(sql))return'module-write';
 return'other';
}
// Observe actual Prisma calls and pause at explicit transaction/lock barriers.
// No query result, lock outcome or lifecycle decision is emulated.
function observed(client,{afterStoreLock=null,beforeTransaction=null,transactionContext=null}={}){
 const trace={transactions:0,events:[],stores:[]};
 return{trace,db:{$transaction:async fn=>{
  trace.transactions++;if(beforeTransaction)await beforeTransaction();
  return client.$transaction(async tx=>{
   const wrapped=new Proxy(tx,{get(target,key){
    if(['$queryRaw','$queryRawUnsafe','$executeRaw','$executeRawUnsafe'].includes(key))return async(...args)=>{
     const sql=Array.isArray(args[0])?args[0].join('?'):String(args[0]?.sql||args[0]),type=kind(sql);
     assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|SCHEMA|INDEX)/i,'the helper must not bootstrap schema');
     trace.events.push(type);const result=await target[key](...args);
     if(type==='store-lock'){trace.stores.push(wire(result));if(afterStoreLock)await afterStoreLock({tx:target,rows:result,trace})}return result;
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   }});
   return transactionContext===null?fn(wrapped):withLifecycleContext(transactionContext,()=>fn(wrapped));
  },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000});
 }}};
}
function ordered(trace,{write=true,store=true}={}){
 const lifecycle=trace.events.indexOf('lifecycle-lock'),locked=trace.events.indexOf('store-lock'),changed=trace.events.indexOf('module-write');
 assert.ok(lifecycle>=0,trace.events.join(','));
 if(store)assert.ok(locked>lifecycle,trace.events.join(','));else assert.equal(locked,-1,trace.events.join(','));
 if(write)assert.ok(changed>locked,trace.events.join(','));else assert.equal(changed,-1,trace.events.join(','));
 assert.equal(trace.transactions,1,'busy/stale mutations must not retry');
}
async function upsert({tx,store},active=true,moduleKey='INVENTORY'){
 const rows=await tx.$queryRaw`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","notes")
  VALUES (${store.id+':'+moduleKey},${store.companyId},${store.id},${moduleKey},${active},12.34,'synthetic module mutation')
  ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=EXCLUDED."active","monthlyPrice"=EXCLUDED."monthlyPrice","notes"=EXCLUDED."notes"
  RETURNING "id","companyId","storeId","moduleKey","active","monthlyPrice"::text AS price,"notes"`;
 return{store:wire(store),module:rows[0]};
}
const mutate=(db,scope,context,active=true,moduleKey='INVENTORY')=>withLifecycleContext(context,()=>withStoreModuleMutation(db,scope,args=>upsert(args,active,moduleKey)));

async function runStoreModuleMutationRegression(a,b,{subtest=async(_name,fn)=>fn()}={}){
 await a.$executeRawUnsafe('CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text NOT NULL,"name" text NOT NULL,"active" boolean NOT NULL)');
 // The FK deliberately exercises native parent KEY SHARE compatibility.
 // It does not claim that production has this exact fixture constraint.
 await a.$executeRawUnsafe('CREATE TABLE "StorePaidModule"("id" text PRIMARY KEY,"companyId" text NOT NULL,"storeId" text NOT NULL REFERENCES "Store"("id"),"moduleKey" text NOT NULL,"active" boolean NOT NULL,"monthlyPrice" numeric(14,2),"notes" text,UNIQUE("storeId","moduleKey"))');
 await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
 await a.$executeRawUnsafe('CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"variance" numeric(14,2))');
 await a.$executeRaw`INSERT INTO "Store" VALUES('selected','module-company','Selected synthetic store',true),('control','control-company','Independent control',true),('inactive','module-company','Inactive setup store',false),('maintenance','module-company','Maintenance',true),('retired','module-company','Retired',true),('foreign-fence','module-company','Foreign fence',true),('legacy','module-company','Legacy',true),('other-store','other-company','Other company',true)`;
 await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('selected','module-company',${BigInt(ORIGINAL_GENERATION)},false,false),('control','control-company',7,false,false),('inactive','module-company',1,false,false),('maintenance','module-company',1,true,false),('retired','module-company',1,false,true),('foreign-fence','other-company',1,false,false)`;
 await a.$executeRaw`INSERT INTO "StorePaidModule" VALUES('control:INVENTORY','control-company','control','INVENTORY',true,98.76,'unchanged control')`;
 await a.$executeRaw`INSERT INTO "CashShiftSession" VALUES('selected-source','module-company','selected',-12.34),('control-source','control-company','control',123.45)`;
 const snapshot=async()=>({
  Store:wire(await b.$queryRaw`SELECT * FROM "Store" ORDER BY "id"`),
  StorePaidModule:wire(await b.$queryRaw`SELECT "id","companyId","storeId","moduleKey","active","monthlyPrice"::text AS price,"notes" FROM "StorePaidModule" ORDER BY "id"`),
  StoreLifecycleFence:wire(await b.$queryRaw`SELECT "storeId","companyId","generation"::text AS generation,"maintenance","retired" FROM "StoreLifecycleFence" ORDER BY "storeId"`),
  CashShiftSession:wire(await b.$queryRaw`SELECT "id","companyId","storeId","variance"::text AS variance FROM "CashShiftSession" ORDER BY "id"`)
 });
 const onlyModuleChanged=(before,after,storeId,moduleKey='INVENTORY')=>{
  const omit=value=>({...value,StorePaidModule:value.StorePaidModule.filter(row=>row.storeId!==storeId||row.moduleKey!==moduleKey)});
  assert.deepEqual(omit(after),omit(before));
 };
 let generation=ORIGINAL_GENERATION;
 const context=()=>({selected:generation});
 const hold=(mode,work)=>a.$transaction(async tx=>{
  await assertLifecycleMutation(tx,selected,generation,{lock:true});
  await tx.$queryRawUnsafe(`SELECT "id" FROM "Store" WHERE "id"=$1 AND "companyId"=$2 ${mode}`,'selected','module-company');
  return work(tx);
 },{maxWait:5000,timeout:15000});

 await subtest('SHARE refuses first absent override and updates; compatible FK KEY SHARE permits both module families',async()=>{
  let before=await snapshot();assert.equal(before.StorePaidModule.some(row=>row.storeId==='selected'),false);
  for(const key of ['INVENTORY','BASIC_CHECK']){
   const denied=observed(b);
   await hold('FOR SHARE',async()=>{await assert.rejects(mutate(denied.db,selected,context(),true,key),error=>error.status===409&&error.code==='STORE_MODULE_BUSY');ordered(denied.trace,{write:false});assert.deepEqual(await snapshot(),before)});
   const allowed=observed(b);let result;
   await hold('FOR KEY SHARE',async()=>{result=await mutate(allowed.db,selected,context(),true,key)});
   ordered(allowed.trace);const after=await snapshot();onlyModuleChanged(before,after,'selected',key);
   assert.equal(result.module.moduleKey,key);assert.equal(result.module.active,true);assert.equal(result.module.price,'12.34');assert.equal(result.store.id,'selected');assert.equal(after.StorePaidModule.length,before.StorePaidModule.length+1);before=after;
   const update=observed(b);
   await hold('FOR SHARE',async()=>{await assert.rejects(mutate(update.db,selected,context(),false,key),error=>error.status===409&&error.code==='STORE_MODULE_BUSY');ordered(update.trace,{write:false});assert.deepEqual(await snapshot(),before)});
  }
 });

 await subtest('writer lifecycle then Store NO KEY UPDATE blocks a reverse SHARE reader until its one commit',async()=>{
  const before=await snapshot(),locked=deferred(),release=deferred();let task;
  const watched=observed(b,{afterStoreLock:async({tx,rows})=>{
   assert.equal(rows[0].id,'selected');assert.equal(rows[0].companyId,'module-company');
   const bound=(await tx.$queryRawUnsafe("SELECT current_setting('mws.lifecycle_generations',true) AS value"))[0].value;
   assert.deepEqual(JSON.parse(bound),context());locked.resolve();await bounded(release.promise,'release module writer');
  }});
  try{
   task=mutate(watched.db,selected,context(),false);task.catch(()=>{});await bounded(locked.promise,'writer owns Store NO KEY UPDATE');
   let checkedLifecycle=false;
   await assert.rejects(a.$transaction(async tx=>{await assertLifecycleMutation(tx,selected,generation,{lock:true});checkedLifecycle=true;await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='selected' AND "companyId"='module-company' FOR SHARE NOWAIT`},{maxWait:5000,timeout:15000}),error=>error?.meta?.code==='55P03'||error?.code==='55P03');
   assert.equal(checkedLifecycle,true);release.resolve();const result=await task;ordered(watched.trace);assert.equal(result.module.active,false);
   const after=await snapshot();onlyModuleChanged(before,after,'selected');assert.equal(after.StorePaidModule.find(row=>row.storeId==='selected'&&row.moduleKey==='INVENTORY').active,false);
  }finally{release.resolve();if(task)await Promise.allSettled([task])}
 });

 await subtest('original missing/stale full-int64 epochs, maintenance, retired and foreign lifecycle refuse before callback',async()=>{
  const before=await snapshot();
  for(const[scope,epoch,code]of [
   [selected,{},'STORE_LIFECYCLE_STALE_GENERATION'],[selected,{selected:(BigInt(generation)-1n).toString()},'STORE_LIFECYCLE_STALE_GENERATION'],
   [{companyId:'module-company',storeId:'maintenance'},{maintenance:'1'},'STORE_LIFECYCLE_MAINTENANCE'],
   [{companyId:'module-company',storeId:'retired'},{retired:'1'},'STORE_LIFECYCLE_MAINTENANCE'],
   [{companyId:'module-company',storeId:'foreign-fence'},{'foreign-fence':'1'},'STORE_LIFECYCLE_SCOPE_INVALID'],
   [{companyId:'other-company',storeId:'selected'},context(),'STORE_LIFECYCLE_SCOPE_INVALID']
  ]){
   const watched=observed(b);let called=false;
   await assert.rejects(withLifecycleContext(epoch,()=>withStoreModuleMutation(watched.db,scope,()=>{called=true;throw new Error('must not enter callback')})),error=>error.status===409&&error.code===code);
   assert.equal(called,false);ordered(watched.trace,{write:false,store:false});assert.deepEqual(await snapshot(),before);
  }
  await a.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "storeId" FROM "StoreLifecycleFence" WHERE "storeId"='selected' FOR UPDATE`;
   const watched=observed(b);await assert.rejects(mutate(watched.db,selected,context()),error=>error.status===409&&error.code==='STORE_LIFECYCLE_MAINTENANCE');ordered(watched.trace,{write:false,store:false});
  },{maxWait:5000,timeout:15000});assert.deepEqual(await snapshot(),before);
 });

 await subtest('missing or foreign Store is not a module target, while inactive setup and legacy zero remain supported',async()=>{
  let before=await snapshot();
  for(const scope of [{companyId:'module-company',storeId:'missing'},{companyId:'module-company',storeId:'other-store'}]){
   const watched=observed(b);let called=false;
   await assert.rejects(withLifecycleContext({},()=>withStoreModuleMutation(watched.db,scope,()=>{called=true})),error=>error.status===404&&error.code==='STORE_MODULE_STORE_NOT_FOUND');
   assert.equal(called,false);ordered(watched.trace,{write:false});assert.deepEqual(await snapshot(),before);
  }
  for(const[scope,epoch]of [[{companyId:'module-company',storeId:'inactive'},{inactive:'1'}],[{companyId:'module-company',storeId:'legacy'},{}]]){
   const watched=observed(b),result=await mutate(watched.db,scope,epoch);ordered(watched.trace);const after=await snapshot();onlyModuleChanged(before,after,scope.storeId);assert.equal(result.store.id,scope.storeId);if(scope.storeId==='inactive')assert.equal(after.Store.find(row=>row.id==='inactive').active,false);if(scope.storeId==='legacy')assert.equal(after.StoreLifecycleFence.some(row=>row.storeId==='legacy'),false);before=after;
  }
 });

 await subtest('epoch is captured before awaiting transaction creation and cannot be upgraded by a newer callback context',async()=>{
  const before=await snapshot(),entered=deferred(),release=deferred(),next=(BigInt(generation)+1n).toString();let task;
  const watched=observed(b,{beforeTransaction:async()=>{entered.resolve();await bounded(release.promise,'start epoch fixture transaction')},transactionContext:{selected:next}});
  try{
   task=mutate(watched.db,selected,context());task.catch(()=>{});await bounded(entered.promise,'helper captured original call');
   await a.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=${BigInt(next)} WHERE "storeId"='selected' AND "companyId"='module-company'`;
   release.resolve();await assert.rejects(task,error=>error.status===409&&error.code==='STORE_LIFECYCLE_STALE_GENERATION');ordered(watched.trace,{write:false,store:false});
   const expected=wire(before);expected.StoreLifecycleFence.find(row=>row.storeId==='selected').generation=next;assert.deepEqual(await snapshot(),expected);generation=next;
   const valid=observed(b);const result=await mutate(valid.db,selected,context());ordered(valid.trace);assert.equal(result.module.active,true);onlyModuleChanged(expected,await snapshot(),'selected');
  }finally{release.resolve();if(task)await Promise.allSettled([task])}
 });

 await subtest('callback failure rolls back the actual module UPSERT and preserves financial/control rows',async()=>{
  const before=await snapshot(),watched=observed(b),failure=new Error('synthetic callback failure');
  await assert.rejects(withLifecycleContext(context(),()=>withStoreModuleMutation(watched.db,selected,async args=>{await upsert(args,false);throw failure})),error=>error===failure);
  ordered(watched.trace);assert.deepEqual(await snapshot(),before);
 });
}

test('native module fixture refuses production targets and must execute in full CI',()=>{
 for(const[value,mode]of [['postgresql://u:p@production.example/module_test','test'],['postgresql://u:p@localhost/live','test'],['postgresql://u:p@localhost/latest','test'],['postgresql://u:p@localhost/module_test','production'],['invalid','test'],['https://localhost/module_test','test']])assert.equal(isolated(value,mode),false);
 const base='postgresql://u:p@localhost/module_test';
 for(const query of ['host=production.example','hostaddr=192.0.2.1','options=-csearch_path%3Dpublic','service=production','dbname=production','sslmode=disable','sslcert=private.pem','unknown=1','constructor=1','toString=1','__proto__=1','schema=public&schema=other','schema=public%3BDROP','connection_limit=1&connection_limit=2','connection_limit=0','connection_limit=1001','pool_timeout=-1','pool_timeout=601','statement_cache_size=100001','statement_cache_size=NaN'])assert.equal(isolated(base+'?'+query,'test'),false,query);
 assert.equal(isolated('postgresql://u:p@127.0.0.1/module_test','test'),true);
 assert.equal(isolated('postgresql://u:p@localhost/myworkstation_test?schema=public','test'),true);
 assert.equal(isolated(base+'?schema=module_fixture&connection_limit=2&pool_timeout=0&statement_cache_size=0','test'),true);
 if(process.env.CI)assert.ok(isolated(),'full CI must execute the isolated native module-writer test');
});

test('native StorePaidModule mutation: lifecycle-first locks fence absent overrides, permit key-share, preserve original epochs and controls',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='store_module_mutation_'+randomBytes(12).toString('hex');
 assert.match(schema,/^store_module_mutation_[a-f0-9]{24}$/);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await runStoreModuleMutationRegression(a,b,{subtest:(name,fn)=>t.test(name,fn)})}
 finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
