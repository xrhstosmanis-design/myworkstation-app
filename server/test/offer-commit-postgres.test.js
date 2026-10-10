import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('native PostgreSQL scoped offers create atomically, reject overlap/foreign scope and pause without price or stock mutation',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema=`offer_test_${randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await assert.rejects(db.$transaction(tx=>tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'isolated-old-offer-lock'})) AS locked`),e=>e.code==='P2010'&&/void/.test(e.message));
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" bool)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"salePrice" numeric,"active" bool)',
   'CREATE TABLE "ProductBarcode"("id" text primary key,"productId" text,"barcode" text)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"salePrice" numeric,"currentStock" numeric,primary key("storeId","productId"))',
   'CREATE TABLE "PriceCatalogPromotion"("id" text primary key,"companyId" text,"productId" text,"promotionType" text,"offerMode" text,"originalPrice" numeric,"offerPrice" numeric,"discountPercent" numeric,"discountAmount" numeric,"saleQuantity" numeric,"bonusQuantity" numeric,"customerPoints" numeric,"validFrom" timestamptz,"validUntil" timestamptz,"active" bool,"createdByUserId" text,"createdByName" text,"updatedAt" timestamptz default NOW())',
   'CREATE TABLE "PriceCatalogPromotionStore"("promotionId" text,"companyId" text,"storeId" text,primary key("promotionId","storeId"))'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES('store','company','LAB',true),('control','company','CONTROL',true),('foreign','other','FOREIGN',true)`;
  await db.$executeRaw`INSERT INTO "Product" VALUES('a','company','A',1.2,true),('b','company','B',2.4,true),('foreign','other','FOREIGN',9,true)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('store','a',1.2,5),('store','b',2.4,-2),('control','b',3.5,25)`;
  globalThis.prisma=db;
  const {default:router}=await import('../src/routes/price-catalog-promotion-guard.js');
  const request=(method,path,body,role='OWNER')=>new Promise(resolve=>{let status=200;router.handle({method,url:path,user:{companyId:'company',id:'owner',fullName:'Isolated Owner',role},body},{status(c){status=c;return this},json(data){resolve({status,data})}},error=>resolve({status:error?.status||500,error}));});
  const before=await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`;
  const productBefore=await db.$queryRaw`SELECT * FROM "Product" ORDER BY "id"`;
  const body={productIds:['b'],promotionType:'LEAFLET',offerMode:'DISCOUNT_PERCENT',discountPercent:10,validFrom:'2026-10-11T10:00',validUntil:'2026-10-11T11:00',active:true,storeIds:['store']};
  const first=await request('POST','/promotions/scoped/bulk',body);assert.equal(first.status,201,first.error?.message);assert.equal(first.data.created,1);assert.deepEqual(first.data.storeIds,['store']);
  const offerId=first.data.items[0].id;
  let rows=await db.$queryRaw`SELECT * FROM "PriceCatalogPromotion"`;assert.equal(rows.length,1);assert.equal(rows[0].id,offerId);assert.equal(rows[0].productId,'b');assert.equal(rows[0].offerMode,'DISCOUNT_PERCENT');assert.equal(Number(rows[0].discountPercent),10);assert.equal(rows[0].validFrom.toISOString(),'2026-10-11T07:00:00.000Z');assert.equal(rows[0].validUntil.toISOString(),'2026-10-11T08:00:00.000Z');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "PriceCatalogPromotionStore"`,[{promotionId:offerId,companyId:'company',storeId:'store'}]);
  // Bulk checks all products before writes: A sorts first, but B already overlaps.
  const overlap=await request('POST','/promotions/scoped/bulk',{...body,productIds:['a','b']});assert.equal(overlap.status,409);assert.equal(overlap.data.code,'PROMOTION_STORE_OVERLAP');assert.equal((await db.$queryRaw`SELECT "id" FROM "PriceCatalogPromotion"`).length,1);
  assert.equal((await request('POST','/promotions/scoped/bulk',{...body,storeIds:['foreign']})).status,400);
  assert.equal((await request('POST','/promotions/scoped/bulk',{...body,productIds:['foreign']})).status,400);
  assert.equal((await request('POST','/promotions/scoped/bulk',body,'EMPLOYEE')).status,403);
  const pause=await request('PATCH',`/promotions/${offerId}/scoped`,{active:false,storeIds:['store']});assert.equal(pause.status,200,pause.error?.message);assert.equal(pause.data.posActive,false);
  rows=await db.$queryRaw`SELECT * FROM "PriceCatalogPromotion"`;assert.equal(rows.length,1);assert.equal(rows[0].active,false);
  const {default:ownerRouter}=await import('../src/routes/owner-products.js');
  const XLSX=(await import('xlsx')).default;
  await db.$executeRaw`INSERT INTO "ProductBarcode" VALUES('ba','a','12345678'),('bb','b','87654321')`;
  const named={...body,name:'Barcode fixture',barcode:'12345678',productIds:['b'],validFrom:'2026-10-12T10:00',validUntil:'2026-10-12T11:00'};
  const barcode=await request('POST','/promotions/scoped/barcode',named);assert.equal(barcode.status,201,barcode.error?.message);
  const namedRow=(await db.$queryRaw`SELECT * FROM "PriceCatalogPromotion" WHERE "id"=${barcode.data.items[0].id}`)[0];assert.equal(namedRow.productId,'a');assert.equal(namedRow.name,'Barcode fixture');
  const count=async()=>Number((await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "PriceCatalogPromotion"`)[0].count);
  assert.equal((await request('POST','/promotions/scoped/barcode',{...named,barcode:'unknown'})).status,400);assert.equal(await count(),2);
  const row={Barcode:'87654321','Όνομα προσφοράς':'Excel fixture','Τύπος':'PERCENT','Από':'2026-10-13T10:00','Έως':'2026-10-13T11:00','Έκπτωση %':5};
  const importRows=(rows,sourceStoreId='store',targetStoreIds=[])=>new Promise(resolve=>{
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'Offers');const dataUrl='data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,'+XLSX.write(book,{type:'base64',bookType:'xlsx'});let status=200;
   ownerRouter.handle({method:'POST',url:'/promotions/import-excel',user:{role:'SUPER_ADMIN',companyId:'company',id:'owner',fullName:'Isolated Owner'},body:{dataUrl,sourceStoreId,targetStoreIds}},{status(c){status=c;return this},json(data){resolve({status,data})}},error=>resolve({status:error?.status||500,error}));
  });
  assert.equal((await importRows([row,{...row,Barcode:'unknown'}])).status,400);assert.equal(await count(),2,'invalid later row must not persist earlier row');
  assert.equal((await importRows([{...row,'Έκπτωση %':101}])).status,400);assert.equal(await count(),2);
  assert.equal((await importRows([row],'foreign')).status,400);assert.equal(await count(),2);
  const imported=await importRows([row],'store',['control']);assert.equal(imported.status,201,imported.error?.message);assert.equal(imported.data.created,1);assert.equal(imported.data.stores,2);assert.equal(await count(),3);
  const excelId=imported.data.items[0].id;
  const excel=(await db.$queryRaw`SELECT * FROM "PriceCatalogPromotion" WHERE "id"=${excelId}`)[0];assert.equal(excel.name,'Excel fixture');assert.equal(excel.productId,'b');assert.equal(Number(excel.discountPercent),5);assert.equal(excel.validFrom.toISOString(),'2026-10-13T07:00:00.000Z');
  assert.equal((await db.$queryRaw`SELECT * FROM "PriceCatalogPromotionStore" WHERE "promotionId"=${excelId}`).length,2);
  assert.equal((await importRows([{...row,Barcode:'12345678'},row])).status,409);assert.equal(await count(),3,'transaction must roll back an earlier valid row on later overlap');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`,before);
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "Product" ORDER BY "id"`,productBefore);
 }finally{delete globalThis.prisma;await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
