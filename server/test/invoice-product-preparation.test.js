import {mappingConfirmationUserId} from "../src/lib/supplier-mapping-confirmation-actor.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import express from 'express';
import {invoiceProductCost,previewInvoiceProduct,confirmInvoiceProduct,registerInvoiceProductPreparation} from '../src/lib/invoice-product-preparation.js';
import {fixture,isolated} from './helpers/invoice-product-preparation-fixture.js';
const user={id:'owner',companyId:'company',role:'OWNER'};
const payload=p=>({requestId:crypto.randomUUID(),storeId:'store',version:p.version,reviewed:true,mode:'NEW',name:p.proposal.name,barcode:'',categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'vat13',salePrice:2,allowPosPriceChange:true,unit:'PIECE'});
// Exercise the unchanged production supplier-learning helper, not a mock insert.
const source=readFileSync(new URL('../src/routes/purchase-order-ocr-resolution.js',import.meta.url),'utf8');
const learning=new Function('id','mappingConfirmationUserId',source.slice(source.indexOf('async function learnSupplierMapping('),source.indexOf('registerInvoiceProductPreparation(router,'))+';return learnSupplierMapping;')(()=>crypto.randomUUID(),mappingConfirmationUserId);
const snapshot=async db=>{const result={};for(const table of ['Product','ProductBarcode','StoreProduct','StockMovement','StoreOperatorAudit','PurchaseOrderLine','SupplierProductMapping','SupplierProductLink'])result[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);return result};
test('preparation requires an explicit selected store before database access',async()=>{for(const [u,store] of [[user,''],[{...user,storeId:'control'},'store'],[{},'store']]){let reads=0;await assert.rejects(()=>previewInvoiceProduct({$queryRaw:()=>{reads++;throw Error('unexpected')}},u,'order','line',store),e=>e.status===403);assert.equal(reads,0)}});
test('native actual HTTP preview/read-only and concurrent no-barcode confirmation keep economics, control stock, one product and learning',{skip:!isolated()},async()=>{
 const f=await fixture();let server;try{
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=user;next()});registerInvoiceProductPreparation(app,f.db,learning);app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/order/ocr-lines/line`,request=async(path,body)=>{const r=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,data:await r.json()}};
  const before=await snapshot(f.db),p=await request('/product-proposal?storeId=store');assert.equal(p.status,200);assert.equal(p.data.proposal.barcode,'');assert.equal(p.data.proposal.vatDepartmentId,'','same-rate ambiguity is not guessed');assert.equal(p.data.proposal.salePrice,null);assert.equal(p.data.proposal.costPrice,22/24);assert.deepEqual(await snapshot(f.db),before);
  for(const query of ['', '?storeId=foreign','?storeId=control'])assert.ok((await request('/product-proposal'+query)).status>=400);
  const body=payload(p.data),pair=await Promise.all([request('/confirm-product',body),request('/confirm-product',body)]);assert.deepEqual(pair.map(x=>x.status),[200,200]);assert.equal(pair[0].data.productId,pair[1].data.productId);assert.equal(pair.filter(x=>!x.data.idempotent).length,1);
  const after=await snapshot(f.db);assert.equal(after.Product.length,1);assert.equal(after.ProductBarcode.length,0);assert.equal(after.StockMovement.length,0);assert.equal(after.StoreProduct.length,2);assert.deepEqual(after.StoreProduct.find(x=>x.row.storeId==='control'),before.StoreProduct[0]);assert.equal(Number(after.StoreProduct.find(x=>x.row.storeId==='store').row.currentStock),0);assert.equal(after.Product[0].row.allowPosPriceChange,true);assert.equal(after.Product[0].row.vatDepartmentId,'vat13');assert.equal(after.SupplierProductMapping.length,1);assert.equal(after.SupplierProductLink.length,1);assert.equal(after.StoreOperatorAudit.length,2);
  const strip=x=>{const {productId,resolutionStatus,updatedAt,...rest}=x;return rest};assert.deepEqual(strip(after.PurchaseOrderLine[0].row),strip(before.PurchaseOrderLine[0].row));
  assert.equal((await request('/confirm-product',{...body,name:'Different'})).status,409);assert.deepEqual(await snapshot(f.db),after);
 }finally{if(server)await new Promise(r=>server.close(r));await f.close()}
});
test('native stale/closed/foreign/invalid review cases and late learning failure roll back every business write',{skip:!isolated()},async()=>{
 for(const variant of ['stale','closed','vat','rate','category','subcategory','review','supplier','rollback']){
 const f=await fixture();try{const p=await previewInvoiceProduct(f.db,user,'order','line','store'),b=payload(p);
 if(variant==='stale')await f.db.$executeRaw`UPDATE "PurchaseOrderLine" SET "quantity"=3 WHERE "id"='line'`;
 if(variant==='closed')await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"='order'`;
 if(variant==='vat')b.vatDepartmentId='foreign';if(variant==='rate')await f.db.$executeRaw`UPDATE "ManagementVatDepartment" SET "vatRate"=24 WHERE "id"='vat13'`;
 if(variant==='category')b.categoryId='foreign';if(variant==='subcategory')b.subcategoryId='foreign';if(variant==='review')b.reviewed=false;
 if(variant==='supplier')await f.db.$executeRaw`UPDATE "Supplier" SET "active"=false`;
 const before=await snapshot(f.db);await assert.rejects(()=>confirmInvoiceProduct(f.db,user,'order','line',b,variant==='rollback'?async()=>{throw Error('late learning failure')}:learning));assert.deepEqual(await snapshot(f.db),before,variant);
 }finally{await f.close()}}
});
test('native existing-name/supplier/barcode guards prevent duplicates; reviewed existing match adds barcode once and preserves existing card/stock',{skip:!isolated()},async()=>{
 const f=await fixture();try{
 const p=await previewInvoiceProduct(f.db,user,'order','line','store'),b=payload(p),first=await confirmInvoiceProduct(f.db,user,'order','line',b,learning);
 await f.db.$executeRaw`INSERT INTO "PurchaseOrderLine" SELECT 'line2',"orderId",NULL,'SUP2',"description",NULL,"quantity","unitCost","netAmount","exciseTotal","vatRate","grossAmount","invoiceUnit","stockUnitsPerInvoiceUnit","discount1","discount2","discount3",'UNRESOLVED',NOW() FROM "PurchaseOrderLine" WHERE "id"='line'`;
 const next=await previewInvoiceProduct(f.db,user,'order','line2','store');assert.equal(next.identities[0].id,first.productId);assert.equal(next.proposal.salePrice,2);assert.equal(next.reference.id,first.productId);
 const body={...payload(next),mode:'EXISTING',productId:first.productId,barcode:'5200000000001'};const before=await snapshot(f.db);
 await assert.rejects(()=>confirmInvoiceProduct(f.db,user,'order','line2',payload(next),learning),e=>e.status===409);assert.deepEqual(await snapshot(f.db),before);
 await confirmInvoiceProduct(f.db,user,'order','line2',body,learning);await confirmInvoiceProduct(f.db,user,'order','line2',body,learning);const after=await snapshot(f.db);assert.deepEqual(after.Product,before.Product);assert.deepEqual(after.StoreProduct,before.StoreProduct);assert.equal(after.ProductBarcode.length,1);assert.equal(after.StockMovement.length,0);
 }finally{await f.close()}
});

// Regression from actual hosted ΔΕΛΤΑ28897 display: ΤΜΧ is a known piece alias.
test('explicit printed piece/package aliases compute cost without changing source; unknown units/factors remain review-only',()=>{
 for(const invoiceUnit of ['PIECE','ΤΜΧ','ΤΜΧ.','ΤΕΜ','ΤΕΜΑΧΙΑ','PCS']){const row={invoiceUnit,stockUnitsPerInvoiceUnit:1,quantity:2,netAmount:3.13,exciseTotal:0},before=structuredClone(row);assert.equal(invoiceProductCost(row),1.565);assert.deepEqual(row,before)}
 for(const invoiceUnit of ['PACKAGE','ΚΒ','ΚΙΒ','ΠΑΚ.'])assert.equal(invoiceProductCost({invoiceUnit,stockUnitsPerInvoiceUnit:12,quantity:2,netAmount:21.6,exciseTotal:.4}),22/24);
 for(const row of [{invoiceUnit:'UNKNOWN',stockUnitsPerInvoiceUnit:1},{invoiceUnit:'ΤΜΧ',stockUnitsPerInvoiceUnit:12},{invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:null},{invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:1.5}])assert.equal(invoiceProductCost({...row,quantity:2,netAmount:3.13,exciseTotal:0}),null);
});
test('native real printed ΤΜΧ proposal and confirm use piece cost while retaining exact printed units and amounts',{skip:!isolated()},async()=>{
 const f=await fixture();try{
 await f.db.$executeRaw`UPDATE "PurchaseOrderLine" SET "invoiceUnit"='ΤΜΧ',"stockUnitsPerInvoiceUnit"=1 WHERE "id"='line'`;
 const p=await previewInvoiceProduct(f.db,user,'order','line','store');assert.equal(p.proposal.costPrice,11);const before=(await f.db.$queryRaw`SELECT * FROM "PurchaseOrderLine" WHERE "id"='line'`)[0];
 await confirmInvoiceProduct(f.db,user,'order','line',payload(p),learning);
 const after=(await f.db.$queryRaw`SELECT * FROM "PurchaseOrderLine" WHERE "id"='line'`)[0];for(const key of ['invoiceUnit','stockUnitsPerInvoiceUnit','quantity','unitCost','netAmount','grossAmount','vatRate','discount1'])assert.equal(String(after[key]),String(before[key]),key);
 assert.equal(Number((await f.db.$queryRaw`SELECT "costPrice" FROM "Product"`)[0].costPrice),11);assert.equal((await f.db.$queryRaw`SELECT * FROM "StockMovement"`).length,0);
 }finally{await f.close()}
});
