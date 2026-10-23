import test from 'node:test';
import assert from 'node:assert/strict';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';
test('actual POS obtains separate ftext capability and recovers dispatched cash without RBS continuation or checkout resend',()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async path=>{
  const request={id:'cash-request-a',kind:'FTEXT_CASH',storeId:'A',terminalPos:'POS-01',status:'DISPATCHED',paymentMethod:'CASH',total:2.2,clientTransactionId:'checkout-a',checkout:{paymentMethod:'CASH',items:[{productId:'p0',quantity:1}]}};
  if(path.endsWith('/ftext-cash/pending'))return {requests:[request]};
  if(path.endsWith('/ftext-cash/cash-request-a'))return {request};
 },
 run:async({calls})=>{
  assert.ok(calls.some(c=>c.path==='/api/store-pos/stores/A/ftext-cash/capability'));
  assert.ok(calls.some(c=>c.path==='/api/store-pos/stores/A/ftext-cash/pending'));
  assert.equal(calls.some(c=>c.path.includes('/rbs-capdriver-v1/')),false);
  assert.equal(calls.some(c=>c.path.endsWith('/checkout')||c.path.endsWith('/finalize')),false);
  assert.equal(document.querySelectorAll('.standard-line').length,1);
  assert.match(document.body.textContent,/ftext/i);
  assert.equal(document.querySelector('[data-pos-scanner]').disabled,true);
 }
}));
