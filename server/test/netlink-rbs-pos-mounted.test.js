import test from 'node:test';
import assert from 'node:assert/strict';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';
const id='00000000-0000-4000-8000-000000000001';
const items=['CARD','FEE'].map(role=>({productId:role==='CARD'?'p0':'p1',quantity:1,overrideReason:`NETLINK_${role}:${id}`}));
for(const method of ['CASH','CARD'])test(`actual POS refresh completes native RBS ${method} once using original manifest`,()=>withMountedPos({
 apiOverride:async path=>{
  const request={id:'rbs-committed',storeId:'A',terminalPos:'POS-01',clientTransactionId:'checkout',paymentMethod:method,total:5.5,status:'SALE_COMMITTED',saleId:'sale',checkout:{items}};
  if(path.endsWith('/rbs-capdriver-v1/pending'))return {requests:[{...request,status:method==='CARD'?'OPERATOR_CONFIRMED':'DISPATCHED'}]};
  if(path.endsWith('/rbs-capdriver-v1/rbs-committed'))return {request};
  if(path.endsWith('/issue'))return {status:'UNKNOWN'};
 },
 run:async({calls})=>{
  const issued=calls.filter(c=>c.path.endsWith('/issue'));assert.equal(issued.length,1,JSON.stringify(calls.map(c=>c.path)));assert.ok(issued[0].path.includes(id));
  assert.equal(calls.some(c=>c.path.endsWith('/outcome')),false);
  const continuations=calls.filter(c=>c.path.endsWith('/checkout'));assert.ok(continuations.length<=(method==='CASH'?1:0));for(const c of continuations)assert.equal(JSON.parse(c.options.body).fiscalRequestId,'rbs-committed');
 }
}));
for(const status of ['DISPATCHED','REQUIRES_CHECK','DECLINED'])test(`actual POS RBS CARD ${status} never issues before native approval/commit`,()=>withMountedPos({
 apiOverride:async path=>{const request={id:'unpaid',storeId:'A',paymentMethod:'CARD',total:5.5,status,clientTransactionId:'checkout',checkout:{items}};if(path.endsWith('/rbs-capdriver-v1/pending'))return {requests:[request]};if(path.endsWith('/rbs-capdriver-v1/unpaid'))return {request};},
 run:async({calls})=>{assert.equal(calls.some(c=>c.path.endsWith('/issue')||c.path.endsWith('/checkout')),false);}
}));
