import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {destroyInventoryProduct} from '../src/lib/inventory-product-destruction.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('isolated PostgreSQL serializes real destruction requests and preserves live stocktake/control ledger',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient(),schema=`waste_test_${crypto.randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Store"("id" text primary key,"companyId" text)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"costPrice" numeric)',
      'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric,"updatedAt" timestamp,primary key("storeId","productId"))',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text)',
      'CREATE TABLE "Stocktake"("id" text primary key,"storeId" text,"status" text,"liveDuringTrading" bool)',
      'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"expectedQuantity" numeric,"updatedAt" timestamp)',
      'CREATE TABLE "StocktakeMovementAdjustment"("id" text,"stocktakeId" text,"lineId" text,"movementId" text,"quantity" numeric,"expectedBefore" numeric,"expectedAfter" numeric,"movementType" text,unique("stocktakeId","movementId"))'
    ])await db.$executeRawUnsafe(sql);
    const bootstrap=fs.readFileSync(new URL('../src/owner-product-bootstrap.js',import.meta.url),'utf8');
    for(const m of bootstrap.matchAll(/`(CREATE OR REPLACE FUNCTION "mws_adjust_live_stocktake_expected"[\s\S]*?\$\$ LANGUAGE plpgsql|CREATE TRIGGER "mws_live_stocktake_expected_after_movement"[^`]+)`/g))await db.$executeRawUnsafe(m[1]);
    const handlers=new Map(),Router=()=>Object.fromEntries(['get','post','delete','use','patch','put'].map(method=>[method,(path,...hs)=>handlers.set(method+path,hs.at(-1))]));
    const source=fs.readFileSync(new URL('../src/routes/owner-product-actions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','prisma','crypto','z','requireCompanyModule','destroyInventoryProduct',source)(Router,db,crypto,z,()=>()=>{},destroyInventoryProduct);
    const run=(quantity=1,companyId='company')=>new Promise((resolve,reject)=>handlers.get('post/:productId/destruction')({params:{productId:'product'},user:{companyId,id:'owner'},body:{storeId:'store',quantity,reason:'N39 isolated waste'}},{json:resolve,status(){return this}},reject));
    const reset=async()=>{
      await db.$executeRawUnsafe('TRUNCATE "StocktakeMovementAdjustment","StockMovement","StocktakeLine","Stocktake","StoreProduct","Product","Store"');
      await db.$executeRaw`INSERT INTO "Store" VALUES('store','company'),('control','company'),('foreign','other')`;
      await db.$executeRaw`INSERT INTO "Product" VALUES('product','company','virtual',1),('unrelated','company','control',1)`;
      await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('store','product',10,NULL),('store','unrelated',25,NULL),('control','product',30,NULL)`;
      await db.$executeRaw`INSERT INTO "Stocktake" VALUES('take','store','DRAFT',true)`;
      await db.$executeRaw`INSERT INTO "StocktakeLine" VALUES('line','take','product',10,NULL)`;
    };
    const read=async()=>{
      const stocks=await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct"`;
      assert.equal(Number(stocks.find(r=>r.storeId==='control').currentStock),30);assert.equal(Number(stocks.find(r=>r.productId==='unrelated').currentStock),25);
      const [line]=await db.$queryRaw`SELECT "expectedQuantity" FROM "StocktakeLine"`;
      const moves=await db.$queryRaw`SELECT "quantity","note","createdByUserId" FROM "StockMovement"`;
      return {stock:Number(stocks.find(r=>r.storeId==='store'&&r.productId==='product').currentStock),expected:Number(line.expectedQuantity),moves:moves.map(r=>({...r,quantity:Number(r.quantity)}))};
    };
    await reset();const results=await Promise.all([run(),run()]);
    assert.deepEqual(results.map(r=>r.previousStock).sort((a,b)=>a-b),[9,10]);
    let state=await read();assert.equal(state.stock,8);assert.equal(state.expected,8);assert.equal(state.moves.length,2);assert.equal(state.moves.reduce((sum,r)=>sum+r.quantity,0),-2);assert.ok(state.moves.every(r=>r.note==='N39 isolated waste'&&r.createdByUserId==='owner'));
    await reset();const sufficient=await Promise.allSettled([run(7),run(7)]);
    assert.equal(sufficient.filter(r=>r.status==='fulfilled').length,1);assert.equal(sufficient.find(r=>r.status==='rejected').reason.status,400);
    state=await read();assert.equal(state.stock,3);assert.equal(state.expected,3);assert.equal(state.moves.length,1);
    await reset();await Promise.all([run(),db.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"-3 WHERE "storeId"='store' AND "productId"='product'`;
      await tx.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES('competing','store','product','SALE',-3)`;
    })]);state=await read();assert.equal(state.stock,6);assert.equal(state.expected,6);assert.equal(state.moves.length,2);
    await reset();await assert.rejects(run(1,'other'),{status:404});assert.equal((await read()).stock,10);
    await assert.rejects(db.$transaction(async tx=>{await destroyInventoryProduct(tx,{companyId:'company',storeId:'store',productId:'product',quantity:1,reason:'rollback',userId:'owner'});throw new Error('forced rollback')}),/forced rollback/);
    state=await read();assert.equal(state.stock,10);assert.equal(state.expected,10);assert.equal(state.moves.length,0);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
