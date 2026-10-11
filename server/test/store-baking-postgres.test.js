import {changeSameProductBakedStock,maybeChangeSameProductStock} from '../src/store-baking-same-product.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ensureStoreBakingSchema,saveBakingPolicy,recordBaking,policyAvailable,bakingEntrySchema,readStoreBakingState,bakingPolicySchema} from '../src/store-baking.js';
import {postCommercialSale} from '../src/routes/kat-online-ordering.js';
import {reserveSharedStock} from '../src/routes/store-pos.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('availability policies and baking quantities are explicit',()=>{
 assert.equal(policyAvailable({availabilityMode:'ALWAYS',currentStock:0},10),true);
 assert.equal(policyAvailable({availabilityMode:'STOCK',currentStock:0,trackStock:false}),false);
 assert.equal(policyAvailable({availabilityMode:'BAKED',currentStock:3},4),false);
 assert.equal(policyAvailable({availabilityMode:'BAKED',currentStock:3},3),true);
 assert.equal(policyAvailable({availabilityMode:'BAKED_SAME',currentStock:0}),false);
 assert.equal(policyAvailable({availabilityMode:'BAKED_SAME',currentStock:15},16),false);
 assert.equal(bakingPolicySchema.safeParse({mode:'BAKED_SAME'}).success,true);
 assert.equal(bakingPolicySchema.safeParse({mode:'BAKED_SAME',sourceProductId:'raw'}).success,false);
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
 await assert.rejects(policy({mode:'STOCK'}),/συνταγή/);
 await policy({mode:'ALWAYS'});await assert.rejects(bake({...body,idempotencyKey:crypto.randomUUID()}),/σύνδεση/);
 // One commercial identity uses a baked sub-balance, not a second product.
 await db.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'PIECE', ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Τυρόπιτα'`);
 await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","active","trackStock","sku") VALUES('kouro','company',TRUE,TRUE,'KOURO')`);
 await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('store','kouro',TRUE,40,NOW())`);
 await db.$executeRawUnsafe(`INSERT INTO "PreparationRecipeLine" VALUES('company','kouro',TRUE)`);
 const samePolicy=mode=>db.$transaction(tx=>saveBakingPolicy(tx,{companyId:'company',storeId:'store',productId:'kouro',actorId:'owner',body:{mode}}));
 await samePolicy('BAKED_SAME');
 const sameBake=quantity=>db.$transaction(tx=>changeSameProductBakedStock(tx,{companyId:'company',storeId:'store',actorId:'staff',actorName:'Staff',kind:'BAKE',body:{productId:'kouro',quantity,idempotencyKey:crypto.randomUUID()}}));
 const split=async()=>{const [r]=await db.$queryRaw`SELECT sp."currentStock" AS total,b."bakedQuantity" AS baked FROM "StoreProduct" sp JOIN "StoreBakedBalance" b ON b."storeId"=sp."storeId" AND b."productId"=sp."productId" WHERE sp."storeId"='store' AND sp."productId"='kouro'`;return {total:Number(r.total),baked:Number(r.baked),raw:Number(r.total)-Number(r.baked)}};
 await sameBake(15);assert.deepEqual(await split(),{total:40,baked:15,raw:25});
 const staffView=await readStoreBakingState(db,'company','store');assert.equal(staffView.products.length,1);assert.equal(staffView.products[0].productId,'kouro');assert.equal(staffView.products[0].sameProduct,true);assert.equal(Number(staffView.products[0].currentStock),15);assert.equal(Number(staffView.products[0].sourceStock),25);assert.equal(staffView.history[0].actorName,'Staff');
 assert.equal((await readStoreBakingState(db,'other','store')).products.length,0);
 await db.$transaction(tx=>reserveSharedStock(tx,{companyId:'company',storeId:'store',productId:'kouro',quantity:1,productName:'Κουρού',saleId:'same-pos',saleLineId:crypto.randomUUID(),actorId:'staff',actorName:'Staff'}));
 assert.deepEqual(await split(),{total:39,baked:14,raw:25});
 await assert.rejects(db.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=13 WHERE "storeId"='store' AND "productId"='kouro'`,/MWS_BAKED_TOTAL_GUARD/);
 await assert.rejects(samePolicy('ALWAYS'),/πρώτα πώληση ή φύρα/);
 await db.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"+5 WHERE "storeId"='store' AND "productId"='kouro'`;
 await sameBake(2);assert.deepEqual(await split(),{total:44,baked:16,raw:28});
 await db.$executeRawUnsafe(`INSERT INTO "OnlineOrder"("id") VALUES('same-online')`);
 await db.$executeRawUnsafe(`INSERT INTO "OnlineOrderLine" VALUES('same-online-line','same-online','kouro','Κουρού',2,1.4,2.8,'[]',NOW())`);
 const sameOrder={id:'same-online',orderNumber:'ONL-SAME',total:2.8,paymentMethod:'CASH'};
 const sameSale=await db.$transaction(tx=>postCommercialSale(tx,{store:{id:'store',companyId:'company'},order:sameOrder,user:{id:'staff',fullName:'Staff',tokenType:'STORE_OPERATOR'},config:{stockCheckEnabled:false}}));
 assert.deepEqual(await split(),{total:42,baked:14,raw:28});
 assert.equal(await db.$transaction(tx=>postCommercialSale(tx,{order:{...sameOrder,saleId:sameSale}})),sameSale);
 const finalConsumers=await Promise.allSettled([1,2].map(i=>db.$transaction(tx=>reserveSharedStock(tx,{companyId:'company',storeId:'store',productId:'kouro',quantity:14,productName:'Κουρού',saleId:`same-last-${i}`,saleLineId:crypto.randomUUID(),actorId:'staff',actorName:'Staff'}))));
 assert.equal(finalConsumers.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await split(),{total:28,baked:0,raw:28});
 const restoreKey=crypto.randomUUID(),restore=()=>db.$transaction(tx=>maybeChangeSameProductStock(tx,{companyId:'company',storeId:'store',productId:'kouro',quantity:1,kind:'RESTORE',actorId:'staff',actorName:'Staff',note:'Return hook',idempotencyKey:restoreKey}));
 assert.equal(await restore(),true);assert.equal(await restore(),true);assert.deepEqual(await split(),{total:29,baked:1,raw:28});
 await db.$transaction(tx=>maybeChangeSameProductStock(tx,{companyId:'company',storeId:'store',productId:'kouro',quantity:1,kind:'CONSUME',actorId:'staff',actorName:'Staff',note:'Waste hook'}));
 assert.deepEqual(await split(),{total:28,baked:0,raw:28});
 await samePolicy('ALWAYS');assert.equal(await db.$transaction(tx=>maybeChangeSameProductStock(tx,{companyId:'company',storeId:'store',productId:'kouro',quantity:1,kind:'CONSUME',actorId:'staff',actorName:'Staff'})),false);
 const [movementTotals]=await db.$queryRaw`SELECT COUNT(*)::int AS count,SUM("quantity") AS quantity FROM "StockMovement" WHERE "productId"='kouro'`;
 assert.equal(movementTotals.count,3);assert.equal(Number(movementTotals.quantity),-17);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
