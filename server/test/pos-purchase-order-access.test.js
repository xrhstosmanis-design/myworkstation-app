import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/middleware/pos-purchase-order-access.js',import.meta.url),'utf8');
const createPosPurchaseOrderAccess=new Function('prisma','requireStoreModule',source.replace(/^import .*;$/gm,'').replaceAll('export ', '')+';return createPosPurchaseOrderAccess;')({},()=>()=>{});

function fixture({orders=true,posAccess=true,orderStore='A',lineOrder='one',role='EMPLOYEE'}={}){
 const calls=[],entitlements=[];let granted=orders;
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('StoreOperatorCredential'))return values.includes('co')?[{backofficeMenu:{orders:granted},permissions:{},posAccess}]:[];
  if(sql.includes('PurchaseOrderLine'))return values.includes(lineOrder)?[{id:'line'}]:[];
  if(sql.includes('PurchaseOrder'))return values.includes(orderStore)&&values.includes('one')?[{id:'one',storeId:orderStore}]:[];
  throw Error(sql);
 }};
 const guard=createPosPurchaseOrderAccess(db,(req,res,next)=>{entitlements.push(req.params.storeId);next()});
 const run=async({path='/report',method='GET',query={},body={},tokenType='STORE_OPERATOR',companyId='co',baseUrl='/api/purchase-orders'}={})=>{
  const req={user:{id:'op',operatorId:'op',storeId:'A',companyId,tokenType,role},path,method,query,body,params:{},baseUrl};
  const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};let next=false,error;
  await guard(req,res,e=>{if(e)error=e;else next=true});if(error)throw error;return {req,res,next};
 };
 return {run,calls,entitlements,revoke:()=>{granted=false}};
}
test('existing orders checkbox grants employee and manager but neither role grants unchecked access',async()=>{
 for(const role of ['EMPLOYEE','MANAGER']){const yes=fixture({role});const result=await yes.run();assert.equal(result.next,true);assert.equal(result.req.query.storeId,'A');assert.deepEqual(yes.entitlements,['A']);assert.equal(result.req.posPurchaseOrderAccess.storeId,'A');const no=fixture({role,orders:false});assert.equal((await no.run()).res.code,403);assert.equal(no.entitlements.length,0)}
});
test('revocation is read from persisted profile on every request',async()=>{const f=fixture();assert.equal((await f.run({path:'/one/detail'})).next,true);f.revoke();assert.equal((await f.run({path:'/one/detail'})).res.code,403)});
test('cross-store filters/body/orders and mismatched line ids fail before any write handler',async()=>{
 const f=fixture();for(const args of [{query:{storeId:'B'}},{path:'/',method:'POST',body:{storeId:'B'}},{path:'/other/detail'},{path:'/one/lines/line',method:'PATCH'}])assert.equal((await f.run(args)).next,args.path==='/one/lines/line');
 assert.equal((await fixture({orderStore:'B'}).run({path:'/one/detail'})).res.code,404);
 assert.equal((await fixture({lineOrder:'other'}).run({path:'/one/lines/line',method:'PATCH'})).res.code,404);
});
test('draft creation, corrections and normal finalization retain scoped guarded route access',async()=>{
 const f=fixture();for(const args of [{path:'/',method:'POST',body:{storeId:'A'}},{path:'/one',method:'PATCH',body:{status:'FINAL'}},{path:'/one/lines',method:'POST'},{path:'/one/lines/line',method:'PATCH'},{path:'/one/lines/line',method:'DELETE'},{path:'/one/reconcile-ocr-total',method:'POST'}])assert.equal((await f.run(args)).next,true);
});
test('email, central product/barcode management, deletion and unknown routes remain unavailable',async()=>{
 const f=fixture();for(const args of [{path:'/one/email',method:'POST'},{path:'/products/p/barcodes',method:'POST'},{path:'/one/lines/line/product-card',method:'PATCH'},{path:'/one',method:'DELETE'},{path:'/stock-proposal'},{path:'/one/unknown',method:'POST'}])assert.equal((await f.run(args)).res.code,403);
});
test('OCR and assistant access remains scoped, extra barcode write requires existing barcode right',async()=>{
 const f=fixture();for(const tail of ['ocr-lines','ocr-lines/line/search','ocr-lines/line/options','ocr-lines/line/catalog-matches','invoice-assistant/source'])assert.equal((await f.run({baseUrl:'/api/commerce/purchase-orders',path:'/one/'+tail})).next,true);
 assert.equal((await f.run({baseUrl:'/api/commerce/purchase-orders',path:'/one/ocr-lines/line/catalog-matches',method:'POST'})).res.code,403);
 assert.equal((await f.run({baseUrl:'/api/commerce/purchase-orders',path:'/one/ocr-lines/line/resolve-existing',method:'POST',body:{addBarcode:true}})).res.code,403);
 for(const barcodeMode of ['PROVIDED','GENERATED'])assert.equal((await f.run({baseUrl:'/api/commerce/purchase-orders',path:'/one/ocr-lines/line/create-product',method:'POST',body:{barcodeMode}})).res.code,403);
 assert.equal((await f.run({baseUrl:'/api/commerce/purchase-orders',path:'/other/invoice-assistant/preview',method:'POST'})).res.code,404);
});
test('missing tenant/POS access deny; normal administrative paths remain unchanged',async()=>{assert.equal((await fixture().run({companyId:null})).res.code,403);assert.equal((await fixture().run({companyId:'foreign'})).res.code,403);assert.equal((await fixture({posAccess:false}).run()).res.code,403);const f=fixture({orders:false});assert.equal((await f.run({tokenType:undefined})).res.code,403);assert.equal((await f.run({tokenType:'USER'})).next,true);assert.equal(f.calls.length,1)});
