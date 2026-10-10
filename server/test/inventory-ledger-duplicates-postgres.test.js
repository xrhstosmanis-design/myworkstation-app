import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('isolated PostgreSQL separates reusable product-card sources from duplicate operation identities',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient(),schema=`ledger_duplicate_test_${crypto.randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of ('CREATE TABLE "Store"("id" text primary key,"companyId" text); CREATE TABLE "Product"("id" text primary key,"companyId" text); CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"sourceType" text,"sourceId" text,"movementType" text,"quantity" numeric)').split('; '))await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Store" VALUES('store','company'),('control','company'),('foreign','other')`;
    await db.$executeRaw`INSERT INTO "Product" VALUES('product','company'),('unrelated','company'),('foreign','other')`;
    const source=fs.readFileSync(new URL('../src/routes/inventory-product-ledger.js',import.meta.url),'utf8');
    const sql=source.match(/SELECT sm\."sourceType",sm\."sourceId",sm\."movementType",sm\."quantity",COUNT\(\*\)::int AS "count"[\s\S]*?ORDER BY COUNT\(\*\) DESC/)[0];
    const query=new Function('prisma','storeId','productId','companyId','return prisma.$queryRaw`'+sql+'`;');
    const add=async(id,type,key,store='store',product='product')=>db.$executeRaw`INSERT INTO "StockMovement" VALUES(${id},${store},${product},${type},${key},'WASTE',-1)`;
    await add('old-manual','PRODUCT_CARD','product');await add('expired','PRODUCT_CARD','product');
    assert.deepEqual(await query(db,'store','product','company'),[],'two legitimate product-card actions are not duplicate operations');
    for(const type of ['ONLINE_ORDER_RECIPE','INVENTORY_V2','INVENTORY_TRANSFER']){
      await add(type+'-a',type,type+'-key');await add(type+'-b',type,type+'-key');
    }
    await add('control-a','ONLINE_ORDER_RECIPE','control-key','control');await add('control-b','ONLINE_ORDER_RECIPE','control-key','control');
    await add('other-product-a','ONLINE_ORDER_RECIPE','other-product-key','store','unrelated');await add('other-product-b','ONLINE_ORDER_RECIPE','other-product-key','store','unrelated');
    await add('foreign-a','ONLINE_ORDER_RECIPE','foreign-key','foreign','foreign');await add('foreign-b','ONLINE_ORDER_RECIPE','foreign-key','foreign','foreign');
    await add('single','ONLINE_ORDER_RECIPE','single-key');await add('another','ONLINE_ORDER_RECIPE','another-key');await add('null-a',null,null);await add('null-b',null,null);
    const rows=await query(db,'store','product','company');
    assert.deepEqual(rows.map(r=>r.sourceType).sort(),['INVENTORY_TRANSFER','INVENTORY_V2','ONLINE_ORDER_RECIPE']);
    assert.ok(rows.every(r=>Number(r.count)===2&&Number(r.quantity)===-1));
    assert.deepEqual(await query(db,'store','product','other'),[]);
    const [total]=await db.$queryRaw`SELECT COUNT(*)::int AS count,SUM("quantity") AS quantity FROM "StockMovement" WHERE "storeId"='store' AND "productId"='product'`;
    assert.equal(total.count,12);assert.equal(Number(total.quantity),-12,'classification never changes or removes stock movements');
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
