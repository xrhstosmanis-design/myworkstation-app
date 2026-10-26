import test from 'node:test';
import assert from 'node:assert/strict';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';
for(const method of ['CASH','CARD'])test(`actual POS recovers dispatched ftext ${method} without RBS continuation, manual confirmation or checkout resend`,()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async path=>{
  const request={id:'cash-request-a',kind:'FTEXT_CASH',storeId:'A',terminalPos:'POS-01',status:'DISPATCHED',paymentMethod:method,total:2.2,clientTransactionId:'checkout-a',checkout:{paymentMethod:method,items:[{productId:'p0',quantity:1}]}};
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

for(const outcome of ['YES','NO'])test(`actual POS operator card ${outcome} uses only its own outcome route and never resends checkout`,()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async(path,options)=>{
  const row={id:'operator-request',kind:'FTEXT_CASH',storeId:'A',terminalPos:'POS-01',status:'CONFIRMED',operatorConfirmationRequired:true,paymentMethod:'CARD',total:2.2,clientTransactionId:'operator-checkout',checkout:{paymentMethod:'CARD',items:[{productId:'p0',quantity:1}]}};
  if(path.endsWith('/ftext-cash/pending'))return {requests:[row]};
  if(path.endsWith('/ftext-cash/operator-request'))return {request:row};
  if(path.endsWith('/ftext-cash/operator-request/outcome'))return {request:{...row,operatorConfirmationRequired:false,operatorOutcome:outcome,status:outcome==='YES'?'SALE_COMMITTED':'REQUIRES_CHECK'}};
 },
 run:async({calls,click})=>{
  assert.match(document.body.textContent,/Ναι · εγκρίθηκε/);
  assert.equal(calls.some(c=>c.path.endsWith('/finalize')),false);
  const button=[...document.querySelectorAll('button')].find(x=>x.textContent.startsWith(outcome==='YES'?'Ναι ·':'Όχι ·'));await click(button);
  const writes=calls.filter(c=>c.options.method==='POST'&&!c.path.endsWith('/audience-selection'));assert.equal(writes.length,1,JSON.stringify(writes.map(x=>x.path)));assert.equal(writes[0].path,'/api/store-pos/stores/A/ftext-cash/operator-request/outcome');assert.deepEqual(JSON.parse(writes[0].options.body),{outcome});
  assert.equal(calls.some(c=>c.path.includes('/rbs-capdriver-v1/')||c.path.endsWith('/checkout')),false);
  if(outcome==='NO')assert.equal(document.querySelectorAll('.standard-line').length,1);
 }
}));
