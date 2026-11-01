import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSharedCost,sharedCostStores,sharedCostPeriodDays,sharedCostExampleCompanies} from '../../client/src/components/platform/shared-cost-preview.mjs';

const input=()=>({period:'2026-10',amount:'100,00',reference:'Synthetic supplier cost',confirmed:true,participants:['A','B','C'].map((x,i)=>({storeId:'example-store-'+x,days:i===2?'16':'31'}))});
test('shared pool applies one margin, allocates largest remainders and aggregates exact company totals',()=>{
  const r=previewSharedCost(input(),sharedCostExampleCompanies);
  assert.equal(r.previewOnly,true);assert.equal(r.currency,'EUR');assert.equal(r.baseCents,'10000');assert.equal(r.markupCents,'5000');assert.equal(r.totalCents,'15000');assert.equal(r.totalDays,78);
  assert.deepEqual(r.stores.map(x=>x.amountCents),['5962','5961','3077']);
  assert.equal(r.companies.reduce((s,x)=>s+BigInt(x.amountCents),0n),15000n);
  const reversed=previewSharedCost({...input(),participants:input().participants.reverse()},[...sharedCostExampleCompanies].reverse());assert.deepEqual(reversed,r);
  const c=[{id:'a',name:'Company',active:true,stores:[{id:'a1',active:true},{id:'a2',active:true}]},{id:'b',active:true,stores:[{id:'b1',active:true}]}];
  const merged=previewSharedCost({...input(),participants:[{storeId:'a1',days:31},{storeId:'a2',days:31},{storeId:'b1',days:16}]},c);
  assert.deepEqual(merged.companies.map(x=>x.amountCents),['11923','3077']);
});
test('cent-level costs round the pool once and conserve bounded totals across varied weights',()=>{
  for(const amount of ['0.01','0.03','1.01','100.01','1000000'])for(const days of [[1,1,1],[31,1,7],[2,31,30]]){
    const r=previewSharedCost({...input(),amount,participants:input().participants.map((p,i)=>({...p,days:days[i]}))},sharedCostExampleCompanies);
    const expected=(BigInt(r.baseCents)*150n+99n)/100n;assert.equal(BigInt(r.totalCents),expected);assert.equal(r.stores.reduce((s,x)=>s+BigInt(x.amountCents),0n),expected);
    for(const x of r.stores){const floor=expected*BigInt(x.days)/BigInt(r.totalDays);assert.ok(BigInt(x.amountCents)===floor||BigInt(x.amountCents)===floor+1n)}
  }
  assert.equal(previewSharedCost({...input(),amount:'0.01'},sharedCostExampleCompanies).totalCents,'2');
  assert.equal(previewSharedCost({...input(),amount:'100.01'},sharedCostExampleCompanies).totalCents,'15002');
});
test('month bounds use actual calendar days, including leap February',()=>{
  assert.equal(sharedCostPeriodDays('2028-02'),29);assert.equal(sharedCostPeriodDays('2026-02'),28);assert.equal(sharedCostPeriodDays('2026-04'),30);
  for(const value of ['2026-00','2026-13','2026-1','1999-12','2100-01','2026-10-extra',null])assert.throws(()=>sharedCostPeriodDays(value));
  assert.throws(()=>previewSharedCost({...input(),period:'2026-02'},sharedCostExampleCompanies),/ημέρες/);
  const valid={...input(),period:'2028-02',participants:[{storeId:'example-store-A',days:29}]};assert.equal(previewSharedCost(valid,sharedCostExampleCompanies).totalDays,29);
});
test('requires documented EUR source, explicit declaration and valid unique commercial participants',()=>{
  for(const override of [{amount:'0'},{amount:'-1'},{amount:'NaN'},{amount:'1e2'},{amount:'1.001'},{amount:'1000000.01'},{reference:''},{reference:'x'.repeat(241)},{confirmed:false},{confirmed:'true'},{participants:[]},{participants:[{storeId:'foreign',days:1}]},{participants:[{storeId:'example-store-A',days:0}]},{participants:[{storeId:'example-store-A',days:32}]},{participants:[{storeId:'example-store-A',days:1.5}]},{participants:[{storeId:'example-store-A',days:1},{storeId:'example-store-A',days:2}]}])assert.throws(()=>previewSharedCost({...input(),...override},sharedCostExampleCompanies));
  const c=[...sharedCostExampleCompanies,{id:'cmtpopbgk000prhb5qc60zxus',active:true,stores:[{id:'lab',active:true}]},{id:'inactive',active:false,stores:[{id:'old',active:true}]},{id:'demo',isDemo:true,active:true,stores:[{id:'demo-store',active:true}]},{id:'a',active:true,stores:[{id:'stopped',active:false},{id:'test',active:true,isTest:true}]}];
  assert.deepEqual(sharedCostStores(c).map(x=>x.storeId),['example-store-A','example-store-B','example-store-C']);
  for(const storeId of ['lab','old','demo-store','stopped','test'])assert.throws(()=>previewSharedCost({...input(),participants:[{storeId,days:1}]},c));
  assert.throws(()=>sharedCostStores([...sharedCostExampleCompanies,sharedCostExampleCompanies[0]]),/διπλή/);
  assert.throws(()=>sharedCostStores([{id:'a',active:true,stores:[{id:'same',active:true}]},{id:'b',active:true,stores:[{id:'same',active:true}]}]),/διπλό/);
});
