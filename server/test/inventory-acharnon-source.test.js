import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateAcharnonSkus} from '../src/routes/inventory-acharnon-source.js';

test('Acharnon SKU allocation uses the canonical company lock and bigint sequence without mutating preview rows',async()=>{
 const calls=[],rows=[{sku:'',sourceKey:'old-1'},{sku:'',sourceKey:'old-2'}];
 const db={$executeRaw:async(q,...v)=>calls.push([q.join('?'),v]),$queryRaw:async q=>q.join('').includes('StoreProduct')?[]:[{next:9007199254740993n}]};
 const result=await allocateAcharnonSkus(db,'company','store',rows);
 assert.deepEqual(result.map(r=>r.sku),['9007199254740993','9007199254740994']);
 assert.deepEqual(rows.map(r=>r.sku),['','']);assert.equal(calls.length,1);assert.deepEqual(calls[0][1],['company:product-sku']);
});

test('Acharnon allocation rejects a populated store, invalid sequence and exhausted bigint range',async()=>{
 for(const [populated,next] of [[true,10001],[false,'invalid'],[false,0],[false,9223372036854775807n]]){
  const db={$executeRaw:async()=>{},$queryRaw:async q=>q.join('').includes('StoreProduct')?(populated?[{id:'existing'}]:[]):[{next}]};
  await assert.rejects(allocateAcharnonSkus(db,'company','store',[{},{}]),e=>e.status===409);
 }
});
