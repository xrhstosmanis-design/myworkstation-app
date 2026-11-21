import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierExpenseRecoveryApi} from '../../client/src/lib/supplier-expense-recovery-api.mjs';
const item={id:'review',transactionId:'payment',paymentMethod:'CASH_SHIFT',amount:12.4};
const context={storeId:'store',transactionId:'payment',amount:12.4,expectedVersion:'a'.repeat(64),suppliers:[{id:'supplier'}]};
const path='/api/transactions/other-expenses/review/supplier-advance';
const payload={supplierId:'supplier',expectedVersion:context.expectedVersion,expectedAmount:12.4,reason:'original supplier payment',acknowledged:true,idempotencyKey:'original-retry-key'};
function fixture(){
  const calls=[];let current=true;
  const transport=async(url,options)=>{calls.push({url,options});if(options?.method==='POST')return {ok:true,transactionId:'payment',amount:12.4};if(url===path)return structuredClone(context);return {items:[structuredClone(item)],companies:[{id:'not-for-store-selector'}],stores:[{id:'other'}]};};
  return {calls,api:supplierExpenseRecoveryApi({api:transport,storeId:'store',isCurrent:()=>current}),expire:()=>{current=false}};
}
test('owner list is selected-store only and removes central company/store selectors',async()=>{
 const f=fixture(),r=await f.api('/api/transactions/other-expenses/review');assert.equal(f.calls[0].url,'/api/transactions/other-expenses/review?storeId=store');assert.deepEqual(r.companies,[]);assert.deepEqual(r.stores,[]);
 await assert.rejects(f.api('/api/transactions/other-expenses/review?storeId=foreign'),/επιλεγμένο/);
 await assert.rejects(f.api('/api/transactions/other-expenses/review?companyId=foreign'),/επιλεγμένο/);assert.equal(f.calls.length,1);
});
test('mutation requires the exact list row and fetched scoped context',async()=>{
 const f=fixture(),options={method:'POST',body:JSON.stringify(payload)};
 await assert.rejects(f.api(path,options),/τρέχουσα λίστα/);await f.api('/api/transactions/other-expenses/review');
 await assert.rejects(f.api(path,options),/ίδιο έξοδο/);await f.api(path);
 for(const change of [{supplierId:'foreign'},{expectedVersion:'b'.repeat(64)},{expectedAmount:13},{acknowledged:false}])await assert.rejects(f.api(path,{method:'POST',body:JSON.stringify({...payload,...change})}),/ίδιο έξοδο/);
 assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,0);
 const result=await f.api(path,options);assert.equal(result.transactionId,'payment');assert.equal(f.calls.at(-1).options,options);
});
test('a context from another store never authorizes a POST',async()=>{
 let posts=0;const api=supplierExpenseRecoveryApi({storeId:'store',api:async(url,options)=>{if(options){posts++;return {}};return url===path?{...context,storeId:'foreign'}:{items:[item]};}});
 await api('/api/transactions/other-expenses/review');await assert.rejects(api(path),/επιλεγμένο κατάστημα/);await assert.rejects(api(path,{method:'POST',body:JSON.stringify(payload)}),/ίδιο έξοδο/);assert.equal(posts,0);
});
test('store switch blocks future requests and late original responses',async()=>{
 const f=fixture();await f.api('/api/transactions/other-expenses/review');await f.api(path);f.expire();await assert.rejects(f.api(path,{method:'POST',body:JSON.stringify(payload)}),/άλλαξε/);assert.equal(f.calls.length,2);
 let resolve,current=true;const api=supplierExpenseRecoveryApi({storeId:'store',isCurrent:()=>current,api:()=>new Promise(r=>resolve=r)});
 const pending=api('/api/transactions/other-expenses/review');current=false;resolve({items:[item]});await assert.rejects(pending,/άλλαξε/);
});
test('uncertain response retains the same request key for a safe explicit retry',async()=>{
 const posts=[];let lost=true;const api=supplierExpenseRecoveryApi({storeId:'store',api:async(url,options)=>{if(options){posts.push(JSON.parse(options.body));if(lost){lost=false;throw Error('response lost after commit');}return {ok:true,transactionId:'payment',amount:12.4};}return url===path?context:{items:[item]};}});
 await api('/api/transactions/other-expenses/review');await api(path);const options={method:'POST',body:JSON.stringify(payload)};
 await assert.rejects(api(path,options),/response lost/);await api(path,options);assert.deepEqual(posts,[payload,payload]);
});
test('adapter cannot create payments, finalize or confirm unrelated expenses',async()=>{
 const f=fixture();for(const url of ['/api/transactions/stores/store','/api/transactions/other-expenses/review/review','/api/purchase-orders/draft'])await assert.rejects(f.api(url,{method:'POST',body:'{}'}),/επιτρεπτή/);assert.equal(f.calls.length,0);
});
test('different transaction or amount in response remains unconfirmed',async()=>{
 const api=supplierExpenseRecoveryApi({storeId:'store',api:async(url,options)=>options?{ok:true,transactionId:'another',amount:12.4}:url===path?context:{items:[item]}});
 await api('/api/transactions/other-expenses/review');await api(path);await assert.rejects(api(path,{method:'POST',body:JSON.stringify(payload)}),/Δεν επιβεβαιώθηκε/);
});
test('a late older refresh cannot replace the current list or its supplier context',async()=>{
 const pending=[];const api=supplierExpenseRecoveryApi({storeId:'store',api:url=>url===path?Promise.resolve(context):new Promise(resolve=>pending.push(resolve))});
 const first=api('/api/transactions/other-expenses/review'),second=api('/api/transactions/other-expenses/review');
 pending[1]({items:[item]});await second;await api(path);
 pending[0]({items:[]});await assert.rejects(first,/λίστα ανανεώθηκε/);
 assert.equal((await api(path)).transactionId,'payment');
});

test('dedicated delegated adapter uses exact scoped routes and preserves original payment retry',async()=>{
 const calls=[];const api=supplierExpenseRecoveryApi({storeId:'store',delegated:true,api:async(url,options)=>{calls.push({url,options});return options?{ok:true,transactionId:'payment',amount:12.4}:url.endsWith('/payment/supplier')?context:{items:[item]};}});
 await api('/api/transactions/other-expenses/review');await api(path);const options={method:'POST',body:JSON.stringify(payload)};await api(path,options);
 assert.deepEqual(calls.map(c=>c.url),['/api/transactions/stores/store/invoice-recovery','/api/transactions/stores/store/invoice-recovery/payment/supplier','/api/transactions/stores/store/invoice-recovery/payment/supplier']);assert.equal(calls[2].options,options);
});
