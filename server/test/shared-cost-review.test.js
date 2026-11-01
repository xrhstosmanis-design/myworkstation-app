import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSharedCost,sharedCostExampleCompanies} from '../../client/src/components/platform/shared-cost-preview.mjs';
import {summarizeSharedCostReview} from '../../client/src/components/platform/shared-cost-review.mjs';
const example=()=>previewSharedCost({period:'2026-10',amount:'100',reference:'Synthetic EUR cost',confirmed:true,participants:['A','B','C'].map((x,i)=>({storeId:'example-store-'+x,days:i===2?16:31}))},sharedCostExampleCompanies);

test('owner review starts pending and partitions original company amounts without redistributing waived shares',()=>{
 const p=example(),snapshot=JSON.stringify(p),initial=summarizeSharedCostReview(p);
 assert.deepEqual([initial.approvedCents,initial.pendingCents,initial.waivedCents],['0','15000','0']);
 const choices={'example-A':'APPROVED_DRAFT','example-B':'WAIVED'},review=summarizeSharedCostReview(p,choices);
 assert.deepEqual([review.approvedCents,review.pendingCents,review.waivedCents],['5962','3077','5961']);
 assert.deepEqual(review.rows.map(x=>x.amountCents),['5962','5961','3077']);assert.equal(review.temporary,true);assert.equal(review.posted,false);
 assert.equal(JSON.stringify(p),snapshot);assert.deepEqual(choices,{'example-A':'APPROVED_DRAFT','example-B':'WAIVED'});
 for(const a of ['PENDING','APPROVED_DRAFT','WAIVED'])for(const b of ['PENDING','APPROVED_DRAFT','WAIVED'])for(const c of ['PENDING','APPROVED_DRAFT','WAIVED']){
  const r=summarizeSharedCostReview(p,{'example-A':a,'example-B':b,'example-C':c});assert.equal(BigInt(r.approvedCents)+BigInt(r.pendingCents)+BigInt(r.waivedCents),15000n);
 }
});

test('review refuses foreign decisions, unsupported states and inconsistent or duplicate company totals',()=>{
 for(const choices of [{foreign:'WAIVED'},{'example-A':'APPROVED'},{'example-A':true},[],null])assert.throws(()=>summarizeSharedCostReview(example(),choices));
 for(const change of [{previewOnly:false},{currency:'USD'},{totalCents:'15001'},{totalCents:'1e4'},{companies:[]},{companies:[example().companies[0],example().companies[0]]},{companies:[{...example().companies[0],amountCents:'-1'}]}])assert.throws(()=>summarizeSharedCostReview({...example(),...change}));
});
