import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {mappingConfirmationUserId} from '../src/lib/supplier-mapping-confirmation-actor.js';
import {fixture,isolated} from './helpers/invoice-product-preparation-fixture.js';
import {previewInvoiceProduct,confirmInvoiceProduct} from '../src/lib/invoice-product-preparation.js';
const source=readFileSync(new URL('../src/routes/purchase-order-ocr-resolution.js',import.meta.url),'utf8');
const learningSource=source.slice(source.indexOf('async function learnSupplierMapping('),source.indexOf('registerInvoiceProductPreparation(router,'));
const learn=new Function('id','mappingConfirmationUserId',learningSource+';return learnSupplierMapping;')(randomUUID,mappingConfirmationUserId);
const input={companyId:'company',supplierId:'supplier',supplierCode:'SUP1',productId:'p',description:'Synthetic item',userId:'operator',unitCost:2,discount1:5,unitsPerPackage:12};
test('actual shared learning keeps POS text attribution but never writes a credential into the User FK',async()=>{
 for(const actor of [{id:'operator',tokenType:'STORE_OPERATOR'},{id:'collision',tokenType:'STORE_OPERATOR',role:'SUPER_ADMIN'}]){
  const writes=[];await learn({$queryRaw:async()=>{throw Error('POS must not look up User')},$executeRaw:async(s,...v)=>writes.push({sql:s.join('?'),values:v})},{...input,userId:actor.id,actor});
  assert.equal(writes.length,2);assert.equal(writes[0].values.at(-1),actor.id);assert.equal(writes[1].values.at(-1),null);assert.equal(writes[1].values[9],5);
 }
 const writes=[];await learn({$executeRaw:async(s,...v)=>writes.push(v),$queryRaw:async()=>[{id:'owner'}]},{...input,userId:'owner',actor:{id:'owner',role:'OWNER'}});assert.equal(writes[1].at(-1),'owner');
 const error=Error('genuine write failure');await assert.rejects(()=>learn({$executeRaw:async()=>{throw error}},{...input,actor:{id:'operator',tokenType:'STORE_OPERATOR'}}),e=>e===error);
});
test('actual exact autoresolve carries full actor into its transactional learning callback',async()=>{
 const actor={id:'collision',tokenType:'STORE_OPERATOR'},calls=[];const tx={$executeRaw:async()=>1};
 const db={$queryRaw:async s=>s.join('').includes('FROM "PurchaseOrderLine"')?[{id:'line',supplierCode:'SUP1',description:'Synthetic',unitCost:2}]:[{productId:'p'}],$transaction:fn=>fn(tx)};
 const text=source.slice(source.indexOf('async function autoResolveExact('),source.indexOf('\nfunction validGtin('));
 const resolve=new Function('prisma','normCode','learnSupplierMapping',text+';return autoResolveExact;')(db,v=>v,async(t,args)=>{assert.equal(t,tx);calls.push(args)});
 assert.equal(await resolve('company',{id:'order',status:'NEW',supplierId:'supplier'},actor),1);assert.equal(calls[0].actor,actor);assert.equal(calls[0].userId,actor.id);
});
const snapshot=async db=>{const out={};for(const name of ['Product','ProductBarcode','StoreProduct','StockMovement','StoreOperatorAudit','PurchaseOrder','PurchaseOrderLine','SupplierProductMapping','SupplierProductLink'])out[name]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${name}" t ORDER BY row_to_json(t)::text`);return out};
async function routeFixture(){
 const f=await fixture();
 await f.db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD UNIQUE("storeId","productId")');
 await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ADD COLUMN "gift" bool, ADD COLUMN "markupPercent" numeric, ADD COLUMN "vatAmount" numeric, ADD COLUMN "proposedSalePrice" numeric');
 return f;
}
// Register and execute the actual reported create-product handler and owned-line SQL.
function createHandler(db,central=async()=>{}){
 const ownedText=source.slice(source.indexOf('async function ownedLine('),source.indexOf('\nasync function learnSupplierMapping('));
 const ownedLine=new Function('prisma',ownedText+';return ownedLine;')(db);
 let handler;const router={post(path,fn){assert.equal(path,'/:orderId/ocr-lines/:lineId/create-product');handler=fn}};
 const text=source.slice(source.indexOf('router.post("/:orderId/ocr-lines/:lineId/create-product"'),source.indexOf('\nexport default router;'));
 new Function('router','prisma','z','id','ownedLine','learnSupplierMapping','learnCentralInvoiceCorrection','ean13','generateInternalBarcode',text)(router,db,z,randomUUID,ownedLine,learn,central,()=>{throw Error('unexpected generated barcode')},()=>{throw Error('unexpected generated barcode')});
 return async(actor,body)=>{let status=200,data,error;const res={status(n){status=n;return this},json(v){data=v;return this}};await handler({user:{companyId:'company',...actor},params:{orderId:'order',lineId:'line'},body},res,e=>{error=e});if(error)throw error;return {status,data}};
}
const form={name:'Synthetic new item',supplierCode:'SUP1',barcodeMode:'PROVIDED',barcode:'5200000000018',quantity:3,unitCost:2,vatRate:13,salePrice:3};
test('native actual create-product route: legacy FK failure; POS collision, Owner, platform and invalid-user attribution preserve product/barcode/line atomicity',{skip:!isolated()},async()=>{
 for(const [actor,expected] of [[{id:'operator',tokenType:'STORE_OPERATOR'},null],[{id:'collision',tokenType:'STORE_OPERATOR',role:'SUPER_ADMIN'},null],[{id:'owner',role:'OWNER'},'owner'],[{id:'platform',role:'SUPER_ADMIN'},'platform'],[{id:'foreign-user',role:'OWNER'},null],[{id:'deleted',role:'OWNER'},null]]){
  const f=await routeFixture();try{
   await assert.rejects(()=>f.db.$executeRaw`INSERT INTO "SupplierProductMapping"("id","confirmedByUserId") VALUES('legacy','operator')`,/foreign key/);
   const before=await snapshot(f.db),result=await createHandler(f.db)(actor,form);assert.equal(result.status,201);
   const after=await snapshot(f.db);assert.equal(after.Product.length,1);assert.equal(after.ProductBarcode.length,1);assert.equal(after.ProductBarcode[0].row.productId,result.data.productId);assert.equal(after.PurchaseOrderLine[0].row.productId,result.data.productId);assert.equal(after.SupplierProductMapping[0].row.confirmedByUserId,expected);assert.equal(after.SupplierProductLink[0].row.updatedBy,actor.id);
   assert.equal(after.SupplierProductMapping[0].row.lastUnitCost,2);assert.equal(after.PurchaseOrderLine[0].row.netAmount,6);assert.equal(after.StoreProduct.find(x=>x.row.storeId==='store').row.currentStock,0);assert.deepEqual(after.StoreProduct.filter(x=>x.row.storeId==='control'),before.StoreProduct);assert.deepEqual(after.StockMovement,before.StockMovement);assert.deepEqual(after.PurchaseOrder,before.PurchaseOrder);
   // Actual ON CONFLICT mapping update keeps text identity and uses the same validated FK.
   await learn(f.db,{...input,productId:result.data.productId,userId:actor.id,actor});assert.equal((await f.db.$queryRaw`SELECT "confirmedByUserId","usageCount" FROM "SupplierProductMapping"`)[0].usageCount,2);
   const saved=await snapshot(f.db);assert.equal((await createHandler(f.db)(actor,form)).status,409);assert.deepEqual(await snapshot(f.db),saved,'existing barcode refusal performs no extra write');
  }finally{await f.close()}
 }
});
test('native actual route rolls product, barcode, store card, line and learning back on genuine late failure',{skip:!isolated()},async()=>{
 const f=await routeFixture();try{
  const before=await snapshot(f.db),failure=Error('synthetic downstream failure');
  await assert.rejects(()=>createHandler(f.db,async()=>{throw failure})({id:'operator',tokenType:'STORE_OPERATOR'},form),e=>e===failure);assert.deepEqual(await snapshot(f.db),before);
  await assert.rejects(()=>createHandler(f.db)({id:'operator',tokenType:'STORE_OPERATOR'},{...form,supplierCode:'FAIL'}),/check constraint/);assert.deepEqual(await snapshot(f.db),before);
 }finally{await f.close()}
});
test('native prepared-product caller passes POS actor; real FK, unchanged invoice economics, original audit and retry remain valid',{skip:!isolated()},async()=>{
 const f=await fixture();try{
  const actor={id:'collision',operatorId:'operator',tokenType:'STORE_OPERATOR',companyId:'company',storeId:'store'},before=await snapshot(f.db),p=await previewInvoiceProduct(f.db,actor,'order','line','store');
  const body={requestId:randomUUID(),storeId:'store',version:p.version,reviewed:true,mode:'NEW',name:'Synthetic prepared item',barcode:'5200000000025',categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'vat13',salePrice:2,allowPosPriceChange:true,unit:'PIECE'};
  const result=await confirmInvoiceProduct(f.db,actor,'order','line',body,learn),after=await snapshot(f.db);
  assert.equal(after.SupplierProductMapping[0].row.confirmedByUserId,null);assert.equal(after.SupplierProductLink[0].row.updatedBy,'collision');assert.ok(after.StoreOperatorAudit.some(x=>x.row.eventType==='INVOICE_PRODUCT_PREPARED'&&x.row.actorId==='collision'&&x.row.operatorId==='operator'));
  for(const k of ['quantity','unitCost','netAmount','grossAmount','invoiceUnit','stockUnitsPerInvoiceUnit','vatRate'])assert.equal(after.PurchaseOrderLine[0].row[k],before.PurchaseOrderLine[0].row[k],k);
  assert.equal(after.StockMovement.length,0);assert.equal((await confirmInvoiceProduct(f.db,actor,'order','line',body,learn)).productId,result.productId);assert.deepEqual(await snapshot(f.db),after);
 }finally{await f.close()}
});
