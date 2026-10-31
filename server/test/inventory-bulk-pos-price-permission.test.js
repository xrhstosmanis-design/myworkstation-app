import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveInventoryBulkCard} from '../src/lib/inventory-bulk-card.js';
import {readPermanentPrice} from '../src/lib/pos-permanent-price.js';
const user={id:'owner',companyId:'company',role:'OWNER'},request=(extra={})=>({storeId:'store',requestId:randomUUID(),productIds:['a'],allowPosPriceChange:true,...extra});
test('bulk permission is a strict optional boolean; ALL cannot broaden other operations',async()=>{
 const db={$transaction(){throw Error('unexpected database access')}};
 for(const extra of [{allowPosPriceChange:'false'},{allowPosPriceChange:null},{productIds:[]},{allProducts:true},{allProducts:true,productIds:[],allowPosPriceChange:undefined},{allProducts:true,productIds:[],active:false},{allProducts:true,productIds:[],priceMode:'SET',priceValue:0},{allProducts:true,productIds:[],setItem:{confirmed:true,relatedProductId:'fee',quantity:1,salePrice:0}}])await assert.rejects(saveInventoryBulkCard(db,user,request(extra)),error=>error.message!=='unexpected database access');
 for(const denied of [{...user,role:'EMPLOYEE'},{...user,tokenType:'STORE_OPERATOR'},{...user,storeId:'other'},{...user,companyId:null}])await assert.rejects(saveInventoryBulkCard(db,denied,request()),{status:403});
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native bulk permission selected/ALL/KEEP, POS denial, audit, replay and rollback preserve unrelated data',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='bulk_permission_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool,"name" text)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"vatDepartmentId" text,"vatRate" numeric default 13,"isSet" bool default false,"salePrice" numeric default 2,"active" bool default true,"allowPosPriceChange" bool default false,"name" text,"sku" text,"updatedAt" timestamp default NOW())',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"salePrice" numeric default 3,"currentStock" numeric default 12,"active" bool default true,"updatedAt" timestamp default NOW(),primary key("storeId","productId"))',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)',
   'CREATE TABLE "ProductPriceHistory"("id" text)',
   'CREATE TABLE "ProductBarcode"("id" text,"productId" text,"barcode" text,"salePrice" numeric)',
   'CREATE TABLE "StoreTransaction"("id" text,"amount" numeric)',
   'CREATE TABLE "StockMovement"("id" text,"quantity" numeric)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company',true,'LAB'),('control','company',true,'Control'),('foreign','other',true,'Foreign')`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","name","sku") VALUES ('a','company','A','A'),('b','company','B','B'),('control','company','C','C'),('foreign','other','F','F')`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") VALUES ('store','a'),('store','b'),('control','a'),('control','control'),('foreign','foreign')`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('prior',9)`;await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('prior',-1)`;
  const protectedRows=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT json_agg(to_jsonb(p)-'allowPosPriceChange'-'updatedAt' ORDER BY p."id") FROM "Product" p) AS products,(SELECT json_agg(row_to_json(s) ORDER BY s."storeId",s."productId") FROM "StoreProduct" s) AS stores,(SELECT json_agg(row_to_json(t)) FROM "StoreTransaction" t) AS transactions,(SELECT json_agg(row_to_json(m)) FROM "StockMovement" m) AS movements,(SELECT count(*)::int FROM "ProductPriceHistory") AS history`);
  const before=await protectedRows(),selected=request();
  const results=await Promise.all([saveInventoryBulkCard(db,user,selected),saveInventoryBulkCard(db,user,selected)]);assert.equal(results.filter(r=>!r.idempotent).length,1);
  assert.deepEqual((await db.$queryRaw`SELECT "id","allowPosPriceChange" FROM "Product" ORDER BY "id"`).map(r=>[r.id,r.allowPosPriceChange]),[['a',true],['b',false],['control',false],['foreign',false]]);
  assert.equal(await protectedRows(),before);
  const audit=(await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit"`)[0].details;assert.equal(audit.changes[0].before.allowPosPriceChange,false);assert.equal(audit.changes[0].after.allowPosPriceChange,true);
  const req={user,params:{storeId:'store',productId:'a'},query:{}},store={id:'store',companyId:'company'};
  assert.equal((await readPermanentPrice(db,req,store,{changeRetail:true})).salePrice,3);
  await saveInventoryBulkCard(db,user,request({allowPosPriceChange:false}));await assert.rejects(readPermanentPrice(db,req,store,{changeRetail:true}),{status:403});
  await saveInventoryBulkCard(db,user,request({allowPosPriceChange:undefined,active:false}));assert.equal((await db.$queryRaw`SELECT "allowPosPriceChange" FROM "Product" WHERE "id"='a'`)[0].allowPosPriceChange,false);
  await db.$executeRaw`UPDATE "StoreProduct" SET "active"=true WHERE "productId"='a' AND "storeId"='store'`;
  for(const extra of [{productIds:['foreign']},{storeId:'foreign'},{storeId:'missing'},{productIds:['missing']}])await assert.rejects(saveInventoryBulkCard(db,user,request(extra)));
  await assert.rejects(saveInventoryBulkCard(db,user,{...selected,allowPosPriceChange:false}),{status:409});
  await assert.rejects(saveInventoryBulkCard(db,{...user,id:'another'},selected),{status:409});
  // More than the old 500-ID request bound and multiple UI pages, including inactive products.
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","active") SELECT 'many-'||n,'company',n%2=0 FROM generate_series(1,601) n`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId","active") SELECT 'store',"id","active" FROM "Product" WHERE "id" LIKE 'many-%'`;
  const all=request({allProducts:true,productIds:[],allowPosPriceChange:true}),allBefore=await protectedRows();assert.equal((await saveInventoryBulkCard(db,user,all)).changed,603);assert.equal(await protectedRows(),allBefore);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "Product" WHERE "allowPosPriceChange"=true`)[0].n),603);
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId") VALUES ('later','company')`;await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") VALUES ('store','later')`;
  assert.equal((await saveInventoryBulkCard(db,user,all)).idempotent,true);assert.equal((await db.$queryRaw`SELECT "allowPosPriceChange" FROM "Product" WHERE "id"='later'`)[0].allowPosPriceChange,false,'retry never expands original selection');
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT json_agg(row_to_json(p) ORDER BY p."id") FROM "Product" p) AS products,(SELECT json_agg(row_to_json(a) ORDER BY a."id") FROM "StoreOperatorAudit" a) AS audits`),rollbackBefore=await snapshot();
  await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT reject_new_audit CHECK ("details"->>'requestId' <> '11111111-1111-4111-8111-111111111111')`);
  await assert.rejects(saveInventoryBulkCard(db,user,request({allProducts:true,productIds:[],allowPosPriceChange:false,requestId:'11111111-1111-4111-8111-111111111111'})));assert.equal(await snapshot(),rollbackBefore);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
