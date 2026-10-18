import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalesAnalysisReport} from '../src/routes/kiosk-reports-sales-v4.js';
const filter={companyId:'c',storeId:'s',from:new Date('2026-10-01'),to:new Date('2026-11-01')};
const item=(id='p')=>({productId:id,name:id,grossSales:2,netSales:2,vatValue:0,costValue:.5,salesQuantity:1,normalSaleCount:1,reversalCount:1,returnGrossValue:1});
const rows=(items,total=items.length,normal=1,reversal=1)=>items.length?items.map(r=>({...r,_hasGroup:true,_totalGroupCount:total,_overallNormalSaleCount:normal,_overallReversalCount:reversal})):[{_hasGroup:null,_totalGroupCount:0,_overallNormalSaleCount:0,_overallReversalCount:0}];
const read=source=>readSalesAnalysisReport(filter,{db:{$queryRaw:async()=>source}});
test('overall baskets use full-source counts while per-product counts and amounts stay intact',async()=>{
 const out=await read(rows([item('p'),item('q')]));
 assert.equal(out.normalSaleCount,1);assert.equal(out.reversalCount,1);
 assert.equal(out.items.reduce((n,r)=>n+r.normalSaleCount,0),2);assert.equal(out.items.reduce((n,r)=>n+r.reversalCount,0),2);
 assert.equal(out.totalGross,4);assert.equal(out.totalCost,1);assert.equal(out.totalProfit,3);
 assert.deepEqual(out.sourceCoverage,{complete:true,returnedGroupCount:2,totalGroupCount:2,limit:10000,totalsScope:'COMPLETE_SOURCE'});
 assert.ok(out.items.every(r=>Object.keys(r).every(key=>!key.startsWith('_'))));
});
test('two baskets sharing one product remain two baskets',async()=>{const out=await read(rows([{...item(),normalSaleCount:2}],1,2,0));assert.equal(out.normalSaleCount,2);assert.equal(out.items[0].normalSaleCount,2)});
test('empty SQL sentinel yields a certified empty report without a phantom product',async()=>{
 const out=await read(rows([]));assert.deepEqual(out.items,[]);assert.equal(out.count,0);assert.equal(out.normalSaleCount,0);assert.equal(out.reversalCount,0);assert.equal(out.totalGross,0);assert.equal(out.sourceCoverage.complete,true);
});
test('overflow retains compatible returned monetary sums but labels their scope; exact cap is complete',async()=>{
 const items=Array.from({length:10000},(_,i)=>item(String(i)));
 const out=await read(rows(items,10001,10001,2));assert.equal(out.normalSaleCount,10001);assert.equal(out.totalGross,20000);
 assert.deepEqual(out.sourceCoverage,{complete:false,returnedGroupCount:10000,totalGroupCount:10001,limit:10000,totalsScope:'RETURNED_GROUPS'});
 assert.equal((await read(rows(items,10000,10000,0))).sourceCoverage.complete,true);
});
test('unavailable or contradictory SQL metadata cannot become a complete zero or summed-basket report',async()=>{
 for(const source of [[],[item()],rows([item()],2),rows([item()],1,-1),[{_hasGroup:null,_totalGroupCount:0,_overallNormalSaleCount:1,_overallReversalCount:0}],rows([item(),item('q')]).map((r,i)=>({...r,_overallNormalSaleCount:i+1}))])await assert.rejects(read(source),e=>e.status===502);
});
