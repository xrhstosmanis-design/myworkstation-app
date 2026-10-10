import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('const removeSupplierCode='),source.indexOf('const loadComposition='));
function remove(draft,indices){
  let state={product:{id:'p1'},draft};
  const context={setEdit:updater=>{state=updater(state)}};
  vm.createContext(context);vm.runInContext(handler+';globalThis.removeSupplierCode=removeSupplierCode;',context);
  indices.forEach(i=>context.removeSupplierCode(i));
  return JSON.parse(JSON.stringify(state));
}
test('removing last selected supplier clears legacy name and prevents name-based resurrection',()=>{
  const draft={name:'Product',supplierName:'Vendor A',supplierCodes:[{supplierId:'a',supplierCode:'A'},{supplierId:'b',supplierCode:'B'}],barcodes:[{barcode:'123'}],salePrice:'2.4'};
  const state=remove(draft,[1,0]);
  assert.deepEqual(state.draft.supplierCodes,[]);assert.equal(state.draft.supplierName,'');
  assert.equal(state.draft.name,'Product');assert.equal(state.draft.salePrice,'2.4');assert.deepEqual(state.draft.barcodes,draft.barcodes);
  assert.equal(draft.supplierCodes.length,2);
});
test('removing one row preserves remaining vendor/code and legacy name',()=>{
  const state=remove({supplierName:'Vendor A',supplierCodes:[{supplierId:'a',supplierCode:'A'},{supplierId:'b',supplierCode:'B'}]},[1]);
  assert.deepEqual(state.draft.supplierCodes,[{supplierId:'a',supplierCode:'A'}]);assert.equal(state.draft.supplierName,'Vendor A');
});
