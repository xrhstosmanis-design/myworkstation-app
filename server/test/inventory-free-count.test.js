import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';

const run=async(scopeType,lines,lockedScope=scopeType)=>{
 const writes=[],stocks=lines.map(l=>({productId:l.productId,currentStock:l.expectedQuantity}));
 const tx={$queryRaw:async strings=>{
  const sql=strings.join('?');
  if(sql.includes('FROM "Stocktake"'))return [{id:'take',status:'DRAFT',scopeType:lockedScope}];
  return sql.includes('FROM "StoreProduct"')?stocks:lines;
 },$executeRaw:async(strings,...values)=>{writes.push({sql:strings.join('?'),values});return 1}};
 let error;try{await finalizeInventoryStocktake(tx,{id:'take',companyId:'c',storeId:'s',scopeType},'owner','Counted products checked')}catch(e){error=e}
 return {writes,error};
};
const lines=[{productId:'counted',expectedQuantity:10,countedQuantity:7,unitCost:2,recountRequired:false},{productId:'uncounted',expectedQuantity:15,countedQuantity:null,unitCost:3,recountRequired:false},{productId:'zero',expectedQuantity:5,countedQuantity:0,unitCost:1,recountRequired:false}];
test('FREE posts only measured quantities including zero and records exact scope',async()=>{
 const r=await run('FREE',lines);assert.equal(r.error,undefined);
 const snapshot=JSON.parse(r.writes[0].values[1]);assert.equal(snapshot.lineCount,2);assert.equal(snapshot.totalDifference,-8);assert.equal(snapshot.scopeType,'FREE');
 const updates=r.writes.filter(x=>x.sql.includes('UPDATE "StoreProduct"'));assert.deepEqual(updates.map(x=>[x.values[2],x.values[0]]),[['counted',-3],['zero',-5]]);
 assert.equal(r.writes.some(x=>x.values.includes('uncounted')),false);
});
test('legacy FULL/PARTIAL remain strict; FREE empty/recount fail without writes',async()=>{
 for(const scope of ['FULL','PARTIAL_PRODUCTS','PARTIAL_CATEGORIES']){const r=await run(scope,lines);assert.equal(r.error.status,409);assert.deepEqual(r.writes,[])}
 for(const rows of [[lines[1]],[{...lines[0],recountRequired:true}]]){const r=await run('FREE',rows);assert.equal(r.error.status,409);assert.deepEqual(r.writes,[])}
});
test('scope observed under parent lock wins over stale access lookup',async()=>{
 assert.equal((await run('FULL',lines,'FREE')).error,undefined);
 const r=await run('FREE',lines,'FULL');assert.equal(r.error.status,409);assert.deepEqual(r.writes,[]);
});
