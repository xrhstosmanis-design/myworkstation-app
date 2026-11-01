import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileInventory} from '../src/services/inventory-reconciliation.js';
const t = hour => `2026-10-01T${String(hour).padStart(2,'0')}:00:00.000Z`;
function fixture(){
  return {previous:{id:'old',companyId:'c',storeId:'s',status:'FINALIZED',startedAt:t(1),finalizedAt:t(4)},
    current:{id:'new',companyId:'c',storeId:'s',status:'FINALIZED',startedAt:t(8),finalizedAt:t(12)},
    previousLines:[{id:'a',productId:'p',name:'Είδος',sku:'001',countedAt:t(2),countedQuantity:100,unitCost:2}],
    currentLines:[{id:'b',productId:'p',name:'Είδος',sku:'001',countedAt:t(10),countedQuantity:70,unitCost:2}],
    events:[{id:'e1',stocktakeId:'old',lineId:'a',eventType:'COUNT',countedQuantity:100,expectedQuantity:105,createdAt:t(2)},
      {id:'e2',stocktakeId:'new',lineId:'b',eventType:'COUNT',countedQuantity:70,expectedQuantity:80,createdAt:t(10)}],
    movements:[{id:'baseline',productId:'p',movementType:'STOCKTAKE_ADJUSTMENT',quantity:-5,sourceType:'INVENTORY_V2',sourceId:'old',createdAt:t(4)},
      {id:'sale',productId:'p',movementType:'SALE',quantity:-25,sourceId:'sale1',createdAt:t(6)},
      {id:'purchase',productId:'p',movementType:'PURCHASE',quantity:5,sourceId:'invoice1',createdAt:t(7)},
      {id:'after-count',productId:'p',movementType:'SALE',quantity:-3,sourceId:'sale2',createdAt:t(11)}]};
}
test('count-time reconciliation excludes opening adjustment and sales after individual count; retains input',()=>{
  const input=fixture(),original=structuredClone(input),report=reconcileInventory(input),row=report.rows[0];
  assert.equal(row.expectedQuantity,80);assert.equal(row.difference,-10);assert.equal(row.differenceValue,-20);
  assert.equal(report.summary.shortageQuantity,10);assert.equal(report.summary.shortageValue,20);assert.equal(report.summary.netValue,-20);
  assert.deepEqual(row.movements.map(x=>[x.id,x.balanceBefore,x.balanceAfter]),[['baseline',100,100],['sale',100,75],['purchase',75,80]]);
  assert.equal(row.movements[0].included,false);assert.equal(report.status,'REVIEW_REQUIRED');assert.deepEqual(input,original);
});
test('sale during the previous count-to-finalization interval belongs in the interval once',()=>{
  const input=fixture();input.movements[1].createdAt=t(3);const row=reconcileInventory(input).rows[0];
  assert.equal(row.expectedQuantity,80);assert.equal(row.movements.filter(x=>x.id==='sale').length,1);
});
test('each product uses its own count boundary and missing count never becomes a zero shortage',()=>{
  const input=fixture();input.currentLines.push({id:'other',productId:'other',countedQuantity:0,unitCost:2});
  const report=reconcileInventory(input),row=report.rows.find(x=>x.productId==='other');
  assert.equal(row.difference,null);assert.equal(row.expectedQuantity,null);assert.equal(report.summary.uncomputedItems,1);assert.equal(report.summary.netValue,null);assert.equal(report.summary.netQuantity,null);assert.equal(report.summary.shortageQuantity,null);
});
test('zero, null and invalid cost do not become zero-valued losses or definitive totals',()=>{
  for(const cost of [null,0,'',undefined,'bad',-1]){const input=fixture();input.currentLines[0].unitCost=cost;
    const report=reconcileInventory(input);assert.equal(report.rows[0].difference,-10);assert.equal(report.rows[0].unitCost,null);assert.equal(report.rows[0].differenceValue,null);assert.equal(report.summary.shortageValue,null);assert.equal(report.summary.netValue,null);}
});
test('late invoice, missing reference and duplicate key are findings; actual postings are not silently removed',()=>{
  const input=fixture();input.movements[2].documentDate='2026-09-01';input.movements[1].sourceId=null;
  input.movements[1].idempotencyKey='same';input.movements[2].idempotencyKey='same';
  const row=reconcileInventory(input).rows[0];assert.equal(row.expectedQuantity,80);
  for(const flag of ['LATE_DOCUMENT','MISSING_MOVEMENT_REFERENCE','DUPLICATE_POSTING_KEY'])assert.ok(row.findings.includes(flag));
});
test('system stock zeroing is visible as nonphysical correction, never physical receipt',()=>{
  const input=fixture();input.movements.push({id:'zero',productId:'p',movementType:'STOCK_ADJUSTMENT',quantity:12,sourceId:'zero1',createdAt:t(9)});
  const row=reconcileInventory(input).rows[0];assert.equal(row.incoming,5);assert.equal(row.systemAdjustments,12);assert.equal(row.expectedQuantity,92);assert.ok(row.findings.includes('NON_PHYSICAL_ADJUSTMENT'));
});
test('recount is immutable history, CLEAR and inconsistent history cannot produce a computed result',()=>{
  const input=fixture();input.events.push({...input.events[1],id:'recount',eventType:'RECOUNT',previousQuantity:70,countedQuantity:75,createdAt:t(11)});
  assert.equal(reconcileInventory(input).rows[0].difference,null);
  input.currentLines[0].countedQuantity=75;input.currentLines[0].countedAt=t(11);
  const row=reconcileInventory(input).rows[0];assert.equal(row.difference,-2);assert.equal(row.countHistory.length,3);
  input.events.at(-1).eventType='CLEAR';assert.equal(reconcileInventory(input).rows[0].difference,null);
});
test('returns, gifts, transfers and cancellation postings retain signs without double synthesis',()=>{
  const input=fixture();input.movements=[['GIFT',12],['RETURN',2],['SUPPLIER_RETURN',-3],['TRANSFER_IN',4],['TRANSFER_OUT',-5],['CANCEL',1]].map(([movementType,quantity],i)=>({id:String(i),productId:'p',sourceId:String(i),movementType,quantity,createdAt:t(6)}));
  const row=reconcileInventory(input).rows[0];assert.equal(row.incoming,19);assert.equal(row.outgoing,8);assert.equal(row.expectedQuantity,111);assert.equal(row.movements.length,6);
});
test('reject foreign stores/companies, same draft, reversed and overlapping periods',()=>{
  for(const change of [x=>x.current.storeId='foreign',x=>x.current.companyId='foreign',x=>x.current.id='old',x=>x.current.status='DRAFT',x=>x.previous.finalizedAt=t(9)]){const input=fixture();change(input);assert.throws(()=>reconcileInventory(input),{status:409});}
});
test('opposite differences remain separate for distinct stable product identities',()=>{
  const input=fixture();input.previousLines=[{...input.previousLines[0],countedQuantity:244},{id:'c',productId:'other',countedQuantity:0,countedAt:t(2)}];
  input.currentLines=[{...input.currentLines[0],countedQuantity:0},{id:'d',productId:'other',countedQuantity:233,countedAt:t(10),unitCost:2}];
  input.movements=[];input.events=[['old','a',244,t(2)],['old','c',0,t(2)],['new','b',0,t(10)],['new','d',233,t(10)]].map(([stocktakeId,lineId,countedQuantity,createdAt],i)=>({id:String(i),stocktakeId,lineId,countedQuantity,expectedQuantity:countedQuantity,eventType:'COUNT',createdAt}));
  const report=reconcileInventory(input);assert.equal(report.summary.shortageQuantity,244);assert.equal(report.summary.surplusQuantity,233);assert.equal(report.summary.netQuantity,-11);assert.equal(report.coverage.identityGrouping,false);
});
export {fixture};
