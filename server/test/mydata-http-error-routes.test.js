import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {myDataHttpError} from '../src/mydata-http-error.js';
import * as xml from '../src/mydata-xml.js';
import {assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey} from '../src/services/store-lifecycle-generation.js';
import {lifecycleContext,withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {assertCustomerDemoOutboundAllowed,isCustomerDemoTenant} from '../src/customer-demo-runtime.js';

async function fixture(){
  const routes=new Map(),writes=[],requests=[],logs=[];
  let status=403,body=JSON.stringify({message:'Access denied due to invalid subscription key. PRIVATE_KEY PRIVATE_USER'});
  const tx={$queryRawUnsafe:async()=>[{schema:'public',fence:null}],$queryRaw:async()=>[{held:true}],$executeRaw:async(...args)=>writes.push(args)};
  const prisma={
    store:{findFirst:async({where})=>where.id==='foreign'?null:{id:where.id,company:{taxId:'088888888'}}},
    $executeRawUnsafe:async()=>0,
    $transaction:async callback=>callback(tx),
    $queryRaw:async strings=>{
      const sql=strings.join('?');
      if(sql.includes('JOIN "Store"'))return [{companyId:'company',storeId:'store-a'}];
      if(sql.includes('FROM "User"'))return [{id:'owner'}];
      if(sql.includes('StoreIntegrationCredential'))return [{enabled:true,environment:'PRODUCTION',credentialsEnc:'fixture'}];
      if(sql.includes('MAX(')&&!sql.includes('COUNT('))return [{lastMark:'0'}];
      if(sql.includes('COUNT('))return [{documents:0,lastSyncAt:null}];
      if(sql.includes('originalPending'))return [];
      throw new Error('Unexpected query');
    }
  };
  const dependencies={...xml,crypto,myDataHttpError,prisma,assertLifecycleMutation,readLifecycleGeneration,lifecycleMyDataLockKey,lifecycleContext,withLifecycleContext,assertCustomerDemoOutboundAllowed,isCustomerDemoTenant,
    backgroundDrain:{stopping:false},Router:()=>({post(path,...handlers){routes.set(path,handlers.at(-1))},get(path,...handlers){routes.set(path,handlers.at(-1))}}),
    requireCompanyModule:()=>()=>{},companyModuleState:async()=>({licenseAllowed:true,activeModules:['DOCUMENTS']}),
    ensureStoreIntegrationSchema:async()=>{},decryptStoreIntegrationCredentials:()=>({accountId:'PRIVATE_USER',secret:'PRIVATE_KEY'}),
    acquireOriginal:async()=>{throw new Error('Original acquisition must not run on failure')},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:status===200,status,text:async()=>body}},
    console:{warn:(...args)=>logs.push(args)}
  };
  const source=await readFile(new URL('../src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
  globalThis.__mydataHttpFixture=dependencies;
  let mod;
  try{mod=await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(dependencies).join(',')+'}=globalThis.__mydataHttpFixture;\n'+source.replace(/^import .*;\r?\n/gm,'')+'\n//'+Math.random()).toString('base64'))}finally{delete globalThis.__mydataHttpFixture}
  const request=storeId=>({body:{storeId},query:{storeId},user:{companyId:'company',id:'owner',role:'OWNER'}});
  const call=async(path,req)=>{let result,error;await routes.get(path)(req,{json:value=>result=value,status(){return this}},value=>error=value);return {result,error}};
  return {mod,requests,logs,writes,request,call,setResponse(s,b){status=s;body=b}};
}

test('actual manual receiving and store status share safe error; foreign store is rejected before fetch',async()=>{
  const f=await fixture();
  let result=await f.call('/documents/mydata/sync',f.request('store-a'));
  assert.equal(result.error.code,'MYDATA_HTTP_ERROR');assert.equal(result.error.status,502);
  assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);
  assert.equal(f.requests[0].options.headers['aade-user-id'],'PRIVATE_USER');
  assert.equal(f.requests[0].options.headers['Ocp-Apim-Subscription-Key'],'PRIVATE_KEY');
  assert.equal(f.logs.length,1);assert.equal(f.logs[0][1].reference,result.error.diagnostic.reference);
  assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE_KEY|PRIVATE_USER|credentialsEnc|Access denied/);
  const own=await f.call('/documents/mydata/status',f.request('store-a'));
  const other=await f.call('/documents/mydata/status',f.request('store-b'));
  assert.equal(own.result.lastSyncError,result.error.message);assert.equal(other.result.lastSyncError,null);
  result=await f.call('/documents/mydata/sync',f.request('foreign'));
  assert.equal(result.error.status,404);assert.equal(result.error.message,'Δεν βρέθηκε το κατάστημα.');assert.equal(f.requests.length,1);
  f.setResponse(200,'<RequestedDoc></RequestedDoc>');
  const recovered=await f.call('/documents/mydata/sync',f.request('store-a'));
  assert.ifError(recovered.error);assert.equal(recovered.result.created,0);assert.equal(recovered.result.stockUpdated,false);
  assert.equal((await f.call('/documents/mydata/status',f.request('store-a'))).result.lastSyncError,null);
});
test('actual scheduled receiver emits the same diagnostic and exposes it only for its store',async()=>{
  const f=await fixture();f.setResponse(403,'<html>Forbidden PRIVATE_KEY</html>');
  await f.mod.runMyDataReceivingSweep();
  assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);
  assert.equal(f.logs[0][1].reason,'ACCESS_DENIED');
  const own=await f.call('/documents/mydata/status',f.request('store-a'));
  assert.ok(own.result.lastSyncError.includes(f.logs[0][1].reference));
  assert.match(own.result.lastSyncError,/δεν επιβεβαιώνει/);
  assert.equal((await f.call('/documents/mydata/status',f.request('store-b'))).result.lastSyncError,null);
  assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE_KEY|PRIVATE_USER|<html>/);
});
