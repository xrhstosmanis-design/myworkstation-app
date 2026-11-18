import {assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey} from '../src/services/store-lifecycle-generation.js';
import {lifecycleContext,withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {assertCustomerDemoOutboundAllowed,isCustomerDemoTenant} from '../src/customer-demo-runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBackgroundDrain} from '../src/server-shutdown.js';
async function fixture({allowed=true,held=false,targetBarrier,targets,lockBarrier}={}){
  let tick,interval,locks=0,owners=0,cleared=0;
  const backgroundDrain=createBackgroundDrain();
  const prisma={store:{findFirst:async()=>null},$executeRawUnsafe:async()=>{},$queryRaw:async strings=>{if(strings.join("?").includes('FROM "User"')){owners++;return [{id:'linked-owner'}]}if(targetBarrier)await targetBarrier;return targets||[{companyId:'company',storeId:'store'}]},$transaction:async fn=>{locks++;if(lockBarrier)await lockBarrier;return fn({$queryRaw:async()=>[{held}],$queryRawUnsafe:async sql=>{assert.match(sql,/current_schema/);return [{schema:'public',fence:null}]}})},user:{findFirst:async()=>{owners++;return {id:'owner'}}}};
  globalThis.__scheduled={epsilonOriginalRecoveryLinkPattern:()=> 'supported-link-pattern',assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey,lifecycleContext,withLifecycleContext,assertCustomerDemoOutboundAllowed,isCustomerDemoTenant,backgroundDrain,clearInterval:()=>cleared++,prisma,Router:()=>({get(){},post(){}}),requireCompanyModule:()=>()=>{},companyModuleState:async()=>({licenseAllowed:allowed,activeModules:['DOCUMENTS']}),ensureStoreIntegrationSchema:async()=>{},setInterval:(fn,ms)=>{tick=fn;interval=ms;return {unref(){}}}};
  const source=await readFile(new URL('../src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
  const injected='const {epsilonOriginalRecoveryLinkPattern,assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey,lifecycleContext,withLifecycleContext,assertCustomerDemoOutboundAllowed,isCustomerDemoTenant,backgroundDrain,clearInterval,prisma,Router,requireCompanyModule,companyModuleState,ensureStoreIntegrationSchema,setInterval}=globalThis.__scheduled;';
  const mod=await import('data:text/javascript;base64,'+Buffer.from(injected+source.replace(/^import .*;\r?\n/gm,'')+`\n//${Math.random()}`).toString('base64'));
  delete globalThis.__scheduled;
  return {mod,backgroundDrain,get cleared(){return cleared},get tick(){return tick},get interval(){return interval},get locks(){return locks},get owners(){return owners}};
}
test('scheduler runs every 15 minutes without browser and skips companies without active entitlement',async()=>{
  const f=await fixture({allowed:false});f.mod.startMyDataReceivingWorker();assert.equal(f.interval,900000);await f.tick();assert.equal(f.owners,0);assert.equal(f.locks,0);
});
test('manual and scheduled receiving coalesce; cross-process advisory lock refusal performs no receiving',async()=>{
  const f=await fixture();const req={user:{companyId:'company'},body:{storeId:'store'}};
  const a=f.mod.syncMyDataStore(req),b=f.mod.syncMyDataStore(req);assert.equal(a,b);
  await assert.rejects(a,/σε εξέλιξη/);assert.equal(f.locks,1);
  f.mod.startMyDataReceivingWorker();const warn=console.warn;console.warn=()=>{};try{await f.tick()}finally{console.warn=warn}
  assert.equal(f.owners,1);assert.equal(f.locks,3);
});

test('receiving service rejects foreign or missing store before credentials or network work',async()=>{
 const f=await fixture({held:true});await assert.rejects(f.mod.syncMyDataStore({user:{companyId:'company'},body:{storeId:'foreign'}}),error=>error.status===404);assert.equal(f.owners,0);
});


test('shutdown stops scheduled admission and drains an existing target query without starting another store',async()=>{
  let release;const barrier=new Promise(resolve=>release=resolve);
  const f=await fixture({targetBarrier:barrier});f.mod.startMyDataReceivingWorker();
  const running=f.tick();assert.equal(f.backgroundDrain.size,1);
  f.backgroundDrain.stop();assert.equal(f.cleared,1);
  release();await running;await f.backgroundDrain.drain();await f.tick();
  assert.equal(f.owners,0);assert.equal(f.locks,0);assert.equal(f.backgroundDrain.size,0);
});


test('scheduler skips demo targets even with injected active entitlements and integration',async()=>{
  for(const target of [{companyId:'customer-demo-opaque',storeId:'store'},{companyId:'company',storeId:'customer-demo-store-opaque'}]){
    const f=await fixture({allowed:true,targets:[target]});f.mod.startMyDataReceivingWorker();await f.tick();
    assert.equal(f.owners,0);assert.equal(f.locks,0);
    assert.throws(()=>f.mod.syncMyDataStore({user:{companyId:target.companyId},body:{storeId:target.storeId}}),error=>error.code==='CUSTOMER_DEMO_OUTBOUND_BLOCKED');
  }
});
test('delayed receiving rechecks scope after admission before any credentials or network',async()=>{
  let release;const barrier=new Promise(resolve=>release=resolve);
  const f=await fixture({held:true,lockBarrier:barrier});const req={user:{companyId:'company'},body:{storeId:'store'}};
  const pending=f.mod.syncMyDataStore(req);req.body.storeId='customer-demo-store-revoked';release();
  await assert.rejects(pending,error=>error.code==='CUSTOMER_DEMO_OUTBOUND_BLOCKED');assert.equal(f.owners,0);assert.equal(f.locks,1);
});

test('historical original recovery is explicitly store-scoped, production-only, bounded and attachment-only',async()=>{
  const {mod}=await fixture();
  const calls=[];
  const db={
    $queryRaw:async(strings,...values)=>{
      assert.match(strings.join("?"), /i\."attachmentId" IS NULL AND i\."status"='RECEIVED'/);
      assert.match(strings.join("?"), /"rawPayload"->>'originalRecoveryVersion' IS DISTINCT FROM/);
      assert.match(strings.join("?"), /m\."issueDate">=DATE '2026-11-01' AND m\."issueDate"<DATE '2026-12-01'/);
      assert.equal(values[4],'supported-link-pattern');
      assert.match(strings.join("?"), /ORDER BY m\."fetchedAt",m\."id" LIMIT 2/);
      assert.deepEqual(values.slice(0,3), ['company','store','AADE_MYDATA_PRODUCTION']);
      calls.push('query');
      return [{inboxId:'downloadable'},{inboxId:'unavailable'}];
    },
    $executeRaw:async(strings,...values)=>{
      assert.match(strings.join("?"), /i\."attachmentId" IS NULL/);
      assert.deepEqual(values.slice(1), ['company','store','unavailable']);
      calls.push('version-stamped');
    },
  };
  const acquire=async(...args)=>{
    assert.deepEqual(args.slice(0,3),[db,'company','store']);
    assert.deepEqual(args.slice(4),['actor',false]);
    calls.push(args[3]);
    if(args[3]==='unavailable')throw new Error('Provider did not return PDF');
    return {downloaded:true};
  };
  const options={db,companyId:'company',storeId:'store',userId:'actor',source:'AADE_MYDATA_PRODUCTION',acquire};
  assert.deepEqual(await mod.recoverExhaustedOriginals({...options,storeIds:''}),{downloaded:0,failed:0});
  assert.deepEqual(await mod.recoverExhaustedOriginals({...options,storeIds:'other'}),{downloaded:0,failed:0});
  assert.deepEqual(await mod.recoverExhaustedOriginals({...options,storeIds:'store',source:'AADE_MYDATA_SANDBOX'}),{downloaded:0,failed:0});
  assert.deepEqual(calls,[]);
  assert.deepEqual(await mod.recoverExhaustedOriginals({...options,storeIds:'other, store'}),{downloaded:1,failed:1});
  assert.deepEqual(calls,['query','downloadable','unavailable','version-stamped']);
});
