import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PostgreSQL bulk route commits once, preserves controls and rejects stale preview',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema=`bulk_price_test_${randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  // Reproduce the former production failure using the same native Prisma/PG types.
  await assert.rejects(db.$transaction(tx=>tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'isolated-bulk-old'})) AS locked`),error=>error.code==='P2010'&&/void/.test(error.message));
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" bool)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"salePrice" numeric,"active" bool)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"salePrice" numeric,"active" bool,"currentStock" numeric,"updatedAt" timestamp,primary key("storeId","productId"))',
   'CREATE TABLE "ProductPriceHistory"("id" text primary key,"companyId" text,"productId" text,"storeId" text,"oldPrice" numeric,"newPrice" numeric,"changeType" text,"createdByUserId" text,"createdAt" timestamp default CURRENT_TIMESTAMP)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES('store','company','LAB',true),('control','company','CONTROL',true),('foreign','other','FOREIGN',true)`;
  await db.$executeRaw`INSERT INTO "Product" VALUES('product','company','TEST','SKU',2.4,true),('unrelated','company','CONTROL ITEM','CONTROL-SKU',1.2,true)`;
  await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('store','product',2.4,true,-2,NULL),('control','product',3.5,true,25,NULL),('store','unrelated',1.2,true,10,NULL)`;
  // The route imports only this explicitly isolated client; no production client is used.
  globalThis.prisma=db;
  const {default:router}=await import('../src/routes/owner-price-bulk-preview.js');
  const request=(path,body,companyId='company')=>new Promise(resolve=>{
   let status=200;
   router.handle({method:'POST',url:path,user:{companyId,id:'owner',fullName:'Isolated Owner'},body},
    {status(code){status=code;return this},json(data){resolve({status,data})}},error=>resolve({status:error?.status||500,error}));
  });
  const payload={productRefs:[{name:'TEST',sku:'SKU'}],storeNames:['LAB'],mode:'INCREASE_PERCENT',value:10};
  const before=await db.$queryRaw`SELECT "storeId","productId","salePrice","currentStock","active" FROM "StoreProduct" ORDER BY "storeId","productId"`;
  const preview=await request('/prices/bulk/preview',payload);assert.equal(preview.status,200);assert.equal(preview.data.counts.changed,1);assert.equal(preview.data.rows[0].oldPrice,2.4);assert.equal(preview.data.rows[0].newPrice,2.64);
  assert.deepEqual(await db.$queryRaw`SELECT "storeId","productId","salePrice","currentStock","active" FROM "StoreProduct" ORDER BY "storeId","productId"`,before,'preview must not write');
  const commitBody={...payload,previewHash:preview.data.previewHash,confirm:true};
  const result=await request('/prices/bulk/commit',commitBody);assert.equal(result.status,200,result.error?.message);assert.equal(result.data.changed,1);
  const after=await db.$queryRaw`SELECT "storeId","productId","salePrice","currentStock","active" FROM "StoreProduct" ORDER BY "storeId","productId"`;
  assert.equal(Number(after.find(r=>r.storeId==='store'&&r.productId==='product').salePrice),2.64);
  assert.deepEqual(after.map(r=>r.currentStock),before.map(r=>r.currentStock));
  assert.deepEqual(after.filter(r=>r.storeId==='control'||r.productId==='unrelated'),before.filter(r=>r.storeId==='control'||r.productId==='unrelated'));
  assert.equal(Number((await db.$queryRaw`SELECT "salePrice" FROM "Product" WHERE "id"='product'`)[0].salePrice),2.4);
  let audit=await db.$queryRaw`SELECT "oldPrice","newPrice","changeType" FROM "ProductPriceHistory"`;
  assert.equal(audit.length,1);assert.equal(Number(audit[0].oldPrice),2.4);assert.equal(Number(audit[0].newPrice),2.64);assert.equal(audit[0].changeType,'BULK_STORE_PRICE');
  assert.equal((await db.$queryRaw`SELECT "id" FROM "BulkPriceBatchAudit"`).length,1);
  const replay=await request('/prices/bulk/commit',commitBody);assert.equal(replay.status,409);assert.equal(replay.error.code,'BULK_PREVIEW_STALE');
  assert.equal((await db.$queryRaw`SELECT "id" FROM "ProductPriceHistory"`).length,1);assert.equal((await db.$queryRaw`SELECT "id" FROM "BulkPriceBatchAudit"`).length,1);
  assert.equal((await request('/prices/bulk/commit',{...commitBody,confirm:false})).status,400);
  const foreign=await request('/prices/bulk/preview',{...payload,storeNames:['FOREIGN']});assert.equal(foreign.status,409);assert.equal(foreign.data.code,'BULK_SELECTION_RESOLUTION_FAILED');
  const restore={...payload,mode:'SET',value:2.4};const restoredPreview=await request('/prices/bulk/preview',restore);assert.equal(restoredPreview.status,200);
  const restored=await request('/prices/bulk/commit',{...restore,previewHash:restoredPreview.data.previewHash,confirm:true});assert.equal(restored.status,200,restored.error?.message);
  assert.deepEqual(await db.$queryRaw`SELECT "storeId","productId","salePrice","currentStock","active" FROM "StoreProduct" ORDER BY "storeId","productId"`,before);
  audit=await db.$queryRaw`SELECT "id" FROM "ProductPriceHistory"`;assert.equal(audit.length,2);assert.equal((await db.$queryRaw`SELECT "id" FROM "BulkPriceBatchAudit"`).length,2);
 }finally{
  delete globalThis.prisma;await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
 }
});
