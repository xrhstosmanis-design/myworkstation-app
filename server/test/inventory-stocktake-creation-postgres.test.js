import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test('large stocktake creation snapshots selected active membership atomically in PostgreSQL',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const {z}=await import('zod');
  const admin=new PrismaClient(),schema='inventory_start_test_'+crypto.randomUUID().replaceAll('-','');
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  try{
    await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
    for(const sql of [
      'CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"active" boolean)',
      'CREATE TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"name" text,"categoryId" text,"active" boolean,"costPrice" numeric)',
      'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"currentStock" numeric,PRIMARY KEY("storeId","productId"))',
      'CREATE TABLE "Stocktake"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"name" text,"inventoryVersion" int,"scopeType" text,"scopeJson" jsonb,"liveDuringTrading" boolean,"recountPolicy" text,"createdByUserId" text)',
      'CREATE TABLE "InventoryZone"("id" text PRIMARY KEY)',
      'CREATE TABLE "StocktakeLine"("id" text PRIMARY KEY,"stocktakeId" text REFERENCES "Stocktake"("id"),"productId" text,"expectedQuantity" numeric,"unitCost" numeric,"zoneId" text REFERENCES "InventoryZone"("id"),UNIQUE("stocktakeId","productId"))'
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe('INSERT INTO "Store" VALUES(\'store\',\'company\',true),(\'control\',\'company\',true),(\'foreign\',\'other\',true)');
    await db.$executeRawUnsafe('INSERT INTO "InventoryZone" VALUES(\'z1\'),(\'z2\'),(\'z3\')');
    await db.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'p'||lpad(i::text,5,'0'),'company',lpad(i::text,5,'0'),CASE WHEN i%2=0 THEN 'even' ELSE 'odd' END,true,CASE WHEN i=2 THEN NULL ELSE i/10.0 END FROM generate_series(1,26656) i`);
    await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'store',"id",true,CASE WHEN "id"='p00001' THEN NULL ELSE -2.5 END FROM "Product"`);
    await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('foreign','other','Foreign','even',true,9),('inactive','company','Inactive','even',false,9),('disabled','company','Disabled','even',true,9),('controlonly','company','Control','even',true,9)`);
    await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('store','foreign',true,99),('store','inactive',true,99),('store','disabled',false,99),('control','controlonly',true,99)`);
    let statements=0,transactions=0;
    const prisma={
      store:{findFirst:async({where})=>(await db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId} AND "active"=true`)[0]||null},
      $transaction:fn=>{transactions++;return db.$transaction(tx=>fn({$executeRaw:async(...args)=>{statements++;return tx.$executeRaw(...args)}}))}
    };
    const handlers=new Map(),Router=()=>Object.fromEntries(['get','post','delete'].map(method=>[method,(path,...fns)=>handlers.set(method+path,fns)]));
    const source=fs.readFileSync(new URL('../src/routes/inventory-v2.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake','inventoryStocktakeScopeAllowed','inventoryStoreScopeAllowed',source)(Router,z,crypto,prisma,{},()=>{},()=>{},()=>{},()=>false,(user,store)=>!user.storeId||user.storeId===store);
    const create=async(body,user={id:'owner',role:'OWNER',companyId:'company',storeId:'store'})=>{
      let status=200,result,error;
      const res={status(v){status=v;return this},json(v){result=v;return this}};
      for(const fn of handlers.get('post/stocktakes')){let proceed=false;await fn({user,body},res,e=>{if(e)error=e;else proceed=true});if(error||!proceed)break}
      return {status,result,error};
    };
    const before=await db.$queryRawUnsafe('SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"');
    const full=await create({storeId:'store',name:'Large full',zoneIds:['z1','z2','z3']});
    assert.equal(full.error,undefined);assert.equal(full.status,201);assert.equal(statements,2);
    const rows=await db.$queryRaw`SELECT "productId","expectedQuantity","unitCost","zoneId" FROM "StocktakeLine" WHERE "stocktakeId"=${full.result.id} ORDER BY "productId"`;
    assert.equal(rows.length,26656);assert.equal(new Set(rows.map(r=>r.productId)).size,26656);
    assert.equal(Number(rows[0].expectedQuantity),0);assert.equal(Number(rows[1].unitCost),0);
    for(let i=0;i<rows.length;i++){assert.equal(rows[i].zoneId,['z1','z2','z3'][i%3]);if(i)assert.equal(Number(rows[i].expectedQuantity),-2.5)}
    const partial=await create({storeId:'store',name:'Partial',scopeType:'PARTIAL_PRODUCTS',productIds:['p00002','p00002','foreign','controlonly']});
    assert.equal(partial.error,undefined);
    let selected=await db.$queryRaw`SELECT "productId","zoneId" FROM "StocktakeLine" WHERE "stocktakeId"=${partial.result.id}`;
    assert.deepEqual(selected,[{productId:'p00002',zoneId:null}]);
    const category=await create({storeId:'store',name:'Categories',scopeType:'PARTIAL_CATEGORIES',categoryIds:['even']});
    assert.equal(category.error,undefined);
    const [count]=await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StocktakeLine" WHERE "stocktakeId"=${category.result.id}`;
    assert.equal(count.n,13328);
    const [parentBefore]=await db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "Stocktake"');
    const invalid=await create({storeId:'store',name:'Rollback',scopeType:'PARTIAL_PRODUCTS',productIds:['p00001'],zoneIds:['missing']});
    assert.ok(invalid.error);
    const [parentAfter]=await db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "Stocktake"');
    assert.equal(parentBefore.n,parentAfter.n);
    const deniedBefore=transactions;
    const denied=await create({storeId:'control',name:'Denied'});
    assert.equal(denied.status,404);assert.equal(transactions,deniedBefore);
    assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"'),before);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect()}
});
