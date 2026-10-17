import test from 'node:test';
import assert from 'node:assert/strict';
import {lockActiveSaleProducts} from '../src/lib/inventory-sale-product-lock.js';
import {randomUUID} from 'node:crypto';
import {saveInventoryBulkCard,bulkCardPrice} from '../src/lib/inventory-bulk-card.js';
import {previewInventoryMerge,confirmInventoryMerge} from '../src/lib/inventory-product-merge.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('bulk modes round cents and reject negative prices',()=>{for(const [mode,value,result] of [['INCREASE_PERCENT',10,2.64],['DECREASE_PERCENT',10,2.16],['INCREASE_AMOUNT',.1,2.5],['DECREASE_AMOUNT',.1,2.3],['SET',0,0]])assert.equal(bulkCardPrice(2.4,mode,value),result);assert.throws(()=>bulkCardPrice(2,'DECREASE_AMOUNT',3))});
test('native bulk and four-card merge preserve control, history, stock and replay',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='inventory_merge_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const tables={
 StocktakeLine:'"id" text,"stocktakeId" text,"productId" text',OnlineOrderLine:'"id" text,"orderId" text,"productId" text',TableOrderLine:'"id" text,"orderId" text,"productId" text',RbsCapDriverV1Request:'"id" text,"companyId" text,"storeId" text,"status" text,"checkoutJson" jsonb',
 Store:'"id" text primary key,"companyId" text,"active" bool',
 Product:'"id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text default \'PIECE\',"salePrice" numeric default 2,"costPrice" numeric default 1,"categoryId" text,"subcategoryId" text,"vatDepartmentId" text default \'dep\',"vatRate" numeric default 13,"vatVerified" bool default true,"trackStock" bool default true,"active" bool default true,"isSet" bool default false,"isRecipe" bool default false,"eDeliveryEnabled" bool default false,"efoodEnabled" bool default false,"woltEnabled" bool default false,"updatedAt" timestamp default NOW()',
 StoreProduct:'"storeId" text,"productId" text,"salePrice" numeric,"currentStock" numeric default 0,"active" bool default true,"updatedAt" timestamp default NOW(),primary key("storeId","productId")',
 StoreOperatorAudit:'"id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb',
 ProductPriceHistory:'"id" text primary key,"companyId" text,"productId" text,"storeId" text,"oldPrice" numeric,"newPrice" numeric,"changeType" text,"createdByUserId" text',
 ManagementVatDepartment:'"id" text primary key,"companyId" text,"vatRate" numeric,"active" bool',
 ProductCategory:'"id" text primary key,"companyId" text,"active" bool',ProductSubcategory:'"id" text primary key,"companyId" text,"categoryId" text,"active" bool',
 ProductBarcode:'"id" text primary key,"productId" text,"barcode" text,"unitMultiplier" numeric default 1,"salePrice" numeric,"updatedAt" timestamp default NOW(),unique("productId","barcode")',
 SupplierProductLink:'"id" text primary key,"companyId" text,"productId" text,"supplierId" text,"supplierCode" text,"active" bool,"updatedAt" timestamp default NOW(),unique("companyId","supplierId","productId")',
 SupplierProductMapping:'"id" text primary key,"companyId" text,"productId" text,"updatedAt" timestamp default NOW()',
 ProductSetItem:'"id" text,"companyId" text,"productId" text,"relatedProductId" text',PreparationRecipeLine:'"id" text,"companyId" text,"productId" text,"ingredientProductId" text',
 PurchaseDocumentLine:'"id" text,"purchaseDocumentId" text,"productId" text,"netAmount" numeric',PurchaseOrderLine:'"id" text,"orderId" text,"productId" text',
 StoreBakedBalance:'"companyId" text,"storeId" text,"productId" text,"enabled" bool',
 StockMovement:'"id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text',SaleLine:'"id" text,"productId" text,"quantity" numeric,"lineTotal" numeric'
 };
 for(const name of ['CashShiftSession','Stocktake','PurchaseDocument','PurchaseOrder','OnlineOrder','TableOrder'])tables[name]='"id" text,"companyId" text,"storeId" text,"status" text';
 for(const [name,columns] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "Store" VALUES ('A','co',true),('B','co',true),('F','foreign',true)`;
 await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES ('dep','co',13,true),('dep24','co',24,true),('foreign','other',13,true)`;
 await db.$executeRaw`INSERT INTO "ProductCategory" VALUES ('cat','co',true),('foreign','other',true)`;
 await db.$executeRaw`INSERT INTO "ProductSubcategory" VALUES ('sub','co','cat',true),('wrong','co','other',true)`;
 await db.$executeRaw`INSERT INTO "Product"("id","companyId","name","sku") VALUES ('p1','co','ONE','1'),('p2','co','TWO','2'),('p3','co','THREE','3'),('p4','co','FOUR','4'),('control','co','CONTROL','C'),('shared','co','SHARED','S')`;
 await db.$executeRaw`INSERT INTO "StoreProduct"("storeId","productId","salePrice","currentStock") VALUES ('A','p1',2,-1),('A','p2',2,3),('A','p3',2,1),('A','p4',2,0),('B','control',9,20),('A','shared',2,4),('B','shared',5,30)`;
 await db.$executeRaw`INSERT INTO "ProductBarcode"("id","productId","barcode","salePrice") VALUES ('b1','p1','111',NULL),('b2','p2','222',1.5),('b3','p3','333',NULL)`;
 await db.$executeRaw`INSERT INTO "SupplierProductLink"("id","companyId","productId","supplierId","supplierCode","active") VALUES ('s2','co','p2','supplier2','CODE2',true)`;
 await db.$executeRaw`INSERT INTO "SupplierProductMapping"("id","companyId","productId") VALUES ('map','co','p2')`;
 await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('historic','co','A','APPROVED')`;
 await db.$executeRaw`INSERT INTO "PurchaseDocumentLine" VALUES ('hl','historic','p2',7.5)`;
 await db.$executeRaw`INSERT INTO "SaleLine" VALUES ('sale','p2',1,2)`;
 // A real POS source and its approved posting are separate preserved documents.
 await db.$executeRawUnsafe('ALTER TABLE "PurchaseDocument" ADD COLUMN "purchaseOrderId" text, ADD COLUMN "sourceType" text');
 await db.$executeRawUnsafe('ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceDocumentId" text, ADD COLUMN "sourceType" text');
 await db.$executeRawUnsafe('CREATE TABLE "PurchaseOrderPosting" ("orderId" text,"companyId" text,"purchaseDocumentId" text)');
 await db.$executeRaw`INSERT INTO "PurchaseDocument"("id","companyId","storeId","status","purchaseOrderId","sourceType") VALUES ('posted-source','co','A','DRAFT','posted-order','POS_OCR_DRAFT')`;
 await db.$executeRaw`INSERT INTO "PurchaseDocumentLine" VALUES ('posted-source-line','posted-source','p2',7.5)`;
 await db.$executeRaw`INSERT INTO "PurchaseOrder"("id","companyId","storeId","status","sourceDocumentId","sourceType") VALUES ('posted-order','co','A','INVOICED','posted-source','POS_OCR_DRAFT')`;
 await db.$executeRaw`INSERT INTO "PurchaseOrderPosting" VALUES ('posted-order','co','historic')`;
 const user={companyId:'co',role:'OWNER',id:'owner'},bulk={storeId:'A',requestId:randomUUID(),productIds:['shared'],priceMode:'INCREASE_PERCENT',priceValue:10,expectedPrices:{shared:2},categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'dep',vatRate:13};
 assert.equal((await saveInventoryBulkCard(db,user,bulk)).changed,1);assert.equal((await saveInventoryBulkCard(db,user,bulk)).idempotent,true);
 assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"='A' AND "productId"='shared'`)[0].salePrice),2.2);
 assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"='B' AND "productId"='shared'`)[0].salePrice),5);
 assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "Product" WHERE "id"='shared'`)[0].salePrice),2);
 for(const patch of [{categoryId:'foreign'},{subcategoryId:'wrong'},{vatDepartmentId:'foreign'},{vatDepartmentId:'dep24'},{expectedPrices:{shared:99}},{storeId:'F'}])await assert.rejects(saveInventoryBulkCard(db,user,{...bulk,requestId:randomUUID(),expectedPrices:{shared:2.2},...patch}));
 assert.equal((await db.$queryRaw`SELECT "id" FROM "ProductPriceHistory"`).length,1);
 await assert.rejects(saveInventoryBulkCard(db,{...user,tokenType:'STORE_OPERATOR'},bulk));
 const choice={storeId:'A',productIds:['p1','p2','p3','p4'],targetId:'p1'};
 assert.ok((await previewInventoryMerge(db,user,{...choice,productIds:['p1','shared']})).blockers.some(b=>b.includes('άλλο κατάστημα')));
 await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('shift','co','A','OPEN')`;
 assert.deepEqual((await previewInventoryMerge(db,user,choice)).blockers,[],'an open24h shift must not block merge');
 // Open unrelated work must not prevent merging selected cards.
 for(const [parent,line,key] of [['OnlineOrder','OnlineOrderLine','orderId'],['TableOrder','TableOrderLine','orderId'],['Stocktake','StocktakeLine','stocktakeId']]){
  const status=parent==='Stocktake'?'DRAFT':'OPEN';
  await db.$executeRawUnsafe(`INSERT INTO "${parent}" VALUES ('unrelated','co','A','${status}')`);
  await db.$executeRawUnsafe(`INSERT INTO "${line}" VALUES ('unrelated-line','unrelated','control')`);
  assert.deepEqual((await previewInventoryMerge(db,user,choice)).blockers,[]);
  await db.$executeRawUnsafe(`UPDATE "${line}" SET "productId"='p2'`);
  assert.equal((await previewInventoryMerge(db,user,choice)).blockers.length,1);
  await db.$executeRawUnsafe(`UPDATE "${line}" SET "productId"='control'`);
 }
 for(const status of ['PREPARED','CLAIMED','DISPATCHED','OPERATOR_CONFIRMED','REQUIRES_CHECK']){
  await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" VALUES ('pending','co','A',${status},${JSON.stringify({items:[{productId:'p2'}]})}::jsonb)`;
  assert.ok((await previewInventoryMerge(db,user,choice)).blockers.some(b=>b.includes('πληρωμή')));
  await db.$executeRaw`DELETE FROM "RbsCapDriverV1Request"`;
 }
 await db.$executeRaw`INSERT INTO "RbsCapDriverV1Request" VALUES ('done','co','A','SALE_COMMITTED','{"items":[{"productId":"p2"}]}'),('unrelated','co','A','DISPATCHED','{"resolvedItems":[{"productId":"control"}]}')`;
 await assert.rejects(db.$transaction(tx=>lockActiveSaleProducts(tx,{companyId:'foreign',storeId:'A',productIds:['p2']})),/καρτέλα/);

 const p=await previewInventoryMerge(db,user,choice);assert.deepEqual(p.blockers,[]);assert.equal(p.combinedStock,3);assert.equal(p.barcodes.length,3);
 const input={...choice,requestId:randomUUID(),previewHash:p.previewHash,confirm:true,reason:'Same item verified'};
 const beforePendingConflict=await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`;
 await db.$executeRaw`UPDATE "PurchaseDocument" SET "status"='DRAFT' WHERE "id"='historic'`;
 await assert.rejects(confirmInventoryMerge(db,user,input),/πρόχειρο παραστατικό/,'confirm must recheck a now-unproven posting');
 assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`,beforePendingConflict);
 assert.equal((await db.$queryRaw`SELECT "id" FROM "StockMovement"`).length,0);
 await db.$executeRaw`UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='historic'`;
 let releaseSale,lockedSale;const release=new Promise(r=>releaseSale=r),locked=new Promise(r=>lockedSale=r);
 const concurrentSale=db.$transaction(async tx=>{await lockActiveSaleProducts(tx,{companyId:'co',storeId:'A',productIds:['p2']});await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"-1,"updatedAt"=NOW() WHERE "storeId"='A' AND "productId"='p2'`;lockedSale();await release;},{timeout:15000});
 await locked;
 const duringSale=confirmInventoryMerge(db,user,input);const saleConflict=assert.rejects(duringSale,/άλλαξαν/);
 releaseSale();await concurrentSale;await saleConflict;
 assert.equal((await db.$queryRaw`SELECT "active" FROM "Product" WHERE "id"='p2'`)[0].active,true);
 await db.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=3 WHERE "storeId"='A' AND "productId"='p2'`;

 await db.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=2 WHERE "storeId"='A' AND "productId"='p3'`;
 await assert.rejects(confirmInventoryMerge(db,user,input),/άλλαξαν/);
 input.previewHash=(await previewInventoryMerge(db,user,choice)).previewHash;
 await db.$executeRawUnsafe(`CREATE FUNCTION fail_merge_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='INVENTORY_PRODUCT_MERGE' THEN RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END; $$`);
 await db.$executeRawUnsafe('CREATE TRIGGER fail_merge BEFORE INSERT ON "StoreOperatorAudit" FOR EACH ROW EXECUTE FUNCTION fail_merge_audit()');
 const before=await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`;
 await assert.rejects(confirmInventoryMerge(db,user,input),/isolated audit failure/);
 assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`,before);
 assert.equal((await db.$queryRaw`SELECT "id" FROM "StockMovement"`).length,0);
 assert.equal((await db.$queryRaw`SELECT "productId" FROM "ProductBarcode" WHERE "id"='b2'`)[0].productId,'p2');
 await db.$executeRawUnsafe('DROP TRIGGER fail_merge ON "StoreOperatorAudit"');
 const results=await Promise.all([confirmInventoryMerge(db,user,input),confirmInventoryMerge(db,user,input)]);assert.ok(results.every(r=>r.ok));assert.equal(results.filter(r=>r.idempotent).length,1);
 assert.equal((await confirmInventoryMerge(db,user,input)).idempotent,true);
 await assert.rejects(db.$transaction(tx=>lockActiveSaleProducts(tx,{companyId:'co',storeId:'A',productIds:['p2']})),/συγχωνεύτηκε/);
 await db.$transaction(tx=>lockActiveSaleProducts(tx,{companyId:'co',storeId:'A',productIds:['p1']}));
 assert.equal((await db.$queryRaw`SELECT "status" FROM "CashShiftSession" WHERE "id"='shift'`)[0].status,'OPEN');

 const stocks=await db.$queryRaw`SELECT "productId","currentStock","active" FROM "StoreProduct" WHERE "storeId"='A' AND "productId" IN ('p1','p2','p3','p4') ORDER BY "productId"`;
 assert.deepEqual(stocks.map(r=>Number(r.currentStock)),[4,0,0,0]);assert.deepEqual(stocks.map(r=>r.active),[true,false,false,false]);
 assert.equal((await db.$queryRaw`SELECT "id" FROM "Product"`).length,6);
 assert.equal((await db.$queryRaw`SELECT "productId" FROM "SaleLine"`)[0].productId,'p2');assert.equal((await db.$queryRaw`SELECT "productId" FROM "PurchaseDocumentLine" WHERE "id"=\'hl\'`)[0].productId,'p2');
 assert.equal((await db.$queryRaw`SELECT "status" FROM "PurchaseDocument" WHERE "id"='posted-source'`)[0].status,'DRAFT','merge must not approve or delete original source');
 assert.equal((await db.$queryRaw`SELECT "productId" FROM "PurchaseDocumentLine" WHERE "id"='posted-source-line'`)[0].productId,'p2','historical source product identity retained');
 assert.equal((await db.$queryRaw`SELECT * FROM "PurchaseOrderPosting"`).length,1,'no invoice posting replay');
 const movements=await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`;assert.equal(movements.length,4);assert.equal(movements.reduce((n,r)=>n+Number(r.quantity),0),0);
 assert.equal((await db.$queryRaw`SELECT "productId" FROM "ProductBarcode" WHERE "id"='b2'`)[0].productId,'p1');assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "ProductBarcode" WHERE "id"='b2'`)[0].salePrice),1.5);
 assert.equal((await db.$queryRaw`SELECT "productId" FROM "SupplierProductMapping"`)[0].productId,'p1');
 assert.equal(Number((await db.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='B' AND "productId"='control'`)[0].currentStock),20);
 assert.equal((await db.$queryRaw`SELECT "id" FROM "StoreOperatorAudit" WHERE "eventType"='INVENTORY_PRODUCT_MERGE'`).length,1);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
