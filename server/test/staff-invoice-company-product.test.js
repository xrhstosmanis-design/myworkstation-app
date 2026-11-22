import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {invoiceProductBarcodesCapability,invoiceProductCardCapability,staffCompanyRequestCapability} from '../../shared/backoffice-staff-company.mjs';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

const source=readFileSync(new URL('../src/services/staff-invoice-company-product.js',import.meta.url),'utf8')
 .replace(/^import .*;$/gm,'').replace('export async function','async function');
const create=new Function('randomUUID','z','invoiceProductBarcodesCapability','invoiceProductCardCapability',
 'requireStaffAction','requireStaffGrant','staffError','requireStaffCompanyGrant',source+';return staffInvoiceCompanyProduct');
const updatedAt='2026-11-22T09:40:00.000Z';

function fixture({kind='card',method='PATCH',deny=false,duplicate=false,product={},body={}}={}){
 const trace=[],params={orderId:'order',lineId:'line'};
 const user={staffAccess:true,id:'actor',companyId:'company',storeId:'store'};
 const req={method,user,params,get:()=>undefined,staffGrant:{capability:method==='PATCH'?'invoices.edit':'invoices.read'},
  body:{confirmed:true,productId:'product',...(kind==='card'?{name:'New title',salePrice:4.99,expectedUpdatedAt:updatedAt}:body.action==='DELETE'?{}:
   {action:'ADD',barcode:'123456789',unitMultiplier:6,salePrice:null,name:null}),...body}};
 const tx={
  $queryRaw:async(parts,...values)=>{
   const sql=parts.join('?');
   if(sql.includes('FROM "PurchaseOrder"')){
    trace.push('scoped-product');
    assert.deepEqual(values,['order','line','company','store']);
    assert.match(sql,/FOR UPDATE OF o,l,p,sp/);
    return [{id:'product',name:'Old title',salePrice:3,status:'NEW',awaitingInvoice:false,updatedAt,...product}];
   }
   if(sql.includes('pg_advisory_xact_lock')){trace.push('barcode-lock');return []}
   if(sql.includes('DISTINCT FROM')){trace.push('barcode-duplicate');return duplicate?[{id:'other'}]:[]}
   if(sql.includes('FOR UPDATE')){trace.push('scoped-barcode');assert.deepEqual(values,['barcode-id','product']);return [{id:'barcode-id',updatedAt}]}
   trace.push('read-barcodes');return [];
  },
  $executeRaw:async(parts,...values)=>{
   const sql=parts.join('?');
   assert.doesNotMatch(sql,/"StoreProduct"|"PurchaseOrderLine"/);
   if(sql.includes('"BackofficeStaffAudit"')){trace.push('audit');assert.deepEqual(values.slice(1,4),['company','actor','actor']);return}
   if(sql.includes('"ProductPriceHistory"')){trace.push('price-history');return}
   if(sql.includes('UPDATE "Product"')){trace.push('update-product');assert.deepEqual(values,['New title',4.99,'product','company']);return}
   if(sql.includes('DELETE FROM "ProductBarcode"')){trace.push('delete-barcode');return}
   trace.push('write-barcode');
  }
 };
 const run=create(()=>'new-id',z,invoiceProductBarcodesCapability,invoiceProductCardCapability,
  async(db,request,store,cap)=>{assert.equal(db,tx);assert.equal(request,req);assert.equal(store,'store');trace.push(cap)},
  async(db,actor,store,cap)=>{assert.equal(db,tx);assert.equal(actor,user);assert.equal(store,'store');trace.push(cap)},
  (status=403,code='denied')=>Object.assign(new Error(code),{status,code}),
  async(db,actor,cap)=>{assert.equal(db,tx);assert.equal(actor.id,'actor');assert.equal(actor.companyId,'company');assert.equal(actor.storeId,undefined);trace.push(cap);
   if(deny)throw Object.assign(new Error('denied'),{status:403})});
 return {trace,run:()=>run({$transaction:async fn=>fn(tx)},req,kind)};
}

test('the invoice company card requires explicit company rights plus store rights before product writes',async()=>{
 const denied=fixture({deny:true});await assert.rejects(denied.run(),{status:403});
 assert.deepEqual(denied.trace,[invoiceProductCardCapability]);
 const f=fixture();assert.equal((await f.run()).ok,true);
 assert.deepEqual(f.trace,[invoiceProductCardCapability,'products.read','invoices.edit','scoped-product','price-history','update-product','audit']);
 for(const options of [{product:{status:'FINAL'}},{body:{productId:'foreign'}},{body:{expectedUpdatedAt:'2026-11-22T09:39:00.000Z'}}])
  await assert.rejects(fixture(options).run(),{status:409});
});

test('separate barcode grant preserves company collision checks and scopes removal to a reviewed row',async()=>{
 const f=fixture({kind:'barcodes'});assert.equal((await f.run()).ok,true);
 assert.deepEqual(f.trace,[invoiceProductBarcodesCapability,'products.read','invoices.edit','scoped-product','barcode-lock','barcode-duplicate','write-barcode','audit']);
 const duplicate=fixture({kind:'barcodes',duplicate:true});await assert.rejects(duplicate.run(),{status:409,code:'STAFF_PRODUCT_BARCODE_DUPLICATE'});
 assert.equal(duplicate.trace.includes('write-barcode'),false);
 const edit=fixture({kind:'barcodes',body:{action:'EDIT',id:'barcode-id',expectedUpdatedAt:updatedAt}});
 assert.equal((await edit.run()).ok,true);
 assert.ok(edit.trace.includes('scoped-barcode'));
 const del=fixture({kind:'barcodes',body:{action:'DELETE',id:'barcode-id',expectedUpdatedAt:updatedAt}});
 assert.equal((await del.run()).ok,true);
 assert.deepEqual(del.trace.slice(-3),['scoped-barcode','delete-barcode','audit']);
});

test('company catalogue editor routes do not open company mode or legacy writes',()=>{
 const path='/api/purchase-orders/order/lines/line/product-company-card';
 assert.equal(staffRequestCapability('GET',path),'invoices.read');
 assert.equal(staffRequestCapability('PATCH',path),'invoices.edit');
 assert.equal(staffRequestCapability('DELETE',path),null);
 assert.equal(staffCompanyRequestCapability('PATCH',path),null);
 assert.equal(staffRequestCapability('PATCH','/api/purchase-orders/order/lines/line/product-card'),null);
});
