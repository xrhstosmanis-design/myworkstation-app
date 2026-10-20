import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveInventoryBulkCard} from '../src/lib/inventory-bulk-card.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const user={id:'owner',companyId:'company',role:'OWNER',fullName:'Synthetic Owner'};
const body=(extra={})=>({storeId:'store',requestId:randomUUID(),productIds:['a','b'],setItem:{confirmed:true,relatedProductId:'fee',quantity:1,salePrice:.05,clearPreparationFee:true},...extra});
test('bulk SET requires explicit confirmation and valid quantity before any database call',async()=>{
 const db={$transaction(){throw Error('must not write')}};
 for(const setItem of [{relatedProductId:'fee',quantity:1,salePrice:.05},{confirmed:true,relatedProductId:'fee',quantity:0,salePrice:.05},{confirmed:true,relatedProductId:'fee',quantity:1,salePrice:-.05}])await assert.rejects(saveInventoryBulkCard(db,user,body({setItem})));
});
test('atomic selected-store SET attachment preserves prices, tax, stock, recipes, controls and replay',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient();const schema='bulk_set_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const tables={
   Store:'"id" text primary key,"companyId" text,"active" bool',
   Product:'"id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"vatDepartmentId" text,"vatRate" numeric,"salePrice" numeric,"isSet" bool default false,"active" bool default true,"trackStock" bool default true,"updatedAt" timestamp default NOW()',
   StoreProduct:'"storeId" text,"productId" text,"salePrice" numeric,"active" bool default true,"currentStock" numeric default 0,"updatedAt" timestamp default NOW(),primary key("storeId","productId")',
   ProductSetItem:'"id" text primary key,"companyId" text,"productId" text,"relatedProductId" text,"quantity" numeric,"salePrice" numeric,"updatedBy" text,"updatedByName" text,"createdAt" timestamp default NOW(),"updatedAt" timestamp default NOW(),unique("companyId","productId","relatedProductId")',
   PreparationProductSettings:'"companyId" text,"productId" text,"environmentalFee" numeric,"preparationEnabled" bool,"productionStation" text,"autoPrint" bool,"updatedAt" timestamp default NOW(),primary key("companyId","productId")',
   PreparationRecipeLine:'"id" text,"productId" text,"quantity" numeric',
   StoreOperatorAudit:'"id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb',
   ProductPriceHistory:'"id" text'
  };
  for(const [name,columns]of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company',true),('control','company',true),('foreign','other',true)`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","vatDepartmentId","vatRate","salePrice") VALUES ('a','company','coffee-vat',13,1.65),('b','company','coffee-vat',13,2),('fee','company','fee-vat',24,.05),('control','company','control-vat',6,9),('foreign-fee','other','foreign-vat',24,.05),('shared','company','coffee-vat',13,3),('extra','company','extra-vat',13,.2)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId","salePrice","currentStock") VALUES ('store','a',1.65,-2),('store','b',2,3),('store','fee',.05,0),('store','shared',3,4),('control','shared',4,5),('control','control',9,6),('foreign','foreign-fee',.05,7)`;
  await db.$executeRaw`INSERT INTO "PreparationProductSettings" ("companyId","productId","environmentalFee","preparationEnabled","productionStation","autoPrint") VALUES ('company','a',.05,true,'COFFEE',true),('company','b',.05,true,'COFFEE',false),('company','control',.05,true,'CONTROL',true)`;
  await db.$executeRaw`INSERT INTO "PreparationRecipeLine" VALUES ('recipe-a','a',.018),('control-recipe','control',.1)`;
  await db.$executeRaw`INSERT INTO "ProductSetItem" ("id","companyId","productId","relatedProductId","quantity","salePrice") VALUES ('old-extra','company','a','extra',1,.2)`;
  const read=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT json_agg(row_to_json(s) ORDER BY s."storeId",s."productId") FROM "StoreProduct" s) AS stock,(SELECT json_agg(row_to_json(r) ORDER BY r."id") FROM "PreparationRecipeLine" r) AS recipes,(SELECT json_agg(json_build_object('id',p."id",'price',p."salePrice",'tax',p."vatRate",'department',p."vatDepartmentId",'active',p."active",'trackStock',p."trackStock") ORDER BY p."id") FROM "Product" p) AS protected,(SELECT count(*) FROM "ProductPriceHistory") AS priceHistory`);
  const protectedBefore=await read();const request=body();
  assert.equal((await saveInventoryBulkCard(db,user,request)).changed,2);
  assert.equal(await read(),protectedBefore);
  const links=await db.$queryRaw`SELECT "productId","quantity","salePrice" FROM "ProductSetItem" WHERE "relatedProductId"='fee' ORDER BY "productId"`;assert.deepEqual(links.map(x=>[x.productId,Number(x.quantity),Number(x.salePrice)]),[['a',1,.05],['b',1,.05]]);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "Product" WHERE "isSet"=true`)[0].n),2);
  const settings=await db.$queryRaw`SELECT "productId","environmentalFee","preparationEnabled","productionStation","autoPrint" FROM "PreparationProductSettings" ORDER BY "productId"`;assert.deepEqual(settings.map(x=>Number(x.environmentalFee)),[0,0,.05]);assert.equal(settings[1].autoPrint,false);assert.equal(settings[0].productionStation,'COFFEE');
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "ProductSetItem" WHERE "id"='old-extra'`)[0].n),1);
  assert.equal((await saveInventoryBulkCard(db,user,request)).idempotent,true);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "StoreOperatorAudit"`)[0].n),1);
  await assert.rejects(saveInventoryBulkCard(db,user,{...request,setItem:{...request.setItem,quantity:2}}),/διαφορετικά/);
  await assert.rejects(saveInventoryBulkCard(db,user,body({productIds:['shared']})),/άλλου καταστήματος/);
  await assert.rejects(saveInventoryBulkCard(db,user,body({productIds:['fee']})),/κύρια είδη/);
  await assert.rejects(saveInventoryBulkCard(db,user,body({setItem:{...request.setItem,relatedProductId:'foreign-fee'}})),/ίδιου καταστήματος/);
  await assert.rejects(saveInventoryBulkCard(db,{...user,role:'EMPLOYEE'},body()),/επιλεγμένο κατάστημα/);
  await assert.rejects(saveInventoryBulkCard(db,{...user,companyId:'other'},body()),/κατάστημα/);
  await db.$executeRaw`UPDATE "PreparationProductSettings" SET "environmentalFee"=.1 WHERE "productId"='b'`;
  const snapshot=JSON.stringify(await db.$queryRaw`SELECT (SELECT json_agg(row_to_json(t) ORDER BY t."id") FROM "ProductSetItem" t) AS links,(SELECT json_agg(row_to_json(p) ORDER BY p."id") FROM "Product" p) AS products,(SELECT json_agg(row_to_json(s) ORDER BY s."productId") FROM "PreparationProductSettings" s) AS settings,(SELECT count(*) FROM "StoreOperatorAudit") AS audits`);
  await assert.rejects(saveInventoryBulkCard(db,user,body()),/διαφορετική εισφορά/);
  assert.equal(JSON.stringify(await db.$queryRaw`SELECT (SELECT json_agg(row_to_json(t) ORDER BY t."id") FROM "ProductSetItem" t) AS links,(SELECT json_agg(row_to_json(p) ORDER BY p."id") FROM "Product" p) AS products,(SELECT json_agg(row_to_json(s) ORDER BY s."productId") FROM "PreparationProductSettings" s) AS settings,(SELECT count(*) FROM "StoreOperatorAudit") AS audits`),snapshot);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
