import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the actual editor handlers with a mocked tenant API, without a database.
const source=fs.readFileSync(new URL('../../client/src/components/commerce/ManagementVatDepartmentsPanel.jsx',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('const openEdit=async'),source.indexOf(';const applyBulk=async'));
function harness(details,cardError=null){
  const product={id:'p1',sku:'TEST',name:'Test',categoryId:'cat',subcategoryId:'sub',categoryName:'Test category',unit:'PIECE',salePrice:1.2,costPrice:0.4,vatRate:13,vatVerified:true,barcodes:[{id:'barcode-1',barcode:'123',unitMultiplier:2,salePrice:2,name:'pack'}],stores:[{storeId:'lab',active:true,salePrice:1.5,minStock:3}]};
  const calls=[];const context={editing:null,editDraft:null,data:{page:3},error:'',busy:false,api:async(url,options)=>{calls.push({url,options});if(url.includes('/catalog?'))return [product];if(url.endsWith('/details')){if(details instanceof Error)throw details;return details}if(url.endsWith('/card')){assert.deepEqual(JSON.parse(options.body).expectedBarcodeIds,['barcode-1']);if(cardError)throw cardError;return {ok:true}};throw new Error('Unexpected endpoint '+url)},setBusy:v=>context.busy=v,setError:v=>context.error=v,setEditing:v=>context.editing=v,setEditDraft:v=>context.editDraft=v,setEditCategories:v=>context.editCategories=v,load:async page=>{context.loadedPage=page}};
  vm.createContext(context);vm.runInContext(handlers+';globalThis.openEdit=openEdit;globalThis.saveEdit=saveEdit;',context);
  return {context,calls,product};
}
test('name edit roundtrips multiple supplier IDs/codes and barcode/store metadata, returns to same page',async()=>{
  const suppliers=[{supplierId:'supplier-a',supplierCode:'A-001'},{supplierId:'supplier-b',supplierCode:'B-009'}];
  const {context,calls}=harness({supplierCodes:suppliers});await context.openEdit({id:'p1',sku:'TEST'});assert.equal(context.editing,'p1');context.editDraft.name='Changed name';await context.saveEdit();
  const body=JSON.parse(calls.find(c=>c.url.endsWith('/card')).options.body);
  assert.deepEqual(body.supplierCodes,suppliers);assert.equal(body.name,'Changed name');assert.equal(body.vatRate,13);assert.equal(body.categoryId,'cat');assert.deepEqual(body.barcodes,[{barcode:'123',unitMultiplier:2,salePrice:2,name:'pack'}]);assert.deepEqual(body.stores,[{storeId:'lab',active:true,salePrice:1.5,minStock:3}]);assert.equal(context.loadedPage,3);assert.equal(context.editing,null);
});
test('failed or malformed supplier read does not expose editor or permit save',async()=>{
  for(const details of [new Error('Read failed'),{}, {supplierCodes:null}]){const {context,calls}=harness(details);await context.openEdit({id:'p1',sku:'TEST'});assert.equal(context.editing,null);assert.equal(context.editDraft,null);assert.ok(context.error);await context.saveEdit();assert.equal(calls.some(c=>c.url.endsWith('/card')),false);assert.equal(context.busy,false)}
});
test('verified empty supplier list and null supplier code are supported',async()=>{
  for(const suppliers of [[],[{supplierId:'supplier-a',supplierCode:null}]]){const {context,calls}=harness({supplierCodes:suppliers});await context.openEdit({id:'p1',sku:'TEST'});await context.saveEdit();assert.deepEqual(JSON.parse(calls.find(c=>c.url.endsWith('/card')).options.body).supplierCodes,suppliers.map(s=>({...s,supplierCode:s.supplierCode||''})))}
});

test('stale barcode rejection retains the open draft and does not refresh the page',async()=>{
  const {context,calls}=harness({supplierCodes:[]},new Error('Τα barcodes άλλαξαν. Άνοιξε ξανά.'));
  await context.openEdit({id:'p1',sku:'TEST'});context.editDraft.name='Changed name';await context.saveEdit();
  assert.equal(context.editing,'p1');assert.equal(context.editDraft.name,'Changed name');
  assert.match(context.error,/barcodes/);assert.equal(context.loadedPage,undefined);assert.equal(context.busy,false);
  assert.equal(calls.filter(c=>c.url.endsWith('/card')).length,1);
});
