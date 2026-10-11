import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ensureStoreBakingSchema,saveBakingPolicy,recordBaking,policyAvailable,bakingEntrySchema} from '../src/store-baking.js';
import {postCommercialSale} from '../src/routes/kat-online-ordering.js';
import {reserveSharedStock} from '../src/routes/store-pos.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('availability policies and baking quantities are explicit',()=>{
 assert.equal(policyAvailable({availabilityMode:'ALWAYS',currentStock:0},10),true);
 assert.equal(policyAvailable({availabilityMode:'STOCK',currentStock:0,trackStock:false}),false);
 assert.equal(policyAvailable({availabilityMode:'BAKED',currentStock:3},4),false);
 assert.equal(policyAvailable({availabilityMode:'BAKED',currentStock:3},3),true);
 assert.equal(policyAvailable({name:'Coffee pastry',currentStock:0}),null);
 for(const quantity of [0,-1,1.5,'2'])assert.equal(bakingEntrySchema.safeParse({productId:'baked',sourceProductId:'raw',quantity,idempotencyKey:crypto.randomUUID()}).success,false);
});
test('native baking moves stock once, rejects stale mapping, rolls back and shares finished stock with POS',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');const admin=new PrismaClient(),schema=`baking_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 for(const sql of [
 'CREATE TABLE "Company"("id" text primary key)',
 'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" boolean)',
 `CREATE TABLE "Product"("id" text primary key,"companyId" text,"active" boolean,"trackStock" boolean,"sku" text DEFAULT '',"vatRate" numeric DEFAULT 13)`,
 'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"currentStock" numeric,"updatedAt" timestamptz,primary key("storeId","productId"))',
  'CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"status" text,"openedAt" timestamptz)',
 'CREATE TABLE "OnlineOrderLine"("id" text,"orderId" text,"productId" text,"productName" text,"quantity" numeric,"onlineUnitPrice" numeric,"lineTotal" numeric,"modifiersJson" jsonb,"createdAt" timestamptz)',
 'CREATE TABLE "OnlineOrder"("id" text,"saleId" text,"commercialPostedAt" timestamptz,"paymentStatus" text,"updatedAt" timestamptz)',
 'CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"operatorEmployeeId" text,"fiscalStatus" text,"subtotal" numeric,"discount" numeric,"total" numeric,"status" text,"source" text)',
 'CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric)',
 'CREATE TABLE "Payment"("id" text,"saleId" text,"method" text,"amount" numeric)',
 'CREATE TABLE "StoreTransaction"("id" text,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text)',
 'CREATE TABLE "PreparationRecipeLine"("companyId" text,"productId" text,"automatic" boolean)',
 'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text,"idempotencyKey" text)',
 'CREATE UNIQUE INDEX baking_movement_key ON "StockMovement"("storeId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL'
 ])await db.$executeRawUnsafe(sql);
 await ensureStoreBakingSchema(db);
 for(const sql of `INSERT INTO "Company" VALUES('company'),('other');INSERT INTO "Store" VALUES('store','company',true),('foreign','other',true),('inactive','company',false);INSERT INTO "Product"("id","companyId","active","trackStock") VALUES('raw','company',true,true),('baked','company',true,true),('foreign-product','other',true,true),('untracked','company',true,false);INSERT INTO "StoreProduct" VALUES('store','raw',true,10,NOW()),('store','baked',true,0,NOW()),('store','untracked',true,0,NOW()),('foreign','foreign-product',true,30,NOW());INSERT INTO "PreparationRecipeLine" VALUES('company','baked',true)`.split(';'))await db.$executeRawUnsafe(sql);
 const policy=body=>db.$transaction(tx=>saveBakingPolicy(tx,{companyId:'company',storeId:'store',productId:'baked',actorId:'owner',body}));
 await policy({mode:'BAKED',sourceProductId:'raw'});
 const body={productId:'baked',sourceProductId:'raw',quantity:4,idempotencyKey:crypto.randomUUID(),note:'Morning'};
 const bake=(entry=body,storeId='store')=>db.$transaction(tx=>recordBaking(tx,{companyId:'company',storeId,actorId:'operator',actorName:'Staff',body:entry}));
 const stock=async()=>Object.fromEntries((await db.$queryRaw`SELECT "productId","currentStock" FROM "StoreProduct" WHERE "storeId"='store'`).map(r=>[r.productId,Number(r.currentStock)]));
 const [a,b]=await Promise.all([bake(),bake()]);assert.equal([a,b].filter(r=>r.duplicate).length,1);assert.deepEqual(await stock(),{raw:6,baked:4,untracked:0});
 const moves=await db.$queryRaw`SELECT "quantity","sourceId" FROM "StockMovement"`;assert.equal(moves.length,2);assert.equal(moves.reduce((n,r)=>n+Number(r.quantity),0),0);assert.equal(moves[0].sourceId,moves[1].sourceId);
 const [audit]=await db.$queryRaw`SELECT * FROM "StoreBakingEntry"`;assert.equal(audit.actorId,'operator');assert.equal(audit.actorName,'Staff');assert.equal(Number(audit.sourceBefore),10);assert.equal(Number(audit.finishedAfter),4);
 await assert.rejects(bake({...body,quantity:3}),/διαφορετικά/);
 await assert.rejects(bake({...body,quantity:7,idempotencyKey:crypto.randomUUID()}),/αρκετά άψητα/);
 await assert.rejects(bake({...body,sourceProductId:'untracked',idempotencyKey:crypto.randomUUID()}),/σύνδεση/);
 await assert.rejects(bake({...body,idempotencyKey:crypto.randomUUID()},'foreign'),/ενεργό κατάστημα/);
 await assert.rejects(policy({mode:'BAKED',sourceProductId:'baked'}),/διαφορετικά είδη/);
 await assert.rejects(policy({mode:'BAKED',sourceProductId:'foreign-product'}),/ενεργά/);
 await assert.rejects(policy({mode:'BAKED',sourceProductId:'untracked'}),/παρακολουθούν/);
 assert.deepEqual(await stock(),{raw:6,baked:4,untracked:0});
 await db.$transaction(tx=>reserveSharedStock(tx,{companyId:'company',storeId:'store',productId:'baked',quantity:3,productName:'Pastry',saleId:'sale',saleLineId:'line'}));assert.deepEqual(await stock(),{raw:6,baked:1,untracked:0});
 const results=await Promise.allSettled([1,2].map(i=>db.$transaction(tx=>reserveSharedStock(tx,{companyId:'company',storeId:'store',productId:'baked',quantity:1,productName:'Pastry',saleId:`sale-${i}`,saleLineId:`line-${i}`}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await stock(),{raw:6,baked:0,untracked:0});
 await bake({...body,quantity:2,idempotencyKey:crypto.randomUUID()});
 await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES('shift','company','store','OPEN',NOW())`);
 await db.$executeRawUnsafe(`INSERT INTO "OnlineOrder"("id") VALUES('online')`);
 await db.$executeRawUnsafe(`INSERT INTO "OnlineOrderLine" VALUES('online-line','online','baked','Pastry',2,1,2,'[]',NOW())`);
 const order={id:'online',orderNumber:'ONL-TEST',total:2,paymentMethod:'CASH'};
 const saleId=await db.$transaction(tx=>postCommercialSale(tx,{store:{id:'store',companyId:'company'},order,user:{id:'operator',tokenType:'STORE_OPERATOR'},config:{stockCheckEnabled:false}}));
 assert.deepEqual(await stock(),{raw:4,baked:0,untracked:0});
 assert.equal(await db.$transaction(tx=>postCommercialSale(tx,{order:{...order,saleId}})),saleId);
 assert.equal(Number((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "StockMovement" WHERE "sourceType"='ONLINE_ORDER_SALE'`)[0].count),1);
 await policy({mode:'STOCK'});await assert.rejects(bake({...body,idempotencyKey:crypto.randomUUID()}),/σύνδεση/);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
