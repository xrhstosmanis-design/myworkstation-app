import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CUSTOMER_PRICING,parseCustomerPricing,customerCharge,pricingSnapshot,chargeFromSnapshot,stableWalletJson,publicCustomerCharge} from '../src/services/ai-wallet-customer-pricing.js';
import {pricingPolicy,pricingDecimalText} from '../../client/src/components/platform/ai-wallet-customer-pricing.mjs';

test('all-zero prices preserve every legacy amount exactly, including zero and maximum; integer surcharge always rounds up once',()=>{
  for(const base of [0n,1n,535815n,1000000000000n])assert.equal(customerCharge(base,DEFAULT_CUSTOMER_PRICING).totalMicros,String(base));
  const p={additionalMarkupBps:1250,callFeeMicros:'100',invoiceFeeMicros:'200'};
  assert.deepEqual(customerCharge(1n,p,true),{baseMicros:'1',additionalMarkupMicros:'1',callFeeMicros:'100',invoiceFeeMicros:'200',totalMicros:'302'});
  assert.equal(customerCharge(8n,p,false).totalMicros,'109');
  assert.equal(customerCharge(1000000n,p,true).totalMicros,'1125300');
});
test('reject unknown/negative/noncanonical/unsafe prices and overflow before a reservation',()=>{
  for(const p of [{...DEFAULT_CUSTOMER_PRICING,unknown:1},{...DEFAULT_CUSTOMER_PRICING,additionalMarkupBps:1.5},{...DEFAULT_CUSTOMER_PRICING,additionalMarkupBps:100001},{...DEFAULT_CUSTOMER_PRICING,callFeeMicros:'01'},{...DEFAULT_CUSTOMER_PRICING,invoiceFeeMicros:'-1'},{...DEFAULT_CUSTOMER_PRICING,callFeeMicros:'1000000000001'}])assert.throws(()=>parseCustomerPricing(p),e=>e.code==='AI_WALLET_PRICING_INVALID');
  assert.throws(()=>customerCharge(1000000000000n,{...DEFAULT_CUSTOMER_PRICING,callFeeMicros:'1'}),e=>e.code==='AI_WALLET_PRICING_LIMIT');
});
test('original snapshot prices survive a later policy edit and carry a closed, once-only invoice decision',()=>{
  const policy={additionalMarkupBps:2500,callFeeMicros:'20',invoiceFeeMicros:'100'},snap=pricingSnapshot(policy,{version:4,invoiceDocumentId:'synthetic-doc',invoiceFeeClaimed:true});
  policy.callFeeMicros='999';assert.equal(chargeFromSnapshot(40n,snap).totalMicros,'170');
  assert.equal(chargeFromSnapshot(40n,{...snap,invoiceFeeClaimed:false}).totalMicros,'70');
  assert.throws(()=>chargeFromSnapshot(40n,{...snap,invoiceDocumentId:null}),e=>e.code==='AI_WALLET_PRICING_INVALID');
  assert.throws(()=>chargeFromSnapshot(40n,{...snap,policyVersion:undefined}),e=>e.code==='AI_WALLET_PRICING_INVALID');
});
test('Greek comma, dot, zero fees and six decimal EUR round-trip without floating point',()=>{
  assert.deepEqual(pricingPolicy({percentage:'12,50',callFee:'0,000001',invoiceFee:'2.35'}),{additionalMarkupBps:1250,callFeeMicros:'1',invoiceFeeMicros:'2350000'});
  assert.deepEqual(pricingPolicy({percentage:'0',callFee:'0',invoiceFee:'0'}),DEFAULT_CUSTOMER_PRICING);
  assert.equal(pricingDecimalText('2350000',6),'2,35');assert.equal(pricingDecimalText('1',6),'0,000001');assert.equal(pricingDecimalText(1250,2),'12,5');
  for(const value of ['', '-1','1e2','1,2.3','1.0000001','1000001'])assert.throws(()=>pricingPolicy({percentage:'0',callFee:value,invoiceFee:'0'}));
});
test('public breakdown discards private fields and malformed totals; nested settlement equality includes every amount',()=>{
  const charge=customerCharge(100n,{additionalMarkupBps:2500,callFeeMicros:'20',invoiceFeeMicros:'100'},true);
  assert.deepEqual(publicCustomerCharge({...charge,privateInput:'secret'}),charge);
  assert.equal(publicCustomerCharge({...charge,totalMicros:'1'}),null);
  assert.notEqual(stableWalletJson({customerCharge:charge}),stableWalletJson({customerCharge:{...charge,callFeeMicros:'21'}}));
  assert.equal(stableWalletJson({usage:{a:1,b:2},customerCharge:charge}),stableWalletJson({customerCharge:{...charge},usage:{b:2,a:1}}));
});
