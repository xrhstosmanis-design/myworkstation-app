import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {inventoryStocktakeScopeAllowed} from '../src/lib/inventory-stocktake-scope.js';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';

function routes(db){
 const handlers=new Map();const Router=()=>({get:(p,...hs)=>handlers.set('GET'+p,hs),post:(p,...hs)=>handlers.set('POST'+p,hs)});
 const source=fs.readFileSync(new URL('../src/routes/inventory-v2-products.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
 new Function('Router','z','crypto','prisma','inventoryStocktakeScopeAllowed','lockDraftInventoryStocktake',source)(Router,z,crypto,db,inventoryStocktakeScopeAllowed,lockDraftInventoryStocktake);
 return async(method,req)=>{let status=200,result,error;const res={status(n){status=n;return this},json(x){result=x;return this}};for(const h of handlers.get(method+'/stocktakes/:stocktakeId/'+(method==='GET'?'new-product-options':'products')))await h(req,res,e=>{error=e});return {status:error?.status||status,result,error}};
}
const request=(body={},user={},stocktakeId='take')=>({params:{stocktakeId},user:{id:'owner',companyId:'company',role:'OWNER',fullName:'Virtual Owner',...user},body});
const payload={name:'Virtual new item',barcode:'999999',categoryId:'cat',vatDepartmentId:'vat',salePrice:1.2,costPrice:0.4,unit:'PIECE'};
for(const [name,user,parent,status] of [['employee',{role:'EMPLOYEE'},null,403],['foreign company',{companyId:'foreign'},{id:'take',companyId:'company',storeId:'store',status:'DRAFT'},404],['bound foreign store',{storeId:'other'},{id:'take',companyId:'company',storeId:'store',status:'DRAFT'},404],['closed',{}, {id:'take',companyId:'company',storeId:'store',status:'FINALIZED'},409],['different counter draft',{tokenType:'INVENTORY_COUNTER',grantId:'grant',stocktakeId:'other',storeId:'store',permissions:['INVENTORY_COUNT']},{id:'take',companyId:'company',storeId:'store',status:'DRAFT'},404],['revoked counter',{tokenType:'INVENTORY_COUNTER',grantId:'grant',stocktakeId:'take',storeId:'store',permissions:['INVENTORY_COUNT']},{id:'take',companyId:'company',storeId:'store',status:'DRAFT'},403]])test('new-product actual route rejects '+name,async()=>{
 let writes=0;const invoke=routes({$queryRaw:async(strings)=>strings.join('?').includes('InventoryAccessGrant')?[]:parent?[parent]:[],$transaction:async()=>{writes++;throw Error('must not write')}});const x=await invoke('POST',request(payload,user));assert.equal(x.status,status);assert.equal(writes,0);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL actual mobile create is atomic, draft/store/zone scoped, duplicate-safe and leaves stock/count controls intact',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema='inventory_new_test_'+crypto.randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const tables=[
 'CREATE TABLE "Stocktake"("id" text primary key,"companyId" text,"storeId" text,"status" text)',
 'CREATE TABLE "ProductCategory"("id" text primary key,"companyId" text,"name" text,"active" bool)',
 'CREATE TABLE "ManagementVatDepartment"("id" text primary key,"companyId" text,"description" text,"vatRate" numeric,"active" bool)',
 'CREATE TABLE "Product"("id" text primary key,"companyId" text,"categoryId" text,"vatDepartmentId" text,"sku" text,"name" text,"unit" text,"vatRate" numeric,"vatVerified" bool,"salePrice" numeric,"costPrice" numeric,"trackStock" bool,"active" bool,unique("companyId","sku"))',
 'CREATE TABLE "ProductBarcode"("id" text primary key,"productId" text,"barcode" text unique,"unitMultiplier" numeric)',
 'CREATE TABLE "StoreProduct"("id" text primary key,"storeId" text,"productId" text,"salePrice" numeric,"currentStock" numeric,"active" bool,unique("storeId","productId"))',
 'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"zoneId" text,"expectedQuantity" numeric,"countedQuantity" numeric,"unitCost" numeric,unique("stocktakeId","productId"))',
 'CREATE TABLE "InventoryAccessGrant"("id" text primary key,"stocktakeId" text,"zoneId" text,"revokedAt" timestamp,"expiresAt" timestamp)',
 'CREATE TABLE "InventoryCountEvent"("id" text primary key,"companyId" text,"storeId" text,"stocktakeId" text,"lineId" text,"zoneId" text,"eventType" text,"previousQuantity" numeric,"countedQuantity" numeric,"expectedQuantity" numeric,"actorId" text,"actorName" text,"source" text,"clientEventId" text)',
 ];for(const sql of tables)await db.$executeRawUnsafe(sql);
 await db.$executeRaw`INSERT INTO "Stocktake" VALUES('take','company','store','DRAFT'),('other-take','company','other','DRAFT')`;
 await db.$executeRaw`INSERT INTO "ProductCategory" VALUES('cat','company','Category',true),('foreign-cat','foreign','Foreign',true)`;
 await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES('vat','company','VAT13',13,true),('foreign-vat','foreign','Foreign',24,true)`;
 await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('old','store','original',1.2,4,true),('control','other','original',1.2,30,true)`;
 await db.$executeRaw`INSERT INTO "StocktakeLine" VALUES('original-line','take','original','original-zone',4,4,0.4)`;
 await db.$executeRaw`INSERT INTO "InventoryAccessGrant" VALUES('grant','take','zone',NULL,NOW()+INTERVAL '1 hour')`;
 const invoke=routes({$queryRaw:db.$queryRaw.bind(db),$transaction:fn=>db.$transaction(fn,{timeout:15000})});
 let x=await invoke('GET',request());assert.equal(x.status,200);assert.deepEqual(x.result.categories.map(c=>c.id),['cat']);assert.deepEqual(x.result.vats.map(c=>c.id),['vat']);
 const counter={id:null,role:'EMPLOYEE',tokenType:'INVENTORY_COUNTER',grantId:'grant',stocktakeId:'take',storeId:'store',zoneId:'zone',permissions:['INVENTORY_COUNT'],fullName:'Virtual Counter'};
 x=await invoke('POST',request(payload,counter));assert.equal(x.status,201,x.error?.message);assert.equal(x.result.stocktakeId,'take');const productId=x.result.id;
 const rows=await db.$queryRaw`SELECT p.*,sp."storeId",sp."currentStock",sl."stocktakeId",sl."zoneId",sl."countedQuantity" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "StocktakeLine" sl ON sl."productId"=p."id"`;
 assert.equal(rows.length,1);assert.equal(rows[0].id,productId);assert.equal(rows[0].storeId,'store');assert.equal(rows[0].stocktakeId,'take');assert.equal(rows[0].zoneId,'zone');assert.equal(Number(rows[0].currentStock),0);assert.equal(rows[0].countedQuantity,null);assert.equal(Number(rows[0].vatRate),13);
 const events=await db.$queryRaw`SELECT * FROM "InventoryCountEvent"`;assert.equal(events.length,1);assert.equal(events[0].eventType,'PRODUCT_CREATE');assert.equal(events[0].actorId,'grant');assert.equal(events[0].source,'QR_PIN');assert.equal(events[0].lineId,x.result.lineId);
 const observe=async()=>JSON.stringify({products:await db.$queryRaw`SELECT "id","sku" FROM "Product" ORDER BY "id"`,stock:await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct" ORDER BY "id"`,lines:await db.$queryRaw`SELECT * FROM "StocktakeLine" ORDER BY "id"`,events:await db.$queryRaw`SELECT * FROM "InventoryCountEvent" ORDER BY "id"`});
 const baseline=await observe();
 for(const [body,user] of [[payload,counter],[{...payload,barcode:'999998',categoryId:'foreign-cat'},{}],[{...payload,barcode:'999998',vatDepartmentId:'foreign-vat'},{}],[{...payload,barcode:'999998',storeIds:['other']},{}],[{...payload,barcode:'999998',initialStock:4},{}]]){x=await invoke('POST',request(body,user));assert.ok(x.error||x.status===409);assert.equal(await observe(),baseline);}
 // Two competing identical creates: one commit, one conflict, no second product/line.
 const pair=await Promise.all([invoke('POST',request({...payload,barcode:'888888'})),invoke('POST',request({...payload,barcode:'888888'}))]);assert.deepEqual(pair.map(r=>r.status).sort(),[201,409]);
 assert.equal((await db.$queryRaw`SELECT "id" FROM "Product"`).length,2);
 // Parent closes after access read, before locked mutation. No post-closure writes.
 let release,entered;const seen=new Promise(r=>{entered=r});const wait=new Promise(r=>{release=r});
 const delayed=routes({$queryRaw:db.$queryRaw.bind(db),$transaction:async fn=>{entered();await wait;return db.$transaction(fn)}});
 const beforeClose=await observe();const late=delayed('POST',request({...payload,barcode:'777777'}));await seen;await db.$executeRaw`UPDATE "Stocktake" SET "status"='FINALIZED' WHERE "id"='take'`;release();x=await late;assert.equal(x.status,409);assert.equal(await observe(),beforeClose);
 const controls=await db.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "productId"='original' ORDER BY "storeId"`;assert.deepEqual(controls.map(r=>Number(r.currentStock)),[30,4]);
 const original=await db.$queryRaw`SELECT "countedQuantity" FROM "StocktakeLine" WHERE "id"='original-line'`;assert.equal(Number(original[0].countedQuantity),4);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
