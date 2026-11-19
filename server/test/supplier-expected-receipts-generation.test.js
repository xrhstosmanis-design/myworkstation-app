import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifecycleFetch,lifecycleHeader} from '../../client/src/utils/store-lifecycle-fetch.js';
import {expectedReceiptIntentContext,createExpectedReceiptIntent,saveExpectedReceiptIntent,readExpectedReceiptIntent} from '../../client/src/components/commerce/expected-receipt-intents.js';
import {storeLifecycleRequestContext,LIFECYCLE_GENERATIONS_HEADER} from '../src/middleware/store-lifecycle-context.js';
import {lifecycleContext} from '../src/services/store-lifecycle-context.js';
import {assertLifecycleMutation} from '../src/services/store-lifecycle-generation.js';

test('real fetch wrapper and middleware retain generation one journal after a fresh generation two read',async()=>{
  const origin='https://isolated.invalid',scope={companyId:'company',storeId:'s'};
  let generation='1',writes=0;
  const received=[];
  const db={$queryRawUnsafe:async sql=>{
    if(sql.includes('current_schema() AS schema'))return [{schema:'isolated',fence:'StoreLifecycleFence'}];
    if(sql.includes('FROM "isolated"."StoreLifecycleFence"'))return [{companyId:'company',generation,maintenance:false,retired:false}];
    if(sql.includes('set_config'))return [];
    throw Error('Unexpected fence query '+sql);
  }};
  const send=async(input,options)=>{
    const url=new URL(input,origin),headers=new Headers(options?.headers);
    if(url.pathname.startsWith('/api/lifecycle/'))return Response.json({storeId:'s',generation});
    const req={headers:{[LIFECYCLE_GENERATIONS_HEADER]:headers.get(lifecycleHeader)}};
    try{return await storeLifecycleRequestContext(req,{status(){return this},json(value){return Response.json(value,{status:400})}},async()=>{
      if(options?.method==='POST'){
        received.push({header:headers.get(lifecycleHeader),body:options.body});
        await assertLifecycleMutation(db,scope,lifecycleContext().s??'0');
        writes++;return Response.json({id:'receipt'});
      }
      return Response.json({actorId:'owner',companyId:'company',storeId:'s',lifecycleGeneration:lifecycleContext().s??'0'});
    })}catch(error){return Response.json({error:error.message,code:error.code},{status:error.status||500})}
  };
  const first=createLifecycleFetch({fetch:send,origin});
  const data=await (await first.request(origin+'/api/commerce/expected-receipts?storeId=s',{headers:{Authorization:'fixture'}})).json();
  assert.equal(data.lifecycleGeneration,'1');
  const context=expectedReceiptIntentContext(data,'s');
  const pending=createExpectedReceiptIntent(context,'/api/commerce/expected-receipts',{productId:'p',supplierId:'supplier',invoiceQuantity:'2',invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:'6'});
  const saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
  saveExpectedReceiptIntent(pending,storage);
  const fresh=createExpectedReceiptIntent(context,pending.path,JSON.parse(pending.serializedBody));
  const success=await first.request(origin+fresh.path,{method:'POST',headers:{Authorization:'fixture','Content-Type':'application/json',...fresh.headers},body:fresh.serializedBody});
  assert.equal(success.status,200);assert.equal(writes,1);
  generation='2';
  const second=createLifecycleFetch({fetch:send,origin});
  const current=await (await second.request(origin+'/api/commerce/expected-receipts?storeId=s',{headers:{Authorization:'fixture'}})).json();
  assert.equal(current.lifecycleGeneration,'2');
  const restored=readExpectedReceiptIntent(expectedReceiptIntentContext(current,'s'),storage);
  assert.deepEqual(restored,pending);assert.equal(JSON.parse(restored.serializedBody).intentGeneration,'1');
  const stale=await second.request(origin+restored.path,{method:'POST',headers:{Authorization:'fixture','Content-Type':'application/json',...restored.headers},body:restored.serializedBody});
  assert.equal(stale.status,409);assert.equal((await stale.json()).code,'STORE_LIFECYCLE_STALE_GENERATION');
  assert.deepEqual(JSON.parse(received.at(-1).header),{s:'1'});assert.equal(received.at(-1).body,pending.serializedBody);assert.equal(writes,1);
  assert.deepEqual(readExpectedReceiptIntent(expectedReceiptIntentContext(current,'s'),storage),pending);
});
