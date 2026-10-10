import test from 'node:test';
import assert from 'node:assert/strict';
import {fitsSourcePrice,supportsSourceCost,assertSourceCostStorage,ensureProductCostPrecision} from '../src/product-cost-precision.js';

test('price validation rejects any precision loss including tiny seventh decimal',()=>{
  for(const value of [0,0.64602,0.719037,87.8,0.000001])assert.ok(fitsSourcePrice(value,6),value);
  for(const value of [0.6460201,0.0000001,0.7190370001,-1,NaN,Infinity,10000000000,null])assert.equal(fitsSourcePrice(value,6),false,String(value));
  assert.equal(fitsSourcePrice(0.64602,4),false);
  assert.equal(fitsSourcePrice(2.25,4),true);
});
test('compatible and wider numeric storage is accepted without migration; never narrow it',async()=>{
  for(const column of [{data_type:'numeric',numeric_precision:16,numeric_scale:6},{data_type:'numeric',numeric_precision:20,numeric_scale:10},{data_type:'numeric',numeric_precision:null,numeric_scale:null}]){
    assert.ok(supportsSourceCost(column));
    const db={$queryRaw:async()=>[column],$transaction:async()=>assert.fail('unexpected alteration')};
    await ensureProductCostPrecision(db);await assertSourceCostStorage(db);
  }
});
test('unexpected storage blocks bootstrap without attempting any writes',async()=>{
  for(const column of [{data_type:'numeric',numeric_precision:12,numeric_scale:4},{data_type:'numeric',numeric_precision:12,numeric_scale:6},{data_type:'double precision'},undefined]){
    const db={$queryRaw:async()=>column?[column]:[],$transaction:async()=>assert.fail('unexpected alteration')};
    await assert.rejects(()=>ensureProductCostPrecision(db),/Unexpected/);
    await assert.rejects(()=>assertSourceCostStorage(db),e=>e.status===409);
  }
});
