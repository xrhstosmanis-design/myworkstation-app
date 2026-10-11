import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==="test"&&["localhost","127.0.0.1","postgres"].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test("native PostgreSQL named category/store report reuses sale sums, excludes future/credit/foreign/open rows, and refuses unattributed offer returns",{skip:!isolated()},async()=>{
 const {PrismaClient}=await import("@prisma/client"),admin=new PrismaClient(),schema="voice_sales_"+randomUUID().replaceAll("-","");
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set("schema",schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"categoryId" text,"masterProductId" text,"costPrice" numeric)',
   'CREATE TABLE "ProductCategory"("id" text primary key,"companyId" text,"name" text)',
   'CREATE TABLE "MasterProduct"("id" text primary key,"subcategoryName" text)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric)',
   'CREATE TABLE "PriceCatalogPromotion"("id" text primary key,"companyId" text,"active" bool)',
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"status" text,"transactionMode" text,"source" text,"occurredAt" timestamp,"originalSaleId" text)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text)',
   'CREATE TABLE "PurchaseDocumentLine"("purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric)',
   'CREATE TABLE "PurchaseDocument"("id" text,"supplierId" text,"companyId" text,"storeId" text,"status" text,"documentDate" timestamp,"createdAt" timestamp)',
   'CREATE TABLE "Supplier"("id" text,"name" text)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','c','LAB'),('control','c','CONTROL'),('foreign','x','FOREIGN')`;
  await db.$executeRaw`INSERT INTO "ProductCategory" VALUES('cat','c','ΝΕΡΑ')`;
  await db.$executeRaw`INSERT INTO "Product" VALUES('p','c','ΝΕΡΟ 500ML','2269','PIECE','cat',NULL,.09),('l','c','ΝΕΡΟ ΧΥΜΑ','L','LITER','cat',NULL,.1),('foreign','x','ΝΕΡΟ 500ML','F','PIECE',NULL,NULL,1)`;
  await db.$executeRaw`INSERT INTO "PriceCatalogPromotion" VALUES('promo','c',false)`;
  for(const [id,store,company,status,mode,source,date,original] of [
   ["sale","s","c","COMPLETED","NORMAL","POS","2026-10-10T10:00:00Z",null],["return","s","c","COMPLETED","NORMAL","POS_REVERSAL","2026-10-10T11:00:00Z","sale"],
   ["control","control","c","COMPLETED","NORMAL","POS","2026-10-10T10:00:00Z",null],["litre","s","c","COMPLETED","NORMAL","POS","2026-10-10T12:00:00Z",null],
   ["future","s","c","COMPLETED","NORMAL","POS","2026-10-20T10:00:00Z",null],["credit","s","c","COMPLETED","CREDIT","POS","2026-10-10T10:00:00Z",null],
   ["open","s","c","OPEN","NORMAL","POS","2026-10-10T10:00:00Z",null],["foreign","foreign","x","COMPLETED","NORMAL","POS","2026-10-10T10:00:00Z",null]
  ])await db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},${mode},${source},${new Date(date)},${original})`;
  for(const [sale,product,quantity,total,promo] of [["sale","p",4,2,"promo"],["return","p",-1,-.5,"promo"],["control","p",3,1.5,null],["litre","l",1.5,2.25,null],["future","p",100,50,"promo"],["credit","p",100,50,"promo"],["open","p",100,50,"promo"],["foreign","foreign",100,50,"promo"]])
   await db.$executeRaw`INSERT INTO "SaleLine" VALUES(${sale+"line"},${sale},${product},'Water',${quantity},.5,0,13,${total},${promo},${promo?"LEAFLET":null})`;
  const {readSalesAnalysisReport}=await import("../src/routes/kiosk-reports-sales-v4.js"),{readSalesNamesCatalog,readAssistantSalesStores}=await import("../src/services/assistant-sales-stores.js");
  const access={scope:"PLATFORM_AUTHORIZED_STORES",stores:[{companyId:"c",companyName:"Company",storeId:"s",storeName:"LAB"},{companyId:"c",companyName:"Company",storeId:"control",storeName:"CONTROL"}],excluded:[],truncated:false};
  const options={readReport:f=>readSalesAnalysisReport(f,{db}),readCatalog:c=>readSalesNamesCatalog(c,{db}),now:new Date("2026-10-11T18:00:00Z")};
  const args={mode:"category",names:["νερά"],from:"2026-10-01",to:"2026-10-31"};
  const out=await readAssistantSalesStores(args,access,options);assert.equal(out.result,"matched");assert.equal(out.rows.length,3);assert.equal(out.totals.grossSales,5.25);assert.deepEqual(new Set(out.totals.quantities.map(q=>JSON.stringify(q))),new Set([{unit:"PIECE",quantity:6},{unit:"LITER",quantity:1.5}].map(JSON.stringify)));
  const offers=await readAssistantSalesStores({...args,mode:"offers",names:[]},access,options);assert.equal(offers.result,"matched");assert.equal(offers.rows.length,1);assert.equal(offers.totals.grossSales,1.5);assert.equal(offers.rows[0].salesQuantity,3);assert.equal(offers.rows[0].promotionId,"promo");
  await db.$executeRaw`INSERT INTO "Sale" VALUES('missing','c','s','COMPLETED','NORMAL','POS_REVERSAL','2026-10-10T13:00:00'::timestamp,'sale')`;
  await db.$executeRaw`INSERT INTO "SaleLine" VALUES('missingline','missing','p','Water',-1,.5,0,13,-.5,NULL,NULL)`;
  const limited=await readAssistantSalesStores({...args,mode:"offers",names:[]},access,options);assert.equal(limited.result,"source_limited");assert.equal(limited.totals,null);assert.deepEqual(limited.rows,[]);assert.match(limited.reason,/επιστροφές/);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
