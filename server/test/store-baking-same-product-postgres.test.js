import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ensureSameProductBakingSchema,changeSameProductBakedStock,sameProductBakingSchema} from '../src/store-baking-same-product.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('same-product baking accepts only an explicit SKU, whole pieces and stable request identity',()=>{
 const body={productId:'kouro',quantity:15,idempotencyKey:crypto.randomUUID()};
 assert.equal(sameProductBakingSchema.parse(body).note,'');
 for(const quantity of [0,-1,1.5,'15',Infinity,100001])assert.equal(sameProductBakingSchema.safeParse({...body,quantity}).success,false);
 assert.equal(sameProductBakingSchema.safeParse({...body,sourceProductId:'other'}).success,false);
});

test('native single SKU: receipt40 partitions25/15, sale preservesraw25, retries and competing consumers are atomic',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema=`same_baking_test_${crypto.randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);
 url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const statement of [
   'CREATE TABLE "Company"("id" TEXT PRIMARY KEY)',
   'CREATE TABLE "Store"("id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN)',
   'CREATE TABLE "Product"("id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN,"unit" TEXT,"sku" TEXT,"salePrice" NUMERIC,"vatRate" NUMERIC)',
   'CREATE TABLE "StoreProduct"("storeId" TEXT,"productId" TEXT,"active" BOOLEAN,"currentStock" NUMERIC,"updatedAt" TIMESTAMPTZ,PRIMARY KEY("storeId","productId"))',
   `INSERT INTO "Company" VALUES('company'),('other')`,
   `INSERT INTO "Store" VALUES('store','company',TRUE),('control','company',TRUE),('foreign','other',TRUE)`,
   `INSERT INTO "Product" VALUES('kouro','company',TRUE,TRUE,'PIECE','KOURO',1.4,13),('untracked','company',TRUE,FALSE,'PIECE','NO',1,13),('weight','company',TRUE,TRUE,'KG','KG',1,13)`,
   `INSERT INTO "StoreProduct" VALUES('store','kouro',TRUE,40,NOW()),('control','kouro',TRUE,40,NOW()),('store','untracked',TRUE,40,NOW()),('store','weight',TRUE,40,NOW())`
  ])await db.$executeRawUnsafe(statement);
  await ensureSameProductBakingSchema(db);await ensureSameProductBakingSchema(db);
  const act=(kind,body,companyId='company',storeId='store')=>db.$transaction(tx=>changeSameProductBakedStock(tx,{companyId,storeId,actorId:'staff',actorName:'Χειριστής',kind,body}));
  const entry=(quantity,note='')=>({productId:'kouro',quantity,note,idempotencyKey:crypto.randomUUID()});
  const snapshot=async()=>{const [r]=await db.$queryRaw`SELECT sp."currentStock" AS total,COALESCE(b."bakedQuantity",0) AS baked FROM "StoreProduct" sp LEFT JOIN "StoreBakedBalance" b ON b."storeId"=sp."storeId" AND b."productId"=sp."productId" WHERE sp."storeId"='store' AND sp."productId"='kouro'`;return {total:Number(r.total),baked:Number(r.baked),raw:Number(r.total)-Number(r.baked)}};
  const batch=entry(15,'Πρωί'),results=await Promise.all([act('BAKE',batch),act('BAKE',batch)]);
  assert.equal(results.filter(r=>r.duplicate).length,1);assert.deepEqual(await snapshot(),{total:40,baked:15,raw:25});
  const first=results.find(r=>!r.duplicate);assert.equal(first.unbakedBefore,40);assert.equal(first.unbakedAfter,25);assert.equal(first.totalBefore,first.totalAfter);
  const sale=entry(1,'POS');await act('CONSUME',sale);await act('CONSUME',sale);assert.deepEqual(await snapshot(),{total:39,baked:14,raw:25});
  await assert.rejects(act('BAKE',{...batch,quantity:14}),/διαφορετικά/);
  await assert.rejects(act('CONSUME',batch),/διαφορετικά/);
  await assert.rejects(act('BAKE',entry(26)),/αρκετά άψητα/);
  await assert.rejects(act('CONSUME',entry(15)),/αρκετά ψημένα/);
  await assert.rejects(act('BAKE',entry(1),'other'),/ενεργό είδος/);
  await assert.rejects(act('BAKE',entry(1),'company','foreign'),/ενεργό είδος/);
  for(const productId of ['untracked','weight'])await assert.rejects(act('BAKE',{...entry(1),productId}),/τεμάχια/);
  // A subsequent receipt adds unbaked pieces; no baked stock is silently reset.
  await db.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"+5 WHERE "storeId"='store' AND "productId"='kouro'`;
  assert.deepEqual(await snapshot(),{total:44,baked:14,raw:30});
  await act('BAKE',entry(2,'Αργότερα'));assert.deepEqual(await snapshot(),{total:44,baked:16,raw:28});
  await act('CONSUME',entry(15,'Online'));assert.deepEqual(await snapshot(),{total:29,baked:1,raw:28});
  const competing=await Promise.allSettled([act('CONSUME',entry(1,'POS A')),act('CONSUME',entry(1,'POS B'))]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await snapshot(),{total:28,baked:0,raw:28});
  const restore=entry(1,'Αναίρεση');await act('RESTORE',restore);await act('RESTORE',restore);assert.deepEqual(await snapshot(),{total:29,baked:1,raw:28});
  await assert.rejects(db.$transaction(async tx=>{await changeSameProductBakedStock(tx,{companyId:'company',storeId:'store',actorId:'staff',actorName:'Χειριστής',kind:'CONSUME',body:entry(1)});throw new Error('rollback')}),/rollback/);
  assert.deepEqual(await snapshot(),{total:29,baked:1,raw:28});
  const [control]=await db.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='control' AND "productId"='kouro'`;assert.equal(Number(control.currentStock),40);
  const [product]=await db.$queryRaw`SELECT "sku","salePrice","vatRate" FROM "Product" WHERE "id"='kouro'`;assert.deepEqual({sku:product.sku,price:Number(product.salePrice),vat:Number(product.vatRate)},{sku:'KOURO',price:1.4,vat:13});
  const events=await db.$queryRaw`SELECT * FROM "StoreBakedBalanceEvent" ORDER BY "createdAt","id"`;
  assert.equal(events.length,6);for(const event of events){assert.equal(event.productId,'kouro');assert.equal(event.actorId,'staff');assert.equal(Number(event.totalAfter),Number(event.unbakedAfter)+Number(event.bakedAfter))}
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
