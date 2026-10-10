import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('real transfer route uses SQL-managed Product and balances new destination, replay and concurrent moves',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient(),schema=`transfer_test_${crypto.randomUUID().replaceAll('-','')}`;
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    assert.equal(db.product,undefined,'Product is SQL-managed, never a Prisma delegate');
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      'CREATE TABLE "Store"("id" text primary key,"companyId" text,"name" text,"active" boolean)',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"costPrice" numeric,"salePrice" numeric,"active" boolean)',
      'CREATE TABLE "StoreProduct"("id" text primary key,"storeId" text references "Store"("id"),"productId" text references "Product"("id"),"salePrice" numeric,"currentStock" numeric not null default 0,"active" boolean not null default true,"createdAt" timestamp not null default current_timestamp,"updatedAt" timestamp not null default current_timestamp,unique("storeId","productId"))',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text references "Store"("id"),"productId" text references "Product"("id"),"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text,"idempotencyKey" text,"createdAt" timestamp not null default current_timestamp)',
      'CREATE UNIQUE INDEX "StockMovement_store_idempotency_key" ON "StockMovement"("storeId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL'
    ])await db.$executeRawUnsafe(sql);
    const handlers=new Map();let guard;
    const Router=()=>({...Object.fromEntries(['get','post','patch','delete','put'].map(method=>[method,(path,...hs)=>handlers.set(method+path,hs.at(-1))])),use(fn){guard=fn}});
    const source=fs.readFileSync(new URL('../src/routes/inventory-archive.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','prisma','crypto','z',source)(Router,db,crypto,z);
    const run=(key,overrides={},user={companyId:'company',id:'owner',role:'OWNER'})=>new Promise((resolve,reject)=>{
      const req={user,body:{sourceStoreId:'source',destinationStoreId:'destination',productId:'product',quantity:1,reason:'N39 isolated transfer',idempotencyKey:key,...overrides}};
      let status=200;const res={status(code){status=code;return this},json(body){resolve({status,...body})}};
      guard(req,res,()=>handlers.get('post/stock-transfer')(req,res,reject));
    });
    const reset=async()=>{
      await db.$executeRawUnsafe('TRUNCATE "StockMovement","StoreProduct","Product","Store" CASCADE');
      await db.$executeRaw`INSERT INTO "Store" VALUES('source','company','Source',true),('destination','company','Destination',true),('control','company','Control',true),('foreign','other','Foreign',true),('inactive','company','Inactive',false)`;
      await db.$executeRaw`INSERT INTO "Product" VALUES('product','company','Virtual',1,2,true),('unrelated','company','Control',1,2,true),('inactive-product','company','Inactive',1,2,false),('foreign-product','other','Foreign',1,2,true)`;
      await db.$executeRaw`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES('source-row','source','product',9),('control-row','control','product',30),('unrelated-row','source','unrelated',25)`;
    };
    const state=async()=>{
      const stocks=await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct"`;
      assert.equal(Number(stocks.find(r=>r.storeId==='control').currentStock),30);
      assert.equal(Number(stocks.find(r=>r.productId==='unrelated').currentStock),25);
      const moves=await db.$queryRaw`SELECT "storeId","movementType","quantity","sourceId","note","createdByUserId" FROM "StockMovement" ORDER BY "storeId"`;
      return {source:Number(stocks.find(r=>r.storeId==='source'&&r.productId==='product').currentStock),destination:Number(stocks.find(r=>r.storeId==='destination')?.currentStock||0),moves:moves.map(r=>({...r,quantity:Number(r.quantity)}))};
    };
    await reset();const first=await run('isolated-transfer-01');assert.equal(first.status,201);assert.equal(first.sourceStock,8);assert.equal(first.destinationStock,1);
    let s=await state();assert.equal(s.source+s.destination,9);assert.equal(s.moves.length,2);assert.equal(s.moves.reduce((sum,r)=>sum+r.quantity,0),0);
    assert.deepEqual(s.moves.map(r=>r.movementType).sort(),['TRANSFER_IN','TRANSFER_OUT']);
    assert.ok(s.moves.every(r=>r.sourceId===first.transferId&&r.note==='N39 isolated transfer'&&r.createdByUserId==='owner'));
    const replay=await run('isolated-transfer-01');assert.equal(replay.duplicate,true);assert.deepEqual(await state(),s);
    await reset();const concurrent=await Promise.all([run('isolated-parallel-01'),run('isolated-parallel-02')]);assert.ok(concurrent.every(r=>r.status===201));s=await state();assert.equal(s.source,7);assert.equal(s.destination,2);assert.equal(s.moves.length,4);assert.equal(s.moves.reduce((sum,r)=>sum+r.quantity,0),0);
    await reset();for(const [overrides,status] of [[{quantity:10},409],[{destinationStoreId:'source'},400],[{destinationStoreId:'foreign'},404],[{destinationStoreId:'inactive'},404],[{productId:'inactive-product'},404],[{productId:'foreign-product'},404]]){
      assert.equal((await run(crypto.randomUUID(),overrides)).status,status);s=await state();assert.equal(s.source,9);assert.equal(s.destination,0);assert.equal(s.moves.length,0);
    }
    assert.equal((await run('isolated-role-01',{}, {companyId:'company',id:'operator',role:'EMPLOYEE',tokenType:'STORE_OPERATOR'})).status,403);assert.equal((await state()).moves.length,0);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
