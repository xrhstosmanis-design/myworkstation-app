import {inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed} from "../src/lib/inventory-stocktake-scope.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';

const cases=[
  ['post/stocktakes/:stocktakeId/count',{lineId:'line',quantity:9,expectedVersion:1,clientEventId:'count-01'}],
  ['post/stocktakes/:stocktakeId/count/bulk-zero',{lines:[{lineId:'line',expectedVersion:1}],clientBatchId:'9aa1b94a-6f66-4bb4-8e07-7ccaaed4e5db'}],
  ['delete/stocktakes/:stocktakeId/count/:lineId',{expectedVersion:1,clientEventId:'clear-01'}],
  ['post/stocktakes/:stocktakeId/lines',{productId:'extra'}],
  ['post/stocktakes/:stocktakeId/attach-barcode',{productId:'extra',barcode:'VIRTUAL-01'}],
  ['post/stocktakes/:stocktakeId/import-counts',{rows:[{sku:'VIRTUAL',quantity:9}]}],
];
const request=(body,user={})=>({user:{id:'owner',role:'OWNER',companyId:'company',fullName:'Virtual owner',...user},params:{stocktakeId:'take',lineId:'line'},query:{},body});
function routes(prisma) {
  const handlers=new Map();
  const Router=()=>Object.fromEntries(['get','post','delete'].map(method=>[method,(path,...hs)=>handlers.set(method+path,hs)]));
  for(const file of ['inventory-v2.js','inventory-v2-import.js']) {
    const source=fs.readFileSync(new URL('../src/routes/'+file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake','inventoryStocktakeScopeAllowed','inventoryStoreScopeAllowed',source)(Router,z,crypto,prisma,{},()=>{},finalizeInventoryStocktake,lockDraftInventoryStocktake,inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed);
  }
  return async(path,req)=>{
    let status=200,result,error;
    const res={json(value){result=value;return this},status(value){status=value;return this}};
    for(const handler of handlers.get(path)){
      let proceed=false;
      await handler(req,res,e=>{if(e)error=e;else proceed=true});
      if(error||!proceed)break;
    }
    return {status:error?.status||status,result,error};
  };
}
for(const [path,body] of cases)test('actual stale DRAFT request cannot mutate after closure: '+path,async()=>{
  let writes=0,lineReads=0;
  const st={id:'take',companyId:'company',storeId:'store',status:'DRAFT',recountPolicy:'NONE'};
  const tx={$queryRaw:async(strings,...values)=>{assert.match(strings.join('?'),/FROM "Stocktake".*FOR UPDATE/);assert.deepEqual(values,['take','company']);return [{id:'take',status:'FINALIZED'}]},$executeRaw:async()=>{writes++;return 1}};
  const prisma={$queryRaw:async(strings)=>{const q=strings.join('?');if(q.includes('Stocktake'))return [st];if(q.includes('ProductBarcode'))return [];return [{id:'extra',costPrice:1,currentStock:25}]},$executeRaw:tx.$executeRaw,$transaction:async(fn)=>fn({...tx,$queryRaw:async(...args)=>{if(args[0].join('?').includes('StocktakeLine'))lineReads++;return tx.$queryRaw(...args)}})};
  const result=await routes(prisma)(path,request(body));
  assert.equal(result.status,409);assert.equal(writes,0);assert.equal(lineReads,0);
});
const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
test('native PostgreSQL serializes actual draft handlers with finalization and preserves guards',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const admin=new PrismaClient(),schema='inventory_draft_test_'+crypto.randomUUID().replaceAll('-','');
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()});
  const st={id:'take',companyId:'company',storeId:'store',scopeType:'PARTIAL_PRODUCTS',scopeJson:{productIds:['product']}};
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const tables=[
      'CREATE TABLE "InventoryZone"("id" text,"companyId" text,"storeId" text,"code" text,"name" text,"active" bool,"createdAt" timestamp)',
      'CREATE TABLE "Store"("id" text primary key,"name" text)',
      'CREATE TABLE "Stocktake"("id" text primary key,"companyId" text,"storeId" text,"name" text,"status" text,"scopeType" text,"scopeJson" jsonb,"liveDuringTrading" bool,"recountPolicy" text,"startedAt" timestamp,"finalizedAt" timestamp,"finalizedByUserId" text,"snapshotJson" jsonb,"inventoryVersion" int default 2,"updatedAt" timestamp)',
      'CREATE TABLE "StocktakeLine"("id" text primary key,"stocktakeId" text,"productId" text,"zoneId" text,"expectedQuantity" numeric,"countedQuantity" numeric,"unitCost" numeric,"recountRequired" bool default false,"countVersion" int default 0,"countedByUserId" text,"countedAt" timestamp,"countSource" text,"updatedAt" timestamp,unique("stocktakeId","productId"))',
      'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric,"active" bool,"updatedAt" timestamp,primary key("storeId","productId"))',
      'CREATE TABLE "Product"("id" text primary key,"companyId" text,"sku" text,"name" text,"costPrice" numeric,"active" bool)',
      'CREATE TABLE "ProductBarcode"("id" text primary key,"productId" text,"barcode" text unique,"unitMultiplier" numeric,"createdAt" timestamp,"updatedAt" timestamp)',
      'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text)',
      'CREATE TABLE "InventoryCountEvent"("id" text primary key,"companyId" text,"storeId" text,"stocktakeId" text,"lineId" text,"zoneId" text,"eventType" text,"previousQuantity" numeric,"countedQuantity" numeric,"expectedQuantity" numeric,"actorId" text,"actorName" text,"deviceId" text,"source" text,"clientEventId" text,unique("stocktakeId","clientEventId"))',
    ];
    for(const sql of tables)await db.$executeRawUnsafe(sql);
    const reset=async()=>{
      await db.$executeRawUnsafe('TRUNCATE "InventoryZone","InventoryCountEvent","StockMovement","ProductBarcode","Product","StocktakeLine","StoreProduct","Stocktake","Store"');
      await db.$executeRaw`INSERT INTO "Store" VALUES('store','Virtual')`;
      await db.$executeRaw`INSERT INTO "Stocktake"("id","companyId","storeId","name","status","scopeType","scopeJson","liveDuringTrading","recountPolicy") VALUES('take','company','store','Virtual','DRAFT','PARTIAL_PRODUCTS','{}',false,'NONE')`;
      await db.$executeRaw`INSERT INTO "StocktakeLine"("id","stocktakeId","productId","zoneId","expectedQuantity","countedQuantity","unitCost","recountRequired","countVersion") VALUES('line','take','product','zone',10,8,1,false,1)`;
      await db.$executeRaw`INSERT INTO "StoreProduct"("storeId","productId","currentStock","active") VALUES('store','product',10,true),('store','extra',25,true),('control','product',30,true)`;
      await db.$executeRaw`INSERT INTO "Product" VALUES('product','company','VIRTUAL','Virtual',1,true),('extra','company','EXTRA','Extra',1,true)`;
    };
    const observe=async()=>{
      const rows=await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct" ORDER BY "storeId","productId"`;
      assert.equal(Number(rows.find(r=>r.storeId==='control').currentStock),30);assert.equal(Number(rows.find(r=>r.productId==='extra').currentStock),25);
      return {stock:Number(rows.find(r=>r.storeId==='store'&&r.productId==='product').currentStock),parent:await db.$queryRaw`SELECT "status","snapshotJson" FROM "Stocktake"`,lines:await db.$queryRaw`SELECT "id","countedQuantity","countVersion","recountRequired" FROM "StocktakeLine" ORDER BY "id"`,events:await db.$queryRaw`SELECT "eventType","actorId","clientEventId","source" FROM "InventoryCountEvent" ORDER BY "id"`,barcodes:await db.$queryRaw`SELECT "barcode" FROM "ProductBarcode"`,movements:await db.$queryRaw`SELECT "quantity","sourceId" FROM "StockMovement"`};
    };
    const invoke=routes({$queryRaw:db.$queryRaw.bind(db),$executeRaw:db.$executeRaw.bind(db),$transaction:fn=>db.$transaction(fn,{timeout:15000})});
    for(const [path,body] of cases){
      await reset();
      const finalized=gate(),releaseFinal=gate(),mutationEntered=gate();
      const closing=db.$transaction(async tx=>{await finalizeInventoryStocktake(tx,st,'owner','Isolated counted inventory');finalized.resolve();await releaseFinal.promise},{timeout:15000});
      await finalized.promise;
      // Other connection sees committed DRAFT, then starts its transaction while finalizer holds the parent/line locks.
      const racing=routes({$queryRaw:db.$queryRaw.bind(db),$executeRaw:db.$executeRaw.bind(db),$transaction:fn=>db.$transaction(async tx=>{mutationEntered.resolve();return fn(tx)},{timeout:15000})})(path,request(body));
      await mutationEntered.promise;releaseFinal.resolve();await closing;
      const result=await racing;assert.equal(result.status,409,path);assert.ok(result.error);
      const after=await observe();assert.equal(after.stock,8);assert.equal(after.parent[0].status,'FINALIZED');assert.equal(after.parent[0].snapshotJson.totalDifference,-2);assert.equal(after.lines.length,1);assert.equal(Number(after.lines[0].countedQuantity),8);assert.equal(after.lines[0].countVersion,1);assert.deepEqual(after.events,[]);assert.deepEqual(after.barcodes,[]);assert.equal(after.movements.length,1);assert.equal(Number(after.movements[0].quantity),-2);
    }
    // Count holds parent first; closing waits and must use the newly committed count.
    await reset();const counted=gate(),releaseCount=gate(),closingEntered=gate();
    const counting=routes({$queryRaw:db.$queryRaw.bind(db),$transaction:fn=>db.$transaction(async tx=>{const result=await fn(tx);counted.resolve();await releaseCount.promise;return result},{timeout:15000})})(cases[0][0],request(cases[0][1]));
    await counted.promise;
    const closing=db.$transaction(async tx=>{closingEntered.resolve();await finalizeInventoryStocktake(tx,st,'owner','Isolated counted inventory')},{timeout:15000});
    await closingEntered.promise;releaseCount.resolve();assert.equal((await counting).status,200);await closing;
    let after=await observe();assert.equal(after.stock,9);assert.equal(after.parent[0].snapshotJson.totalDifference,-1);assert.equal(after.lines[0].countVersion,2);assert.equal(after.events.length,1);assert.equal(after.events[0].actorId,'owner');assert.equal(Number(after.movements[0].quantity),-1);
    // Concurrent same event replays once under the parent lock; competing versions reject.
    await reset();const pair=await Promise.all([invoke(cases[0][0],request(cases[0][1])),invoke(cases[0][0],request(cases[0][1]))]);
    assert.ok(pair.every(r=>r.status===200));assert.equal(pair.filter(r=>r.result?.replayed).length,1);after=await observe();assert.equal(after.events.length,1);assert.equal(after.lines[0].countVersion,2);assert.equal(after.stock,10);
    assert.equal((await invoke(cases[0][0],request({...cases[0][1],clientEventId:'stale-version'}))).status,409);
    // Recount policy still prevents closing after the first changed count and allows it after the recount.
    await reset();await db.$executeRaw`UPDATE "Stocktake" SET "recountPolicy"='DIFFERENCES'`;await db.$executeRaw`UPDATE "StocktakeLine" SET "countedQuantity"=NULL,"countVersion"=0`;
    const first={...cases[0][1],expectedVersion:0,clientEventId:'first'};assert.equal((await invoke(cases[0][0],request(first))).result.recountRequired,true);
    await assert.rejects(db.$transaction(tx=>finalizeInventoryStocktake(tx,st,'owner','Isolated counted inventory')),{status:409});assert.equal((await observe()).stock,10);
    assert.equal((await invoke(cases[0][0],request({...first,expectedVersion:1,clientEventId:'recount'}))).result.recountRequired,false);
    await db.$transaction(tx=>finalizeInventoryStocktake(tx,st,'owner','Isolated counted inventory'));assert.equal((await observe()).stock,9);
    // Existing company, counter stocktake/zone and owner boundaries are unchanged.
    await reset();const baseline=await observe();
    assert.equal((await invoke(cases[0][0],request(cases[0][1],{companyId:'foreign'}))).status,404);
    assert.equal((await invoke(cases[0][0],request(cases[0][1],{tokenType:'INVENTORY_COUNTER',role:'EMPLOYEE',stocktakeId:'other'}))).status,404);
    assert.equal((await invoke(cases[0][0],request(cases[0][1],{tokenType:'INVENTORY_COUNTER',role:'EMPLOYEE',stocktakeId:'take',zoneId:'other'}))).status,403);
    for(const path of [cases[1][0],cases[2][0],cases[3][0],cases[5][0],'post/stocktakes/:stocktakeId/finalize'])assert.equal((await invoke(path,request({}, {role:'EMPLOYEE'}))).status,403);
    assert.deepEqual(await observe(),baseline);
    // Store-bound manager/owner requests cannot escape their authenticated store,
    // even when the body names a valid stocktake in the same company.
    for(const [path,body] of [...cases,['post/stocktakes/:stocktakeId/finalize',{reason:'Scope test'}],['get/stocktakes/:stocktakeId',{}],['get/stocktakes/:stocktakeId/product-search',{}],['delete/stocktakes/:stocktakeId',{}]])assert.equal((await invoke(path,request(body,{storeId:'control',tokenType:'STORE_OPERATOR'}))).status,404,path);
    for(const [path,body] of [['post/zones',{storeId:'store',code:'VIRTUAL',name:'Virtual'}],['post/stocktakes',{storeId:'store',name:'Virtual'}]])assert.equal((await invoke(path,request(body,{storeId:'control',tokenType:'STORE_OPERATOR'}))).status,404,path);
    assert.deepEqual(await observe(),baseline);
    // A valid scoped counter keeps count/recount access and its own actor/source audit.
    const counter={id:undefined,role:'EMPLOYEE',tokenType:'INVENTORY_COUNTER',grantId:'grant',stocktakeId:'take',storeId:'store',zoneId:'zone',fullName:'Virtual scoped counter'};
    assert.equal((await invoke(cases[0][0],request({...cases[0][1],clientEventId:'scoped-counter',source:'QR_PIN'},counter))).status,200);
    after=await observe();assert.equal(after.stock,10);assert.equal(after.events.length,1);assert.equal(after.events[0].actorId,'grant');assert.equal(after.events[0].source,'QR_PIN');
    await db.$transaction(tx=>finalizeInventoryStocktake(tx,st,'owner','Scoped count verified'));assert.equal((await observe()).stock,9);
    // Actual list/zone SQL retains company-wide owner access, but filters a bound store.
    await reset();await db.$executeRaw`INSERT INTO "Store" VALUES('control','Control')`;
    await db.$executeRaw`INSERT INTO "Stocktake"("id","companyId","storeId","name","status","scopeType","liveDuringTrading","recountPolicy") VALUES('control-take','company','control','Control','DRAFT','PARTIAL_PRODUCTS',false,'NONE')`;
    await db.$executeRaw`INSERT INTO "InventoryZone" VALUES('z1','company','store','A','Source',true,NOW()),('z2','company','control','B','Control',true,NOW())`;
    assert.equal((await invoke('get/stocktakes',request({}))).result.length,2);
    assert.deepEqual((await invoke('get/stocktakes',request({},{storeId:'store'}))).result.map(x=>x.id),['take']);
    assert.equal((await invoke('get/zones',request({}))).result.length,2);
    assert.deepEqual((await invoke('get/zones',request({},{storeId:'store'}))).result.map(x=>x.id),['z1']);
    assert.deepEqual((await invoke('get/zones',{...request({},{storeId:'store'}),query:{storeId:'control'}})).result,[]);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
