import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

const route=fs.readFileSync(new URL('../src/routes/purchase-orders.js',import.meta.url),'utf8');
const start=route.indexOf('export async function readStaffInvoiceProductReference');
const source=route.slice(start,route.indexOf('router.get("/:orderId/lines/:lineId/product-reference"',start));
const read=new Function('requireStaffGrant','staffError','n',source.replace('export async function','async function')+';return readStaffInvoiceProductReference')(
 ()=>assert.fail('expected grant fixture'),
 (status=403,code='STAFF_DENIED')=>Object.assign(new Error(code),{status,code}),
 Number
);

function fixture({deny=null,missing=false,overflow=false}={}){
 const trace=[];
 const user={staffAccess:true,companyId:'company',storeId:'store'};
 const req={user,staffGrant:{capability:'invoices.read'},params:{orderId:'order',lineId:'line'}};
 const tx={$queryRaw:async(parts,...params)=>{
  const sql=parts.join('?');
  if(sql.includes('FROM "PurchaseOrder"')){
   trace.push('scoped-line');assert.deepEqual(params,['order','line','company','store']);
   assert.match(sql,/p\."companyId"=o\."companyId"/);
   assert.match(sql,/sp\."storeId"=o\."storeId" AND sp\."active"=true/);
   assert.match(sql,/FOR SHARE OF o,l,p,sp/);
   return missing?[]:[{id:'product',name:'Scoped product',sku:'A123',salePrice:'2.50',currentStock:'3'}];
  }
  trace.push('barcodes');assert.match(sql,/FROM "ProductBarcode"/);assert.deepEqual(params,['product']);
  assert.doesNotMatch(sql,/"costPrice"|"salePrice"/);
  return Array.from({length:overflow?201:1},()=>({barcode:'123456789',name:'Pack',unitMultiplier:'6'}));
 }};
 return {trace,run:()=>read({$transaction:async fn=>fn(tx)},req,async(db,actor,store,key)=>{
  assert.equal(db,tx);assert.equal(actor,user);assert.equal(store,'store');
  trace.push(key);
  if(key===deny)throw Object.assign(new Error(key),{status:403});
 })};
}

test('invoice reference uses both read grants before resolving only the assigned store product',async()=>{
 const f=fixture();
 assert.deepEqual(await f.run(),{orderId:'order',lineId:'line',storeId:'store',product:{id:'product',name:'Scoped product',sku:'A123',salePrice:2.5,currentStock:3},barcodes:[{barcode:'123456789',name:'Pack',unitMultiplier:6}]});
 assert.deepEqual(f.trace,['invoices.read','products.read','scoped-line','barcodes']);
 const denied=fixture({deny:'products.read'});
 await assert.rejects(denied.run(),{status:403});
 assert.deepEqual(denied.trace,['invoices.read','products.read']);
 const absent=fixture({missing:true});
 await assert.rejects(absent.run(),{status:404});
 assert.deepEqual(absent.trace,['invoices.read','products.read','scoped-line']);
 await assert.rejects(fixture({overflow:true}).run(),{status:422});
});

test('the new invoice line route exposes only reads, without opening global product or barcode writers',()=>{
 const root='/api/purchase-orders/order/lines/line/product-reference';
 assert.equal(staffRequestCapability('GET',root),'invoices.read');
 for(const method of ['POST','PATCH','DELETE']){
  assert.equal(staffRequestCapability(method,root),null);
  assert.equal(staffRequestCapability(method,'/api/purchase-orders/products/product/barcodes'),null);
 }
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order/lines/line/product-card'),null);
});
