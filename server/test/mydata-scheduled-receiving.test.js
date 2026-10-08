import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBackgroundDrain} from '../src/server-shutdown.js';
async function fixture({allowed=true,held=false,targetBarrier}={}){
  let tick,interval,locks=0,owners=0,cleared=0;
  const backgroundDrain=createBackgroundDrain();
  const prisma={store:{findFirst:async()=>null},$executeRawUnsafe:async()=>{},$queryRaw:async strings=>{if(strings.join("?").includes('FROM "User"')){owners++;return [{id:'linked-owner'}]}if(targetBarrier)await targetBarrier;return [{companyId:'company',storeId:'store'}]},$transaction:async fn=>{locks++;return fn({$queryRaw:async()=>[{held}]})},user:{findFirst:async()=>{owners++;return {id:'owner'}}}};
  globalThis.__scheduled={backgroundDrain,clearInterval:()=>cleared++,prisma,Router:()=>({get(){},post(){}}),requireCompanyModule:()=>()=>{},companyModuleState:async()=>({licenseAllowed:allowed,activeModules:['DOCUMENTS']}),ensureStoreIntegrationSchema:async()=>{},setInterval:(fn,ms)=>{tick=fn;interval=ms;return {unref(){}}}};
  const source=await readFile(new URL('../src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
  const injected='const {backgroundDrain,clearInterval,prisma,Router,requireCompanyModule,companyModuleState,ensureStoreIntegrationSchema,setInterval}=globalThis.__scheduled;';
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
  assert.equal(f.owners,1);assert.equal(f.locks,2);
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
