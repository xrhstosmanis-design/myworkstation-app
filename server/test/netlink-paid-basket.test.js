import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateNetlinkBasketLines} from '../src/integrations/netlink/paid-basket-lines.js';
import {assertNetlinkPaidSale} from '../src/integrations/netlink/paid-issuance-contract.js';

const scope={companyId:'company',storeId:'store'};
const intent=id=>({...scope,requestId:id,checkoutId:'checkout',saleProductId:'value',serviceFeeProductId:'fee',amount:10,serviceFeeAmount:.5,customerTotal:10.5,status:'READY_FOR_PAYMENT'});
const line=(productId,quantity,unitPrice)=>({id:productId,productId,quantity,unitPrice,lineTotal:quantity*unitPrice,discount:0});
test('ordinary goods and two cards share one receipt with one fee per card',()=>{
 const result=allocateNetlinkBasketLines(['b','a'],[intent('a'),intent('b')],[line('goods',2,3),line('value',2,10),line('fee',2,.5)],27);
 assert.equal(result.size,2);
 assert.equal(result.get('a')[0].sourceUnit,0);
 assert.equal(result.get('b')[0].sourceUnit,1);
 assert.equal(result.get('a')[1].lineTotal,.5);
 assert.equal(result.get('b')[1].lineTotal,.5);
});
test('a second card cannot reuse the first card service fee',()=>{
 assert.throws(()=>allocateNetlinkBasketLines(['a','b'],[intent('a'),intent('b')],[line('value',2,10),line('fee',1,.5)],21),{code:'NETLINK_PAID_LINES_MISMATCH'});
});
test('an unpaid or removed intent cannot use another paid checkout manifest',()=>{
 assert.throws(()=>allocateNetlinkBasketLines(['a'],[intent('b')],[line('value',1,10),line('fee',1,.5)],10.5));
 assert.throws(()=>allocateNetlinkBasketLines(['a','a'],[intent('a'),intent('a')],[line('value',2,10),line('fee',2,.5)],21));
});
for(const method of ['CASH','CARD'])test('mixed basket requires the entire basket payment: '+method,()=>{
 const card=intent('a'),total=16.5;
 const evidence={scope,intent:card,sale:{...scope,id:'sale',clientTransactionId:'checkout',status:'COMPLETED',fiscalStatus:'ISSUED',total},lines:[line('value',1,10),line('fee',1,.5)],payments:[{method,amount:total}],fiscal:{...scope,saleId:'sale',status:'ISSUED',fiscalNumber:'receipt',issuedAt:new Date()},cashConfirmation:{...scope,requestId:'a',checkoutId:'checkout',actorId:'employee',receivedAt:new Date(),amount:total},cardProof:{...scope,saleId:'sale',clientTransactionId:'checkout',method:'CARD',status:'SUCCESS',amount:total,evidenceId:'bank-result'}};
 assert.equal(assertNetlinkPaidSale(evidence).totalCents,1650);
 evidence.payments[0].amount=10.5;
 assert.throws(()=>assertNetlinkPaidSale(evidence));
});
