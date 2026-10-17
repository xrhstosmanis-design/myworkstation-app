import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySupplierMergePlan,supplierMergeCode,applyInventorySupplierMerge} from '../src/lib/inventory-supplier-merge.js';
const link=(id,productId,supplierCode,active=true,supplierId='supplier')=>({id,productId,supplierCode,active,supplierId});
test('same supplier/code keeps target link and unions active state without mutating originals',()=>{
 const rows=[link('source','old',' code 2 '),link('target','keep','CODE2',false)],before=structuredClone(rows);
 const [plan]=inventorySupplierMergePlan(rows,'keep');
 assert.deepEqual(plan,{supplierId:'supplier',keepId:'target',archiveIds:['source'],supplierCode:'CODE2',active:true,codes:['CODE2']});
 assert.deepEqual(rows,before);
});
test('blank source and target codes preserve the only known supplier code',()=>{
 for(const rows of [[link('a','keep',''),link('b','old','001')],[link('a','keep','001'),link('b','old',null)]]){
  const [plan]=inventorySupplierMergePlan(rows,'keep');assert.equal(plan.supplierCode,'001');assert.deepEqual(plan.codes,['001']);
 }
 assert.deepEqual(inventorySupplierMergePlan([link('a','keep',null,false),link('b','old','',false)],'keep')[0].codes,[]);
 assert.equal(inventorySupplierMergePlan([link('a','keep',null,false)],'keep')[0].active,false);
});
test('multiple source links select a deterministic keeper and separate supplier groups',()=>{
 const rows=[link('b','old2','X'),link('a','old1','X'),link('c','old1','Y',true,'other')];
 assert.deepEqual(inventorySupplierMergePlan(rows,'keep'),inventorySupplierMergePlan([...rows].reverse(),'keep'));
 const plan=inventorySupplierMergePlan(rows,'keep').find(p=>p.supplierId==='supplier');
 assert.equal(plan.keepId,'a');assert.deepEqual(plan.archiveIds,['b']);
});
test('different supplier codes and leading zero differences require review',async()=>{
 assert.equal(supplierMergeCode(' a b '),'AB');
 const plan=inventorySupplierMergePlan([link('a','keep','001'),link('b','old','1')],'keep');
 assert.equal(plan[0].codes.length,2);
 let writes=0;await assert.rejects(applyInventorySupplierMerge({$executeRaw:()=>{writes++}},'co','keep',plan),/Διαφορετικοί/);assert.equal(writes,0);
});
