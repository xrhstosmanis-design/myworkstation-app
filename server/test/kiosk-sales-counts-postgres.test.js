import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readSalesAnalysisReport} from "../src/routes/kiosk-reports-sales-v4.js";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
// Also invoked by the isolated local PostgreSQL-WASM runner; the production
// reader and this exact fixture are shared, not a second SQL implementation.
export async function runSalesCountsRegression(db){
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"categoryId" text,"masterProductId" text,"costPrice" numeric)',
   'CREATE TABLE "ProductCategory"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "MasterProduct"("id" text primary key,"subcategoryName" text,"categoryName" text)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric)',
   'CREATE TABLE "PriceCatalogPromotion"("id" text primary key,"companyId" text,"active" bool)',
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"status" text,"transactionMode" text,"source" text,"occurredAt" timestamp,"originalSaleId" text)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text)',
   'CREATE TABLE "PurchaseDocumentLine"("purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric)',
   'CREATE TABLE "PurchaseDocument"("id" text,"supplierId" text,"companyId" text,"storeId" text,"status" text,"documentDate" timestamp,"createdAt" timestamp)',
   'CREATE TABLE "Supplier"("id" text,"name" text)'
  ])await db.$executeRawUnsafe(sql);
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB'),('control','c','CONTROL'),('foreign','x','FOREIGN')`;
 await db.$executeRaw`INSERT INTO "Product" VALUES('p','c','Alpha','A','PIECE',NULL,NULL,.2),('q','c','Beta','B','PIECE',NULL,NULL,.3)`;
 await db.$executeRaw`INSERT INTO "PriceCatalogPromotion" VALUES('promo','c',false)`;
 const sale=async(id,{store='s',company='c',status='COMPLETED',mode='NORMAL',source='POS',date='2026-10-10T10:00:00Z'}={})=>db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},${mode},${source},${new Date(date)},NULL)`;
 const line=async(id,saleId,productId,{quantity=1,total=2,promo=null}={})=>db.$executeRaw`INSERT INTO "SaleLine" VALUES(${id},${saleId},${productId},${productId},${quantity},2,0,0,${total},${promo},${promo?'LEAFLET':null})`;
 const filters={companyId:'c',storeId:'s',from:new Date('2026-10-01'),to:new Date('2026-11-01')};
 const read=extra=>readSalesAnalysisReport({...filters,...extra},{db});
 await sale('basket');await line('bp','basket','p',{promo:'promo'});await line('bq','basket','q');
 await sale('return',{source:'POS_REVERSAL',date:'2026-10-10T11:00:00Z'});await line('rp','return','p',{quantity:-1,total:-2,promo:'promo'});await line('rq','return','q',{quantity:-1,total:-2});
 let out=await read();assert.equal(out.normalSaleCount,1);assert.equal(out.reversalCount,1);assert.equal(out.items.length,2);assert.equal(out.totalGross,0);assert.equal(out.totalCost,0);assert.equal(out.items.reduce((a,r)=>a+r.normalSaleCount,0),2);assert.equal(out.items.reduce((a,r)=>a+r.reversalCount,0),2);
 assert.deepEqual(out.sourceCoverage,{complete:true,returnedGroupCount:2,totalGroupCount:2,limit:10000,totalsScope:'COMPLETE_SOURCE'});assert.ok(out.items.every(r=>!Object.keys(r).some(k=>k.startsWith('_'))));
 await sale('second');await line('sp','second','p');out=await read();assert.equal(out.normalSaleCount,2);assert.equal(out.reversalCount,1);assert.equal(out.totalGross,2);assert.equal(out.items.find(r=>r.productId==='p').normalSaleCount,2);
 for(const [id,settings] of [['control',{store:'control'}],['foreign',{company:'x',store:'foreign'}],['open',{status:'OPEN'}],['credit',{mode:'CREDIT'}],['outside',{date:'2026-11-01T00:00:00Z'}]]){await sale(id,settings);await line(id+'line',id,'p',{total:99})}
 out=await read();assert.equal(out.normalSaleCount,2);assert.equal(out.totalGross,2);assert.equal(out.items.length,2);
 const before=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale") AS sales,(SELECT COUNT(*)::int FROM "SaleLine") AS lines`;
 out=await read({q:'Beta'});assert.equal(out.normalSaleCount,1);assert.equal(out.reversalCount,1);assert.equal(out.items.length,1);assert.equal(out.totalGross,0);
 out=await read({productIds:['p']});assert.equal(out.normalSaleCount,2);assert.equal(out.reversalCount,1);assert.equal(out.items.length,1);
 out=await read({promotionsOnly:true});assert.equal(out.normalSaleCount,1);assert.equal(out.reversalCount,1);assert.equal(out.items.length,1);assert.equal(out.items[0].promotionId,'promo');assert.equal(out.totalGross,0);
 out=await read({observedThrough:new Date('2026-10-10T10:30:00Z')});assert.equal(out.normalSaleCount,2);assert.equal(out.reversalCount,0);assert.equal(out.totalGross,6);
 out=await read({storeId:'control'});assert.equal(out.normalSaleCount,1);assert.equal(out.totalGross,99);
 out=await read({q:'no-match'});assert.deepEqual(out.items,[]);assert.equal(out.normalSaleCount,0);assert.equal(out.reversalCount,0);assert.equal(out.totalGross,0);assert.deepEqual(out.sourceCoverage,{complete:true,returnedGroupCount:0,totalGroupCount:0,limit:10000,totalsScope:'COMPLETE_SOURCE'});
 assert.deepEqual(await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale") AS sales,(SELECT COUNT(*)::int FROM "SaleLine") AS lines`,before);
 // 10001 distinct groups and baskets prove full-source aggregation before LIMIT.
 await db.$executeRawUnsafe(`INSERT INTO "Sale" SELECT 'cap-sale-'||g,'c','s','COMPLETED','NORMAL','POS','2026-10-10T10:00:00'::timestamp,NULL FROM generate_series(1,10001)g`);
 await db.$executeRawUnsafe(`INSERT INTO "SaleLine" SELECT 'cap-line-'||g,'cap-sale-'||g,'cap-product-'||g,'cap-'||g,1,1,0,0,1,NULL,NULL FROM generate_series(1,10001)g`);
 out=await read({q:'cap-'});assert.equal(out.normalSaleCount,10001);assert.equal(out.reversalCount,0);assert.equal(out.items.length,10000);assert.equal(out.totalGross,10000);assert.deepEqual(out.sourceCoverage,{complete:false,returnedGroupCount:10000,totalGroupCount:10001,limit:10000,totalsScope:'RETURNED_GROUPS'});
 await db.$executeRaw`DELETE FROM "SaleLine" WHERE "id"='cap-line-10001'`;
 out=await read({q:'cap-'});assert.equal(out.normalSaleCount,10000);assert.equal(out.sourceCoverage.complete,true);assert.equal(out.sourceCoverage.totalsScope,'COMPLETE_SOURCE');
}
test('native PostgreSQL canonical sales counts, empty sentinel, filtered source and capped monetary coverage',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='sales_counts_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runSalesCountsRegression(db)}finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
