import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';

function isolated(value=process.env.DATABASE_URL){
 try{
  const url=new URL(value);
  if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','postgres'].includes(url.hostname)||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(url.pathname)||url.hash)return false;
  const seen=new Set();for(const[key,value]of url.searchParams){if(seen.has(key))return false;seen.add(key);if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(value))return false}else if(!Object.hasOwn({connection_limit:1,pool_timeout:1,statement_cache_size:1},key)||!/^\d{1,6}$/.test(value))return false}
  return true;
 }catch{return false}
}
test('POS new-product native guard refuses production URLs, redirection parameters and duplicate authority',()=>{
 for(const url of ['postgresql://u:p@localhost/production','postgresql://u:p@localhost/production_latest','postgresql://u:p@remote/module_test','https://localhost/module_test','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=a&schema=b','postgresql://u:p@localhost/module_test#ignored','postgresql://u:p@localhost/module_test?schema=bad-name','postgresql://u:p@localhost/module_test?connection_limit=unsafe'])assert.equal(isolated(url),false,url);
 if(process.env.NODE_ENV==='test')for(const url of ['postgresql://u:p@localhost/test','postgres://u:p@127.0.0.1/module_test?schema=isolated_1&connection_limit=1','postgresql://u:p@postgres/test_suite?pool_timeout=10&statement_cache_size=0'])assert.equal(isolated(url),true,url);
 if(process.env.CI)assert.ok(isolated(),'CI must execute real PostgreSQL POS new-product proof unskipped');
});

const body=(extra={})=>({requestId:crypto.randomUUID(),storeId:'A',name:'New synthetic product',sku:'',description:'All fields',categoryId:'category',subcategoryId:'subcategory',productCompanyId:'brand',unit:'KG',costPrice:1.25,salePrice:2.5,vatRate:13,vatVerified:true,vatDepartmentId:'vat13',staffPrice:1.5,deliveryPrice:2.8,minOrderQuantity:4,capacity:.75,openingStock:3.25,active:true,trackStock:true,allowDiscount:true,allowPosPriceChange:true,freeSalePrice:false,negativeStockWarning:true,isSet:false,isRecipe:false,discountA:5,discountB:6,discountC:7,barcodes:[{barcode:'520000000001',unitMultiplier:1,salePrice:null,name:'Single'},{barcode:'520000000002',unitMultiplier:2,salePrice:3.3,name:'Package'}],supplierCodes:[{supplierId:'supplier',supplierCode:'SUP-ITEM'}],...extra});

test('actual POS routes and shared creator enforce real PostgreSQL permissions, licences, complete atomic creation and User FK identity',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient({datasourceUrl:process.env.DATABASE_URL}),schema='pos_new_product_test_'+crypto.randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),oldGlobal=globalThis.prisma;let created=false,server;
 try{
  await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');created=true;
  const statements=[
   'CREATE TABLE "Company"("id" text primary key,"name" text,"active" boolean,"licenseStatus" text,"subscriptionEndsAt" timestamptz)',
   'CREATE TABLE "CompanyModule"("id" text primary key,"companyId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "StorePaidModule"("storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
   'CREATE TABLE "User"("id" text primary key,"companyId" text)',
   'CREATE TABLE "StoreOperatorCredential"("id" text primary key,"companyId" text,"storeId" text,"employeeId" text,"displayName" text,"active" boolean)',
   'CREATE TABLE "StoreOperatorProfile"("companyId" text,"storeId" text,"employeeId" text,"terminalPos" text,"posAccess" boolean,"permissions" jsonb)',
   'CREATE TABLE "ProductCategory"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "ProductSubcategory"("id" text primary key,"companyId" text,"categoryId" text,"name" text,"active" boolean)',
   'CREATE TABLE "ManagementProductCompany"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "Supplier"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
   'CREATE TABLE "ManagementVatDepartment"("id" text primary key,"companyId" text,"active" boolean,"description" text,"vatRate" numeric,"cashRegisterDepartment" int,"legacyVatCode" text)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"productCompanyId" text,"sku" text,"name" text,"description" text,"unit" text,"vatRate" numeric,"vatVerified" boolean,"salePrice" numeric,"costPrice" numeric,"trackStock" boolean,"active" boolean,"staffPrice" numeric,"deliveryPrice" numeric,"minOrderQuantity" numeric,"capacity" numeric,"allowDiscount" boolean,"allowPosPriceChange" boolean,"freeSalePrice" boolean,"negativeStockWarning" boolean,"isSet" boolean,"isRecipe" boolean,"discountA" numeric,"discountB" numeric,"discountC" numeric,"vatDepartmentId" text,UNIQUE("companyId","sku"))',
   'CREATE TABLE "ProductBarcode"("id" text primary key,"productId" text REFERENCES "Product"("id"),"barcode" text,"unitMultiplier" numeric,"salePrice" numeric,"name" text,UNIQUE("productId","barcode"))',
   'CREATE TABLE "SupplierProductLink"("id" text primary key,"companyId" text,"supplierId" text,"productId" text REFERENCES "Product"("id"),"supplierCode" text CHECK("supplierCode"<>\'FAIL\'),"active" boolean,"source" text,"updatedBy" text,"updatedByName" text)',
   'CREATE TABLE "StoreProduct"("id" text primary key,"storeId" text REFERENCES "Store"("id"),"productId" text REFERENCES "Product"("id"),"salePrice" numeric,"currentStock" numeric,"active" boolean,UNIQUE("storeId","productId"))',
   'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text REFERENCES "Store"("id"),"productId" text REFERENCES "Product"("id"),"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text REFERENCES "User"("id"))',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb CHECK(COALESCE("details"->>\'productName\',\'\')<>\'ROLLBACK-AUDIT\'))',
   'CREATE TABLE "Sale"("id" text primary key,"value" numeric)',
   'CREATE TABLE "Payment"("id" text primary key,"value" numeric)',
   `INSERT INTO "Company" VALUES('company','Synthetic',TRUE,'ACTIVE',NULL),('foreign','Control',TRUE,'ACTIVE',NULL)`,
   `INSERT INTO "CompanyModule" VALUES('storemode','company','STORE_MODE',TRUE,NULL,NULL),('inventory','company','INVENTORY',TRUE,NULL,NULL)`,
   `INSERT INTO "Store" VALUES('A','company','A',TRUE),('B','company','Control B',TRUE),('F','foreign','Foreign',TRUE),('closed','company','Closed',FALSE)`,
   `INSERT INTO "User" VALUES('owner','company'),('credential','foreign')`,
   `INSERT INTO "StoreOperatorCredential" VALUES('credential','company','A','employee','Current credential name',TRUE)`,
   `INSERT INTO "StoreOperatorProfile" VALUES('company','A','employee','POS-02',TRUE,'{"newProduct":true,"onlineBarcode":false}')`,
   `INSERT INTO "ProductCategory" VALUES('category','company','Food',TRUE),('foreign-category','foreign','Foreign',TRUE)`,
   `INSERT INTO "ProductSubcategory" VALUES('subcategory','company','category','Snacks',TRUE),('foreign-subcategory','foreign','foreign-category','Foreign',TRUE)`,
   `INSERT INTO "ManagementProductCompany" VALUES('brand','company','Brand',TRUE),('foreign-brand','foreign','Foreign',TRUE)`,
   `INSERT INTO "Supplier" VALUES('supplier','company','Supplier',TRUE),('foreign-supplier','foreign','Foreign',TRUE)`,
   `INSERT INTO "ManagementVatDepartment" VALUES('vat13','company',TRUE,'Food13',13,5,'food'),('other13','company',TRUE,'Other13',13,9,'other'),('foreign-vat','foreign',TRUE,'Foreign',13,7,'foreign'),('inactive-vat','company',FALSE,'Inactive',13,8,'inactive')`,
   `INSERT INTO "Product"("id","companyId","sku","name","unit","salePrice","active","trackStock") VALUES('control-product','company','CONTROL','Untouched','PIECE',9,TRUE,TRUE)`,
   `INSERT INTO "StoreProduct" VALUES('control-card','B','control-product',9,9,TRUE)`,
   `INSERT INTO "Sale" VALUES('control-sale',19.5)`,
   `INSERT INTO "Payment" VALUES('control-payment',19.5)`
  ];for(const sql of statements)await db.$executeRawUnsafe(sql);
  // prisma.js explicitly supports an injected client. Module guards and creator
  // now share only this random isolated schema, never the configured public DB.
  globalThis.prisma=db;
  const {registerPosNewProductRoutes}=await import('../src/lib/pos-new-product-card.js'),{createInventoryCard}=await import('../src/lib/inventory-new-card.js');
  const operator={id:'credential',operatorId:'credential',employeeId:'employee',companyId:'company',storeId:'A',terminalPos:'POS-02',fullName:'Session name',tokenType:'STORE_OPERATOR',role:'EMPLOYEE'},owner={id:'owner',companyId:'company',fullName:'Owner',role:'OWNER'};let principal=operator;
  const app=express(),router=express.Router();app.use(express.json());app.use((req,res,next)=>{req.user=principal;next()});registerPosNewProductRoutes(router,db);app.use(router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening))});const origin='http://127.0.0.1:'+server.address().port;
  const request=async(path='/stores/A/new-product/options',payload)=>{const response=await fetch(origin+path,payload===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:response.status,body:await response.json()}};
  const snapshot=async()=>JSON.stringify(await db.$queryRawUnsafe(`SELECT (SELECT json_agg(p ORDER BY "id") FROM "Product" p)::text AS products,(SELECT json_agg(s ORDER BY "id") FROM "StoreProduct" s)::text AS cards,(SELECT json_agg(b ORDER BY "id") FROM "ProductBarcode" b)::text AS barcodes,(SELECT json_agg(l ORDER BY "id") FROM "SupplierProductLink" l)::text AS links,(SELECT json_agg(m ORDER BY "id") FROM "StockMovement" m)::text AS movements,(SELECT json_agg(a ORDER BY "id") FROM "StoreOperatorAudit" a)::text AS audit`));
  const controls=async()=>JSON.stringify(await db.$queryRawUnsafe(`SELECT (SELECT json_agg(s ORDER BY "id") FROM "Sale" s)::text AS sales,(SELECT json_agg(p ORDER BY "id") FROM "Payment" p)::text AS payments,(SELECT json_agg(sp ORDER BY "id") FROM "StoreProduct" sp WHERE "storeId"='B')::text AS control_store`));
  const beforeControl=await controls();
  await t.test('actual role, company, store, current profile and both store licence gates refuse before writes',async()=>{
   const before=await snapshot(),available=await request();assert.equal(available.status,200);
   assert.deepEqual(available.body.suppliers.map(row=>row.id),['supplier']);assert.deepEqual(available.body.brands.map(row=>row.id),['brand']);assert.deepEqual(available.body.taxonomy.categories.map(row=>row.id),['category']);assert.deepEqual(available.body.taxonomy.subcategories.map(row=>row.id),['subcategory']);assert.deepEqual(available.body.vatDepartments.map(row=>row.id).sort(),['other13','vat13']);
   assert.equal((await request('/stores/B/new-product/options')).status,403);assert.equal((await request('/stores/A/new-product',body({storeId:'B'}))).status,403);
   principal={...owner,role:'MANAGER'};assert.equal((await request()).status,403);principal={...owner,companyId:'foreign'};assert.equal((await request()).status,404);principal=operator;
   await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "permissions"='{}'`);assert.equal((await request()).status,403);
   await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "permissions"='{"newProduct":true}',"posAccess"=FALSE`);assert.equal((await request()).status,403);
   await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "posAccess"=TRUE`);await db.$executeRawUnsafe(`UPDATE "StoreOperatorCredential" SET "active"=FALSE`);assert.equal((await request()).status,403);await db.$executeRawUnsafe(`UPDATE "StoreOperatorCredential" SET "active"=TRUE`);
   for(const module of ['STORE_MODE','INVENTORY']){await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=FALSE WHERE "moduleKey"=$1`,module);assert.equal((await request()).body.moduleKey,module);await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=TRUE WHERE "moduleKey"=$1`,module)}
   await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('A','INVENTORY',FALSE,NULL,NULL)`);assert.equal((await request()).status,403);await db.$executeRawUnsafe(`DELETE FROM "StorePaidModule"`);
   await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='SUSPENDED' WHERE "id"='company'`);assert.equal((await request()).status,403);await db.$executeRawUnsafe(`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='company'`);
   assert.equal(await snapshot(),before);
  });
  let accepted;
  await t.test('concurrent full-field POS create replays once, preserves exact VAT identity and cannot mistake a credential/User collision',async()=>{
   const payload=body({vatDepartmentId:'other13'}),results=await Promise.all([request('/stores/A/new-product',payload),request('/stores/A/new-product',payload)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,201]);assert.equal(results[0].body.id,results[1].body.id);accepted={payload,id:results[0].body.id};
   const row=(await db.$queryRawUnsafe(`SELECT * FROM "Product" WHERE "id"=$1`,accepted.id))[0];for(const key of ['description','categoryId','subcategoryId','productCompanyId','unit','vatDepartmentId','vatVerified','active','trackStock','allowDiscount','allowPosPriceChange','freeSalePrice','negativeStockWarning','isSet','isRecipe'])assert.equal(row[key],payload[key],key);
   for(const key of ['costPrice','salePrice','staffPrice','deliveryPrice','minOrderQuantity','capacity','vatRate','discountA','discountB','discountC'])assert.equal(Number(row[key]),payload[key],key);
   const cards=await db.$queryRawUnsafe(`SELECT * FROM "StoreProduct" WHERE "productId"=$1`,accepted.id);assert.equal(cards.length,1);assert.equal(cards[0].storeId,'A');assert.equal(Number(cards[0].currentStock),3.25);
   const movements=await db.$queryRawUnsafe(`SELECT * FROM "StockMovement" WHERE "productId"=$1`,accepted.id);assert.equal(movements.length,1);assert.equal(Number(movements[0].quantity),3.25);assert.equal(movements[0].createdByUserId,null,'credential/User text collision must never attribute stock to that User');
   const audit=await db.$queryRawUnsafe(`SELECT * FROM "StoreOperatorAudit" WHERE "details"->>'productId'=$1`,accepted.id);assert.equal(audit.length,1);assert.equal(audit[0].actorId,'credential');assert.equal(audit[0].operatorId,'credential');assert.equal(audit[0].details.employeeId,'employee');assert.equal(audit[0].details.actorName,'Current credential name');assert.equal(audit[0].details.terminalPos,'POS-02');assert.equal(audit[0].details.actorKind,'STORE_OPERATOR');
   const links=await db.$queryRawUnsafe(`SELECT * FROM "SupplierProductLink" WHERE "productId"=$1`,accepted.id);assert.equal(links.length,1);assert.equal(links[0].updatedBy,'credential');assert.equal(links[0].updatedByName,'Current credential name');assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "ProductBarcode" WHERE "productId"=$1`,accepted.id)).length,2);
   assert.equal((await request('/stores/A/new-product',{...payload,name:'Changed body'})).status,409);
  });
  await t.test('collisions, foreign metadata, wrong department/rate and late audit failure roll back every creation side effect',async()=>{
   const before=await snapshot();
   for(const change of [{barcodes:[{barcode:'520000000001',unitMultiplier:1}]},{sku:(await db.$queryRawUnsafe(`SELECT "sku" FROM "Product" WHERE "id"=$1`,accepted.id))[0].sku},{categoryId:'foreign-category'},{subcategoryId:'foreign-subcategory'},{productCompanyId:'foreign-brand'},{supplierCodes:[{supplierId:'foreign-supplier',supplierCode:'X'}]},{vatDepartmentId:'foreign-vat'},{vatDepartmentId:'inactive-vat'},{vatRate:24},{supplierCodes:[{supplierId:'supplier',supplierCode:'FAIL'}]},{name:'ROLLBACK-AUDIT'}]){
    const response=await request('/stores/A/new-product',body({barcodes:[],...change}));assert.ok(response.status>=400,JSON.stringify(change));assert.equal(await snapshot(),before);
   }
   assert.equal((await request('/stores/A/new-product/barcode/520000000001')).status,403);
   await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "permissions"='{"newProduct":true,"onlineBarcode":true}'`);assert.equal((await request('/stores/A/new-product/barcode/520000000001')).body.source,'MYWORKSTATION');assert.equal((await request('/stores/A/new-product/barcode/not-a-barcode')).status,400);
  });
  await t.test('legacy BackOffice keeps real User attribution and the original audit channel',async()=>{
   const result=await createInventoryCard(db,owner,body({barcodes:[],sku:'BACKOFFICE',openingStock:2}));const move=(await db.$queryRawUnsafe(`SELECT * FROM "StockMovement" WHERE "productId"=$1`,result.id))[0];assert.equal(move.createdByUserId,'owner');
   const audit=(await db.$queryRawUnsafe(`SELECT "details" FROM "StoreOperatorAudit" WHERE "details"->>'productId'=$1`,result.id))[0];assert.equal(audit.details.terminalPos,'BACKOFFICE');assert.equal('origin' in audit.details,false);
  });
  assert.equal(await controls(),beforeControl,'control-store stock and all financial source rows unchanged');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(oldGlobal===undefined)delete globalThis.prisma;else globalThis.prisma=oldGlobal;
  await db.$disconnect();if(created)await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect();
 }
});
