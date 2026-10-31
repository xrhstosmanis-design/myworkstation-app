import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createPosOperatorInventoryRouter} from '../src/routes/pos-operator-inventory.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native namespace validates live operator rows, commits scoped retail only, denies stock/cross-store/revocation and rolls back trigger/commit failures',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='pos_inventory_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});let server;
 const user={id:'O',operatorId:'O',operatorSessionId:'session',employeeId:'E',companyId:'C',storeId:'S',role:'EMPLOYEE',tokenType:'STORE_OPERATOR',terminalPos:'LAB'};
 const rights={inventoryPos:true,editDescription:true,changeRetail:true,addBarcode:true,newProduct:true,onlineBarcode:true};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const tables={
   Company:'"id" text primary key,"name" text,"active" bool,"licenseStatus" text,"subscriptionEndsAt" timestamp',
   CompanyModule:'"id" text,"companyId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',
   Store:'"id" text primary key,"companyId" text,"name" text,"city" text,"active" bool',
   StorePaidModule:'"storeId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',
   Employee:'"id" text primary key,"storeId" text,"active" bool',
   StoreOperatorCredential:'"id" text primary key,"companyId" text,"storeId" text,"employeeId" text,"displayName" text,"role" text,"active" bool',
   StoreOperatorProfile:'"companyId" text,"storeId" text,"employeeId" text,"permissions" jsonb,"terminalPos" text,"posAccess" bool',
   StoreOperatorSession:'"id" text primary key,"operatorId" text,"revokedAt" timestamp,"expiresAt" timestamp',
   ProductCategory:'"id" text primary key,"companyId" text,"name" text,"active" bool',
   ProductSubcategory:'"id" text primary key,"companyId" text,"categoryId" text,"name" text,"active" bool',
   Product:'"id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"sku" text,"name" text,"salePrice" numeric default 2,"costPrice" numeric default 1,"vatRate" numeric default 13,"vatVerified" bool default true,"active" bool default true,"allowPosPriceChange" bool default false,"isSet" bool default false,"vatDepartmentId" text,"updatedAt" timestamp default NOW(),"isModifier" bool default false,"modifierGroup" text,"isService" bool default false,"eDeliveryEnabled" bool default false,"efoodEnabled" bool default false,"woltEnabled" bool default false,"publishStock" bool default false,"publishPrices" bool default false,"efoodPrice" numeric,"woltPrice" numeric',
   StoreProduct:'"id" text primary key,"storeId" text,"productId" text,"salePrice" numeric,"currentStock" numeric default 0,"minStock" numeric,"active" bool default true,"updatedAt" timestamp default NOW(),unique("storeId","productId")',
   ProductBarcode:'"id" text primary key,"productId" text,"barcode" text,"unitMultiplier" numeric default 1,"salePrice" numeric,"name" text,"updatedAt" timestamp default NOW()',
   ProductPriceHistory:'"id" text primary key,"companyId" text,"productId" text,"storeId" text,"oldPrice" numeric,"newPrice" numeric CHECK("newPrice"<>99),"changeType" text,"createdByUserId" text,"createdAt" timestamp default NOW()',
   StockMovement:'"id" text primary key,"storeId" text,"productId" text,"quantity" numeric',
   StoreOperatorAudit:'"id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb',
   Sale:'"id" text primary key,"storeId" text,"total" numeric',
   ManagementVatDepartment:'"id" text primary key,"companyId" text,"vatRate" numeric,"active" bool'
  };
  for(const [name,columns] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES ('C','Fixture',true,'ACTIVE',NULL);`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES ('m1','C','INVENTORY',true,NULL,NULL),('m2','C','STORE_MODE',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES ('S','C','Own',NULL,true),('OTHER','C','Other',NULL,true)`);
  await db.$executeRawUnsafe(`INSERT INTO "Employee" VALUES ('E','S',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential" VALUES ('O','C','S','E','Fixture operator','EMPLOYEE',true)`);
  await db.$executeRawUnsafe('INSERT INTO "StoreOperatorProfile" VALUES (\'C\',\'S\',\'E\',$1::jsonb,\'LAB\',true)',JSON.stringify(rights));
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorSession" VALUES ('session','O',NULL,NOW()+INTERVAL '1 hour')`);
  await db.$executeRawUnsafe(`INSERT INTO "Product" ("id","companyId","sku","name") VALUES ('P','C','1','Own'),('Q','C','2','Own2'),('FOREIGN','C','3','Other')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","salePrice","currentStock") VALUES ('sp','S','P',3,17),('sq','S','Q',4,8),('sf','OTHER','P',9,22),('sff','OTHER','FOREIGN',99,50)`);
  await db.$executeRawUnsafe(`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES ('b','Q','5200000012345')`);
  await db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES ('control','S',10)`);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={...user};next()});app.use('/api/store-pos/stores/:storeId/inventory',createPosOperatorInventoryRouter({db,prepare:async()=>{}}));app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/store-pos/stores/S/inventory`;
  const request=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Inventory-Generation':'0'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,json:await response.json()}};
  const prices=(price,storeId='S')=>({basePrice:55,stores:[{storeId,active:true,salePrice:price}]});
  const controls=async()=>({stock:await db.$queryRawUnsafe('SELECT "storeId","productId","currentStock"::text FROM "StoreProduct" ORDER BY "id"'),movements:await db.$queryRawUnsafe('SELECT * FROM "StockMovement"'),sales:await db.$queryRawUnsafe('SELECT * FROM "Sale"')});
  const before=await controls();
  assert.equal((await request('/access')).status,200);
  assert.deepEqual((await request('/products/stores')).json.data.map(row=>row.id),['S']);
  let result=await request('/products/P/prices','PATCH',prices(5));assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.json.scope.actorId,'O');assert.equal(user.role,'EMPLOYEE');
  assert.equal(Number((await db.$queryRawUnsafe('SELECT "salePrice" FROM "Product" WHERE "id"=\'P\''))[0].salePrice),2,'company base unchanged');
  assert.deepEqual((await db.$queryRawUnsafe('SELECT "storeId","salePrice"::text FROM "StoreProduct" WHERE "productId"=\'P\' ORDER BY "storeId"')).map(row=>[row.storeId,Number(row.salePrice)]),[['OTHER',9],['S',5]]);
  assert.deepEqual(await controls(),before);
  for(const [path,body] of [['/products/P/stock-adjustment',{storeId:'S',quantity:10}],['/archive/stock-transfer',{sourceStoreId:'S',destinationStoreId:'OTHER'}],['/products/P/prices',prices(6,'OTHER')],['/products/FOREIGN/prices',prices(6)],['/products/P/prices',{...prices(6),currentStock:17}]])assert.ok((await request(path,'PATCH',body)).status>=400,path);
  assert.equal((await request('/products/P/prices','PATCH',prices(99))).status,500,'failed history insert rolls back price');
  await db.$executeRawUnsafe(`CREATE FUNCTION poison_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."salePrice"=88 THEN NEW."currentStock"=999; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER poison BEFORE UPDATE ON "StoreProduct" FOR EACH ROW EXECUTE FUNCTION poison_stock()`);
  result=await request('/products/P/prices','PATCH',prices(88));assert.equal(result.status,403);assert.equal(result.json.code,'POS_INVENTORY_STOCK_DENIED');assert.deepEqual(await controls(),before);
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."salePrice"=77 THEN RAISE EXCEPTION 'commit refused'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER late_failure AFTER UPDATE ON "StoreProduct" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_commit()`);
  assert.equal((await request('/products/P/prices','PATCH',prices(77))).status,500,'no success before actual commit');
  assert.equal(Number((await db.$queryRawUnsafe('SELECT "salePrice" FROM "StoreProduct" WHERE "id"=\'sp\''))[0].salePrice),5);
  assert.equal((await request('/products/P/barcode-transfer','POST',{sourceProductId:'Q',barcode:'5200000012345'})).status,200);
  assert.equal((await db.$queryRawUnsafe('SELECT "productId" FROM "ProductBarcode"'))[0].productId,'P');
  result=await request('/products/bulk-card','PATCH',{storeId:'S',requestId:randomUUID(),productIds:['P'],priceMode:'SET',priceValue:6,expectedPrices:{P:5}});assert.equal(result.status,200,JSON.stringify(result));
  assert.deepEqual(await controls(),before);
  const csv=(sku,stock)=>'data:text/csv;base64,'+Buffer.from(`SKU,Name,Retail,Stock\n${sku},Updated fixture,8,${stock}`).toString('base64');
  assert.equal((await request('/archive/import-preview','POST',{storeId:'S',dataUrl:csv('1',0)})).status,200);
  result=await request('/archive/import','POST',{storeId:'S',dataUrl:csv('1',0),applyStock:false});assert.equal(result.status,201,JSON.stringify(result));assert.deepEqual(await controls(),before);
  assert.equal(Number((await db.$queryRawUnsafe('SELECT "salePrice" FROM "Product" WHERE "id"=\'P\''))[0].salePrice),2);
  for(const path of ['/archive/import-preview','/archive/import']){
   assert.equal((await request(path,'POST',{storeId:'S',dataUrl:csv('1',5),applyStock:false})).json.code,'POS_INVENTORY_STOCK_DENIED');
   assert.equal((await request(path,'POST',{storeId:'S',dataUrl:csv('3',0),applyStock:false})).status,404);
  }
  const history=(await request('/products/P/price-history')).json.data;assert.equal(history.length,2);assert.ok(history.every(row=>row.storeName==='Own'));
  let releaseRevocation,locked;const entered=new Promise(resolve=>locked=resolve),release=new Promise(resolve=>releaseRevocation=resolve);
  const revoke=db.$transaction(async tx=>{await tx.$executeRawUnsafe('UPDATE "StoreOperatorProfile" SET "permissions"=$1::jsonb',JSON.stringify({...rights,inventoryPos:false}));locked();await release;});
  await entered;const pending=request('/products/P/prices','PATCH',prices(9));await new Promise(resolve=>setTimeout(resolve,50));releaseRevocation();await revoke;
  assert.ok([403,409].includes((await pending).status),'concurrent revocation cannot produce a successful stale grant');
  assert.deepEqual(await controls(),before);
  await db.$executeRawUnsafe('UPDATE "StoreOperatorProfile" SET "permissions"=$1::jsonb',JSON.stringify({...rights,changeRetail:false}));assert.equal((await request('/products/P/prices','PATCH',prices(7))).status,403);
  await db.$executeRawUnsafe('UPDATE "StoreOperatorProfile" SET "permissions"=$1::jsonb',JSON.stringify({...rights,inventoryPos:false}));assert.equal((await request('/access')).status,403);
  await db.$executeRawUnsafe('UPDATE "StoreOperatorProfile" SET "permissions"=$1::jsonb',JSON.stringify(rights));await db.$executeRawUnsafe('UPDATE "StoreOperatorSession" SET "revokedAt"=NOW()');assert.equal((await request('/access')).status,403);
  await db.$executeRawUnsafe('UPDATE "StoreOperatorSession" SET "revokedAt"=NULL');await db.$executeRawUnsafe(`UPDATE "CompanyModule" SET "active"=false WHERE "moduleKey"='INVENTORY'`);assert.equal((await request('/access')).json.code,'MODULE_DISABLED');
  assert.deepEqual(await controls(),before);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
