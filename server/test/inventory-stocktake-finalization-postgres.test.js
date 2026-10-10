import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';

const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test('isolated PostgreSQL preserves stocktake differences, committed movements and single finalization',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient(),schema=`inventory_test_${randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  const stocktake={id:'take',companyId:'company',storeId:'store',scopeType:'PARTIAL_PRODUCTS',scopeJson:{productIds:['product']}};
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const definitions=[
      'CREATE TABLE "Stocktake"("id" text primary key,"companyId" text,"storeId" text,"status" text,"liveDuringTrading" bool,"finalizedAt" timestamp,"finalizedByUserId" text,"snapshotJson" jsonb,"updatedAt" timestamp)',
      'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"expectedQuantity" numeric,"countedQuantity" numeric,"unitCost" numeric,"recountRequired" bool,"updatedAt" timestamp)',
      'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric,"updatedAt" timestamp,primary key("storeId","productId"))',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text)',
      'CREATE TABLE "StocktakeMovementAdjustment"("id" text,"stocktakeId" text,"lineId" text,"movementId" text,"quantity" numeric,"expectedBefore" numeric,"expectedAfter" numeric,"movementType" text,unique("stocktakeId","movementId"))'
    ];
    for(const sql of definitions)await db.$executeRawUnsafe(sql);
    const bootstrap=fs.readFileSync(new URL('../src/owner-product-bootstrap.js',import.meta.url),'utf8');
    for(const match of bootstrap.matchAll(/`(CREATE OR REPLACE FUNCTION "mws_adjust_live_stocktake_expected"[\s\S]*?\$\$ LANGUAGE plpgsql|CREATE TRIGGER "mws_live_stocktake_expected_after_movement"[^`]+)`/g))await db.$executeRawUnsafe(match[1]);
    const reset=async(live=true,counted=8,recount=false)=>{
      await db.$executeRawUnsafe('TRUNCATE "StocktakeMovementAdjustment","StockMovement","StocktakeLine","StoreProduct","Stocktake"');
      await db.$executeRaw`INSERT INTO "Stocktake"("id","companyId","storeId","status","liveDuringTrading") VALUES('take','company','store','DRAFT',${live})`;
      await db.$executeRaw`INSERT INTO "StocktakeLine"("id","stocktakeId","productId","expectedQuantity","countedQuantity","unitCost","recountRequired") VALUES('line','take','product',10,${counted},1,${recount})`;
      await db.$executeRaw`INSERT INTO "StoreProduct" VALUES('store','product',10,NULL),('store','unrelated',25,NULL),('control','product',30,NULL)`;
    };
    const finish=()=>db.$transaction(tx=>finalizeInventoryStocktake(tx,stocktake,'owner'),{timeout:15000});
    const read=async()=>{
      const [line]=await db.$queryRaw`SELECT "expectedQuantity","countedQuantity" FROM "StocktakeLine" WHERE "id"='line'`;
      const [parent]=await db.$queryRaw`SELECT "status","snapshotJson" FROM "Stocktake" WHERE "id"='take'`;
      const stocks=await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct" ORDER BY "storeId","productId"`;
      const movements=await db.$queryRaw`SELECT "quantity" FROM "StockMovement" WHERE "sourceType"='INVENTORY_V2'`;
      const adjustments=await db.$queryRaw`SELECT "quantity" FROM "StocktakeMovementAdjustment"`;
      assert.equal(Number(stocks.find(row=>row.storeId==='control').currentStock),30);
      assert.equal(Number(stocks.find(row=>row.productId==='unrelated').currentStock),25);
      return {expected:Number(line.expectedQuantity),counted:line.countedQuantity===null?null:Number(line.countedQuantity),status:parent.status,snapshot:parent.snapshotJson,stock:Number(stocks.find(row=>row.storeId==='store'&&row.productId==='product').currentStock),movements:movements.map(row=>Number(row.quantity)),adjustments:adjustments.map(row=>Number(row.quantity))};
    };
    await reset();await finish();
    let result=await read();assert.equal(result.expected,10);assert.equal(result.stock,8);assert.equal(result.snapshot.totalDifference,-2);assert.deepEqual(result.movements,[-2]);assert.deepEqual(result.adjustments,[]);
    await assert.rejects(finish(),{status:409});assert.deepEqual(await read(),result);
    await reset();const concurrent=await Promise.allSettled([finish(),finish()]);
    assert.equal(concurrent.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(concurrent.find(row=>row.status==='rejected').reason.status,409);assert.deepEqual((await read()).movements,[-2]);
    for(const [counted,recount] of [[null,false],[8,true]]){await reset(true,counted,recount);await assert.rejects(finish(),{status:409});result=await read();assert.equal(result.status,'DRAFT');assert.equal(result.stock,10);assert.deepEqual(result.movements,[])}
    // A movement committed after an offline snapshot must survive finalization.
    await reset(false);await db.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"-3 WHERE "storeId"='store' AND "productId"='product'`;
      await tx.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES('sale','store','product','SALE',-3)`;
    });await finish();result=await read();assert.equal(result.stock,5);assert.equal(result.expected,10);assert.deepEqual(result.movements,[-2]);
    // With live trading, that same sale updates the expected quantity first.
    await reset(true);await db.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"-3 WHERE "storeId"='store' AND "productId"='product'`;
      await tx.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES('sale','store','product','SALE',-3)`;
    });await finish();result=await read();assert.equal(result.expected,7);assert.equal(result.stock,8);assert.deepEqual(result.movements,[1]);assert.deepEqual(result.adjustments,[-3]);assert.equal(result.snapshot.totalDifference,1);
    await reset();await assert.rejects(db.$transaction(async tx=>{await finalizeInventoryStocktake(tx,stocktake,'owner');throw new Error('forced rollback')}),/forced rollback/);result=await read();assert.equal(result.status,'DRAFT');assert.equal(result.stock,10);assert.deepEqual(result.movements,[]);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
