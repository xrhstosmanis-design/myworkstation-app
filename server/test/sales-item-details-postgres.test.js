import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalesItemDetails} from '../src/services/sales-item-details.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native sales details keep historical costs, all101 identities, store overrides, returns, unknown costs and read-only totals',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  const tables={
   Store:'"id" text primary key,"companyId" text,"name" text,"active" bool',
   Product:'"id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"categoryId" text,"subcategoryId" text,"masterProductId" text,"productCompanyId" text,"costPrice" numeric,"salePrice" numeric',
   ProductBarcode:'"productId" text,"barcode" text',
   ProductCategory:'"id" text primary key,"companyId" text,"name" text',
   ProductSubcategory:'"id" text primary key,"companyId" text,"name" text',
   MasterProduct:'"id" text primary key,"subcategoryName" text,"categoryName" text,"brandName" text',
   ManagementProductCompany:'"id" text primary key,"companyId" text,"name" text',
   StoreProduct:'"storeId" text,"productId" text,"currentStock" numeric,"salePrice" numeric,"categoryIdOverride" text,"subcategoryIdOverride" text',
   PriceCatalogPromotion:'"id" text primary key,"companyId" text',
   Sale:'"id" text primary key,"companyId" text,"storeId" text,"status" text,"transactionMode" text,"source" text,"occurredAt" timestamp,"originalSaleId" text',
   SaleLine:'"id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text',
   PurchaseDocument:'"id" text,"supplierId" text,"companyId" text,"storeId" text,"status" text,"documentDate" timestamp,"createdAt" timestamp,"sourceType" text,"purchaseOrderId" text,"documentNumber" text',
   PurchaseDocumentLine:'"id" text,"purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric,"createdAt" timestamp,"quantity" numeric,"netAmount" numeric',
   PurchaseOrder:'"id" text,"companyId" text,"storeId" text,"supplierId" text,"invoiceNumber" text,"status" text',
   PurchaseOrderLine:'"orderId" text,"productId" text,"quantity" numeric,"netAmount" numeric,"resolutionStatus" text,"invoiceUnit" text,"stockUnitsPerInvoiceUnit" numeric',
   StockMovement:'"id" text,"sourceType" text,"sourceId" text,"storeId" text,"productId" text,"movementType" text,"unitCost" numeric,"createdAt" timestamp',
   Supplier:'"id" text,"companyId" text,"name" text'
  };
  for(const [name,columns] of Object.entries(tables))await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${name}"(${columns}) ON COMMIT DROP`);
  await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Selected',true),('control','c','Control',true),('foreign','x','Foreign',true)`);
  await tx.$executeRawUnsafe(`INSERT INTO "ProductCategory" VALUES('base','c','Base'),('override','c','Selected category'),('x','x','FOREIGN CATEGORY')`);
  await tx.$executeRawUnsafe(`INSERT INTO "ProductSubcategory" VALUES('sub','c','Selected subcategory')`);
  await tx.$executeRawUnsafe(`INSERT INTO "MasterProduct" VALUES('master','Old subcategory','Old category','Brand')`);
  await tx.$executeRawUnsafe(`INSERT INTO "ManagementProductCompany" VALUES('maker','c','Maker'),('foreign-maker','x','FOREIGN MAKER')`);
  await tx.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'p'||g,'c','Same name','SKU'||g,'PIECE','base',NULL,'master','maker',CASE WHEN g=100 THEN NULL ELSE .5 END,1.24 FROM generate_series(0,100)g`);
  await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 's',"id",100,2.5,'override','sub' FROM "Product"`);
  await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'control',"id",500,999,'x',NULL FROM "Product"`);
  await tx.$executeRawUnsafe(`UPDATE "StoreProduct" SET "salePrice"=0 WHERE "storeId"='s' AND "productId"='p0'`);
  await tx.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('sale','c','s','COMPLETED','NORMAL','POS','2026-03-29T10:00:00',NULL),('return','c','s','COMPLETED','NORMAL','POS_REVERSAL','2026-03-30T10:00:00','sale'),('control','c','control','COMPLETED','NORMAL','POS','2026-03-29T10:00:00',NULL),('foreign','x','foreign','COMPLETED','NORMAL','POS','2026-03-29T10:00:00',NULL)`);
  await tx.$executeRawUnsafe(`INSERT INTO "SaleLine" SELECT 'line'||g,'sale','p'||g,'Historical same',1,1.24,0,24,1.24,NULL,NULL FROM generate_series(0,100)g`);
  await tx.$executeRawUnsafe(`INSERT INTO "SaleLine" VALUES('returnline','return','p0','Historical same',-1,1.24,0,24,-1.24,NULL,NULL),('controlline','control','p0','CONTROL',1,999,0,0,999,NULL,NULL),('foreignline','foreign','p0','FOREIGN',1,999,0,0,999,NULL,NULL)`);
  await tx.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","status","documentDate","createdAt") VALUES('old','c','s','APPROVED','2026-03-01','2026-03-01'),('later','c','s','APPROVED','2026-03-30','2026-03-30')`);
  await tx.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","unit","unitCost","createdAt") VALUES('oldline','old','p0','PIECE',.2,'2026-03-01'),('laterline','later','p0','PIECE',.9,'2026-03-30')`);
  const snapshot=()=>tx.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale")::int AS sales,(SELECT SUM("lineTotal") FROM "SaleLine") AS gross,(SELECT SUM("currentStock") FROM "StoreProduct") AS stock`;
  const before=await snapshot(),filters={companyId:'c',storeId:'s',from:'2026-03-28',to:'2026-03-30',timeZone:'Europe/Athens'};
  const out=await readSalesItemDetails(filters,{db:tx});assert.equal(out.products.length,101);assert.equal(out.sourceCoverage.complete,true);assert.equal(out.period.days,3);
  assert.ok(Math.abs(out.summary.revenue-124)<1e-8);assert.ok(Math.abs(out.summary.dailyRevenue-124/3)<1e-8);
  assert.equal(out.summary.missingCostProducts,1);assert.equal(out.summary.costValue,null);
  const p=out.products.find(row=>row.productId==='p0');assert.equal(p.quantity,0);assert.equal(p.costValue,0);assert.equal(p.currentRetail,0);assert.equal(p.category,'Selected category');assert.equal(p.subcategory,'Selected subcategory');assert.equal(p.companyName,'Maker');
  const last=out.products.find(row=>row.productId==='p100');assert.equal(last.costValue,null);assert.equal(last.profit,null);
  assert.ok(!JSON.stringify(out).includes('FOREIGN'));assert.ok(out.products.every(row=>row.currentRetail!==999));
  await assert.rejects(readSalesItemDetails({...filters,companyId:'other'}, {db:tx}),{status:404});
  assert.deepEqual(await snapshot(),before);
 },{timeout:55000});}finally{await db.$disconnect()}
});
