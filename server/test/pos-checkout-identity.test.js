import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

test('actual fetch wrapper preserves fiscal/offline UUIDs, scopes legacy retries and never invents fiscal identity',async()=>{
 const savedFetch=globalThis.fetch,savedConfirm=globalThis.confirm,savedInstalled=globalThis.__mwsPosCheckoutSafetyInstalled;
 const sent=[];let status=503,confirmations=0;
 delete globalThis.__mwsPosCheckoutSafetyInstalled;
 globalThis.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify(status===409?{code:'DUPLICATE_SIMILAR_SALE'}:{}),{status})};
 globalThis.confirm=()=>{confirmations++;return true};
 try{
  const {installPosCheckoutSafety}=await import('../../client/src/pos-checkout-safety.js?identity-test');installPosCheckoutSafety();
  const post=(store,body)=>fetch(`/api/store-pos/stores/${store}/checkout`,{method:'POST',body:JSON.stringify(body)});
  const id=randomUUID(),fiscal=randomUUID(),body={clientTransactionId:id,fiscalRequestId:fiscal,paymentMethod:'CASH',items:[{productId:'p',quantity:1}],lifecycleGeneration:'0'};
  await post('A',body);await post('A',body);assert.deepEqual(sent.map(x=>x.body.clientTransactionId),[id,id]);assert.equal(sent[0].body.fiscalRequestId,fiscal);assert.equal(sent[0].body.lifecycleGeneration,'0');
  status=200;await post('A',body);await post('A',body);assert.equal(sent.at(-1).body.clientTransactionId,id);
  status=503;const offline={...body,fiscalRequestId:undefined,clientTransactionId:randomUUID()};await post('A',offline);assert.equal(sent.at(-1).body.clientTransactionId,offline.clientTransactionId);
  const legacy={paymentMethod:'CASH',items:body.items};await post('A',legacy);const a=sent.at(-1).body.clientTransactionId;await post('A',legacy);assert.equal(sent.at(-1).body.clientTransactionId,a);await post('B',legacy);assert.notEqual(sent.at(-1).body.clientTransactionId,a);
  const n=sent.length;assert.equal((await post('A',{...body,clientTransactionId:undefined})).status,409);assert.equal(sent.length,n);
  status=409;await post('A',body);assert.equal(confirmations,1);assert.equal(sent.at(-1).body.clientTransactionId,id);assert.equal(sent.at(-1).body.confirmDuplicate,true);
 }finally{globalThis.fetch=savedFetch;globalThis.confirm=savedConfirm;if(savedInstalled===undefined)delete globalThis.__mwsPosCheckoutSafetyInstalled;else globalThis.__mwsPosCheckoutSafetyInstalled=savedInstalled}
});
