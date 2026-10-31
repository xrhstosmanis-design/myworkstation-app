import test from 'node:test';
import assert from 'node:assert/strict';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';
test('historical unknown NO returns without any second confirmation and keeps the same basket',()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async path=>{const row={id:'review-request',kind:'FTEXT_CASH',storeId:'A',status:'REQUIRES_CHECK',operatorOutcome:'NO',operatorReleaseMode:'OPERATOR_REVIEW',paymentMethod:'CARD',total:2.2,checkout:{items:[{productId:'p0',quantity:1}]}};if(path.endsWith('/pending')||path.endsWith('/ftext-cash/review-request'))return path.endsWith('/pending')?{requests:[row]}:{request:row};if(path.endsWith('/release'))return {request:{...row,operatorReleaseMode:'RELEASED'}}},
 run:async({calls,click,dom})=>{dom.window.confirm=()=>assert.fail('No second confirmation permitted');const button=[...document.querySelectorAll('button')].find(x=>x.textContent==='Επιστροφή στο καλάθι');await click(button);const writes=calls.filter(c=>c.path.endsWith('/release'));assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{operatorNo:true});assert.equal(document.querySelectorAll('.standard-line').length,1);assert.match(document.body.textContent,/Η προηγούμενη προσπάθεια έκλεισε στο MyWorkStation/);assert.equal(calls.some(c=>c.path.endsWith('/checkout')||c.path.endsWith('/finalize')),false);}
}));
test('polling an already reviewed release clears its own stale pending UI without checkout or clearing basket',()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async path=>{const row={id:'released-request',kind:'FTEXT_CASH',storeId:'A',status:'REQUIRES_CHECK',operatorOutcome:'NO',paymentMethod:'CARD',total:2.2,checkout:{items:[{productId:'p0',quantity:1}]}};if(path.endsWith('/pending'))return {requests:[row]};if(path.endsWith('/ftext-cash/released-request'))return {request:{...row,operatorReleaseMode:'RELEASED'}}},
 run:async({calls})=>{assert.match(document.body.textContent,/Η προηγούμενη προσπάθεια έκλεισε στο MyWorkStation/);assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(calls.some(c=>c.path.endsWith('/release')||c.path.endsWith('/checkout')||c.path.endsWith('/finalize')),false);}
}));
test('historical rejected ftext returns without a readiness dialog and retains basket',()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async path=>{const row={id:'rejected-request',kind:'FTEXT_CASH',storeId:'A',status:'REQUIRES_CHECK',operatorOutcome:'NO',paymentMethod:'CARD',total:2.2,checkout:{items:[{productId:'p0',quantity:1}]}};if(path.endsWith('/pending'))return {requests:[row]};if(path.endsWith('/ftext-cash/rejected-request'))return {request:row};if(path.endsWith('/release'))return {request:row}},
 run:async({calls,click,dom})=>{dom.window.confirm=()=>assert.fail('No readiness dialog permitted');const button=[...document.querySelectorAll('button')].find(x=>x.textContent==='Επιστροφή στο καλάθι');await click(button);const release=calls.filter(c=>c.path.endsWith('/release'));assert.equal(release.length,1);assert.deepEqual(JSON.parse(release[0].options.body),{operatorNo:true});assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(calls.some(c=>c.path.endsWith('/checkout')||c.path.endsWith('/finalize')),false);}
}));
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
  if(path.endsWith('/ftext-cash/operator-request/outcome'))return {request:{...row,operatorConfirmationRequired:false,operatorOutcome:outcome,operatorReleaseMode:outcome==='NO'?'RELEASED':null,status:outcome==='YES'?'SALE_COMMITTED':'REQUIRES_CHECK'}};
 },
 run:async({calls,click,dom})=>{
  dom.window.confirm=()=>assert.fail('NO must not open another dialog');
  assert.match(document.body.textContent,/Ναι · εγκρίθηκε/);
  assert.equal(calls.some(c=>c.path.endsWith('/finalize')),false);
  const button=[...document.querySelectorAll('button')].find(x=>x.textContent.startsWith(outcome==='YES'?'Ναι ·':'Όχι ·'));await click(button);
  const writes=calls.filter(c=>c.options.method==='POST'&&!c.path.endsWith('/audience-selection'));assert.equal(writes.length,1,JSON.stringify(writes.map(x=>x.path)));assert.equal(writes[0].path,'/api/store-pos/stores/A/ftext-cash/operator-request/outcome');assert.deepEqual(JSON.parse(writes[0].options.body),{outcome});
  assert.equal(calls.some(c=>c.path.includes('/rbs-capdriver-v1/')||c.path.endsWith('/checkout')),false);
  assert.equal([...document.querySelectorAll('h2')].some(x=>x.textContent==='Επιβεβαίωση κάρτας'),false,'Persisted decision must close blocking confirmation');
  if(outcome==='NO'){
   assert.equal(document.querySelectorAll('.standard-line').length,1);
   assert.equal(document.querySelector('[data-pos-scanner]').disabled,false,'Return to usable basket after NO');
   assert.match(document.body.textContent,/Η προηγούμενη προσπάθεια έκλεισε στο MyWorkStation/);
   assert.equal(calls.some(c=>c.path.endsWith('/release')),false,'NO must release atomically in its outcome request');
  }else{
   assert.equal(document.querySelectorAll('.standard-line').length,0,'Committed YES clears basket immediately');
   assert.match(document.body.textContent,/Νέα συναλλαγή/);
  }
 }
}));

for(const outcome of ['YES','NO'])test(`actual POS failed ${outcome} decision keeps confirmation and original basket`,()=>withMountedPos({
 ftextConfigured:true,
 apiOverride:async(path)=>{
  const row={id:'failed-decision',kind:'FTEXT_CASH',storeId:'A',status:'REQUIRES_CHECK',operatorConfirmationRequired:true,paymentMethod:'CARD',total:2.2,checkout:{items:[{productId:'p0',quantity:1}]}};
  if(path.endsWith('/ftext-cash/pending'))return {requests:[row]};
  if(path.endsWith('/ftext-cash/failed-decision'))return {request:row};
  if(path.endsWith('/outcome'))throw Error('SYNTHETIC NETWORK FAILURE');
 },
 run:async({click,calls})=>{
  await click([...document.querySelectorAll('button')].find(x=>x.textContent.startsWith(outcome==='YES'?'Ναι ·':'Όχι ·')));
  assert.equal([...document.querySelectorAll('h2')].some(x=>x.textContent==='Επιβεβαίωση κάρτας'),true);
  assert.equal(document.querySelectorAll('.standard-line').length,1);
  assert.equal(calls.some(c=>c.path.endsWith('/checkout')||c.path.endsWith('/finalize')),false);
 }
}));
