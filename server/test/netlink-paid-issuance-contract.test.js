import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNetlinkPaidSale,dispatchPaidNetlink,fixedCardFromMenu,moneyCents} from '../src/integrations/netlink/paid-issuance-contract.js';
const scope={companyId:'company',storeId:'store'};
function fixture(method='CASH'){
 const intent={...scope,requestId:'card-intent-id',checkoutId:'checkout-id',providerRequestId:'1234567890',productId:'provider-card',amount:10,serviceFeeAmount:.5,customerTotal:10.5,saleProductId:'value',serviceFeeProductId:'fee',status:'READY_FOR_PAYMENT'};
 const sale={...scope,id:'sale',clientTransactionId:intent.checkoutId,status:'COMPLETED',fiscalStatus:'ISSUED',discount:0,total:10.5};
 return {scope,intent,sale,lines:[{productId:'value',quantity:1,unitPrice:10,lineTotal:10,discount:0},{productId:'fee',quantity:1,unitPrice:.5,lineTotal:.5,discount:0}],payments:[{method,amount:10.5}],fiscal:{...scope,saleId:'sale',status:'ISSUED',fiscalNumber:'real-receipt',issuedAt:new Date()},cashConfirmation:{...scope,requestId:intent.requestId,checkoutId:intent.checkoutId,actorId:'employee',receivedAt:new Date(),amount:10.5},cardProof:{...scope,saleId:'sale',clientTransactionId:intent.checkoutId,status:'SUCCESS',method:'CARD',amount:10.5,evidenceId:'native-eftpos-evidence'}};
}
test('exact card plus automatic0.50 service accepts only full cash/card and matching fiscal receipt',()=>{
 for(const method of ['CASH','CARD'])assert.deepEqual(assertNetlinkPaidSale(fixture(method)),{paymentMethod:method,totalCents:1050,cardCents:1000,serviceCents:50,fiscalNumber:'real-receipt'});
});
for(const [label,change] of [
 ['cross store',x=>x.sale.storeId='other'],['wrong checkout',x=>x.sale.clientTransactionId='other'],['pending sale',x=>x.sale.status='PENDING'],['non-fiscal sale',x=>x.sale.fiscalStatus='NON_FISCAL'],['wrong total',x=>x.sale.total=10],['missing fee',x=>x.lines.pop()],['wrong fee',x=>x.lines[1].unitPrice=.4],['quantity changed',x=>x.lines[0].quantity=2],['discount',x=>x.lines[0].discount=.1],['extra line',x=>x.lines.push({...x.lines[0]})],['credit',x=>x.payments[0].method='CREDIT'],['partial payment',x=>x.payments[0].amount=10],['no receipt',x=>x.fiscal=null],['unissued receipt',x=>x.fiscal.status='PENDING'],['other receipt',x=>x.fiscal.saleId='other'],['cash unconfirmed',x=>x.cashConfirmation=null],['other cash confirmation',x=>x.cashConfirmation.requestId='other']
])test('no issuance proof: '+label,()=>{const x=fixture();change(x);assert.throws(()=>assertNetlinkPaidSale(x),e=>e.code.startsWith('NETLINK_'))});
for(const status of ['PLANNED','FAILURE','TIMEOUT','CANCELLED','REVERSED'])test('card result '+status+' cannot issue',()=>{const x=fixture('CARD');x.cardProof.status=status;assert.throws(()=>assertNetlinkPaidSale(x),{code:'NETLINK_CARD_NOT_APPROVED'})});
test('fixed cards use the selected authoritative catalogue and preserve disabled/variable restrictions',()=>{
 const menu={data:{tabs:[{groups:[{products:[{productId:'p',title:'Card 10€',flow:'execute',payload:{properties:{}}},{productId:'off',title:'Card 20€',flow:'execute',disabled:true},{productId:'bill',title:'Bill',flow:'prepare'}]}]}]}};
 assert.equal(fixedCardFromMenu(menu,'p').amountCents,1000);
 for(const id of ['off','bill','missing'])assert.throws(()=>fixedCardFromMenu(menu,id));
 assert.throws(()=>fixedCardFromMenu({groups:[{products:[{productId:'p',title:'Card 10€ / 20€',flow:'execute'}]}]},'p'),{code:'NETLINK_PRICE_AMBIGUOUS'});
 for(const v of [NaN,Infinity,-1,'x',1.005])assert.throws(()=>moneyCents(v));
});
function memoryRepository(evidence){
 let row=structuredClone(evidence.intent),saved=null;
 return {get row(){return row},get saved(){return saved},load:async()=>structuredClone(row),claim:async()=>{if(row.status!=='READY_FOR_PAYMENT')return false;row.status='EXECUTING';return true},complete:async(s,r,v)=>{row.status='COMPLETED';saved=v},review:async()=>{row.status='AMOUNT_REVIEW'},uncertain:async()=>{row.status='UNKNOWN'}};
}
test('two concurrent completions dispatch once, replay never returns PIN or executes again',async()=>{
 const evidence=fixture(),repository=memoryRepository(evidence);let calls=0,release;const gate=new Promise(r=>release=r);
 const provider={execute:async(id,body)=>{calls++;assert.equal(id,'provider-card');assert.deepEqual(body,{requestId:'1234567890',payload:{}});await gate;return {data:{transactionId:'provider-tx',amount:10,lines:['PRIVATE PIN']}}}};
 const opts={repository,scope,requestId:'card-intent-id',provider,loadEvidence:async()=>evidence,encryptResult:async()=> 'encrypted-only'};
 const a=dispatchPaidNetlink(opts),b=dispatchPaidNetlink(opts);await new Promise(r=>setImmediate(r));release();const results=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(repository.saved.encrypted,'encrypted-only');assert.doesNotMatch(JSON.stringify(results),/PRIVATE PIN/);assert.equal((await dispatchPaidNetlink(opts)).idempotentReplay,true);assert.equal(calls,1);
});
test('uncertain provider response remains review-required and never retries a purchase',async()=>{
 const evidence=fixture(),repository=memoryRepository(evidence);let calls=0;
 const opts={repository,scope,requestId:'card-intent-id',provider:{execute:async()=>{calls++;throw Error('secret provider body')}},loadEvidence:async()=>evidence,encryptResult:async()=>''};
 assert.equal((await dispatchPaidNetlink(opts)).status,'UNKNOWN');assert.equal((await dispatchPaidNetlink(opts)).status,'UNKNOWN');assert.equal(calls,1);
});
test('provider HTTP rejection retains a safe status without exposing provider body or retrying',async()=>{
 const evidence=fixture(),repository=memoryRepository(evidence);let calls=0,savedCode;
 repository.uncertain=async(s,id,code)=>{repository.row.status='UNKNOWN';savedCode=code};
 const opts={repository,scope,requestId:'card-intent-id',provider:{execute:async()=>{calls++;throw Object.assign(Error('PRIVATE PROVIDER BODY'),{providerStatus:400})}},loadEvidence:async()=>evidence,encryptResult:async()=>''};
 const result=await dispatchPaidNetlink(opts);assert.equal(result.providerHttpStatus,400);assert.equal(savedCode,'NETLINK_PROVIDER_HTTP_400');assert.doesNotMatch(JSON.stringify(result),/PRIVATE PROVIDER BODY/);await dispatchPaidNetlink(opts);assert.equal(calls,1);
});
test('all payment/fiscal/fee checks happen before claiming or contacting provider',async()=>{
 const evidence=fixture();evidence.sale.total=10;let claimed=0,called=0;const repository=memoryRepository(evidence);repository.claim=async()=>{claimed++;return true};
 await assert.rejects(()=>dispatchPaidNetlink({repository,scope,requestId:'card-intent-id',provider:{execute:async()=>called++},loadEvidence:async()=>evidence,encryptResult:async()=>''}),{code:'NETLINK_PAID_TOTAL_MISMATCH'});assert.equal(claimed,0);assert.equal(called,0);
});
