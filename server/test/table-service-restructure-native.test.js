import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {z} from 'zod';
import {PrismaClient} from '@prisma/client';
test('native PostgreSQL restructure conserves lines, priced modifiers, KDS and payment ownership', {skip:!/^postgres(?:ql)?:/.test(process.env.DATABASE_URL||'')}, async()=>{
 const schema='table_restructure_'+crypto.randomBytes(8).toString('hex');
 const admin=new PrismaClient();
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const client=new PrismaClient({datasources:{db:{url:String(url)}}});
 const db={exec:async statement=>{for(const sql of statement.split(';').filter(part=>part.trim()))await client.$executeRawUnsafe(sql)},query:async(statement,...args)=>({rows:await client.$queryRawUnsafe(statement,...(args[0]||[]))})};
 const routes=new Map();let bootstrap;
 const prisma={
  $queryRaw:(...args)=>client.$queryRaw(...args),
  $executeRaw:(...args)=>client.$executeRaw(...args),
  $executeRawUnsafe:statement=>client.$executeRawUnsafe(statement),
  store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store'}:null},
  companyModule:{findFirst:async()=>({id:'module'})},
  $transaction:callback=>client.$transaction(callback)
 };
 try{
 const prep=fs.readFileSync(new URL('../src/routes/store-preparation.js',import.meta.url),'utf8').match(/`CREATE TABLE IF NOT EXISTS "StorePreparationBatch"[^\x60]+`/)[0].slice(1,-1);
 const router={use:fn=>bootstrap=fn,post:(p,fn)=>routes.set(p,fn),get(){},patch(){}};
 const source=fs.readFileSync(new URL('../src/routes/store-table-orders.js',import.meta.url),'utf8');
 const helpers=await import('../src/table-order-idempotency.js');
 vm.runInNewContext(source.replace(/^import .*\n/gm,'').replace(/^export default router;$/m,''),{prisma,z,crypto,Router:()=>router,...helpers,ensurePreparationBatchTable:()=>db.exec(prep+'; ALTER TABLE "StorePreparationBatch" ADD COLUMN "tableOrderId" text;ALTER TABLE "StorePreparationBatch" ADD COLUMN "readyAt" timestamptz;')});
 // Bootstrap follows the authenticated Owner path used by the native router.
 const ownerRequest={method:'GET',originalUrl:'/api/store-pos/stores/store/table-service',params:{storeId:'store'},user:{id:'owner',companyId:'company',role:'OWNER',tokenType:'BACKOFFICE_USER'}};
 await new Promise((resolve,reject)=>bootstrap(ownerRequest,{},e=>e?reject(e):resolve()));
 await db.exec(`CREATE TABLE "StoreOperatorAudit" ("id" text,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb);
 INSERT INTO "StoreTableServiceConfig" ("companyId","storeId","enabled") VALUES ('company','store',true);
 INSERT INTO "DiningTable" ("id","companyId","storeId","name") SELECT x,'company','store',x FROM unnest(ARRAY['a','b','c','d']) x;
 INSERT INTO "TableOrder" ("id","companyId","storeId","tableId","operatorId","status","total") VALUES ('source','company','store','a','waiter','SENT',9),('target','company','store','c','other','READY',4);
 INSERT INTO "TableOrderLine" ("id","orderId","productId","description","quantity","unitPrice","lineTotal","allergensJson") VALUES ('one','source','coffee','Coffee + milk',1,2.5,2.5,'["MILK"]'),('two','source','coffee','Coffee',2,3.25,6.5,'[]'),('three','target','food','Food',1,4,4,'[]');
 INSERT INTO "StorePreparationBatch" ("id","companyId","storeId","operatorId","operatorName","productionStation","itemsJson","status","tableOrderId") VALUES ('batch','company','store','waiter','Waiter','COFFEE','[{"tableLineId":"one","productId":"coffee","quantity":1,"modifiers":[{"id":"milk","price":0.5}]},{"tableLineId":"two","productId":"coffee","quantity":2}]','SENT','source');`);
 const call=async(body,user={companyId:'company',storeId:'store',id:'manager',role:'MANAGER',tokenType:'STORE_OPERATOR'},orderId='source')=>{
  let status=200,output,error;await routes.get('/stores/:storeId/table-orders/:orderId/restructure')({params:{storeId:'store',orderId},body,user},{status:n=>{status=n;return {json:v=>{output=v}}},json:v=>{output=v}},e=>error=e);return {status:error?.status||status,output,error};
 };
 const key=()=>crypto.randomUUID();
 const move={operation:'MOVE',targetTableId:'b',idempotencyKey:key()};
 assert.equal((await call(move,{companyId:'company',id:'waiter',storeId:'store',tokenType:'STORE_OPERATOR'})).status,403);
 const concurrent=await Promise.all([call(move),call(move)]);
 assert.ok(concurrent.every(result=>result.status===200));
 assert.equal(concurrent.filter(result=>result.output.idempotentReplay).length,1);
 assert.equal((await call(move)).output.idempotentReplay,true);
 const snapshot=async()=>JSON.stringify((await db.query('SELECT * FROM "TableOrder" ORDER BY "id"')).rows);
 const beforeInvalid=await snapshot();
 assert.equal((await call({...move,targetTableId:'missing',idempotencyKey:key()})).status,409);
 assert.equal((await call({...move,idempotencyKey:key()},{companyId:'foreign',storeId:'store',id:'manager',role:'MANAGER',tokenType:'STORE_OPERATOR'})).status,404);
 assert.equal((await call({operation:'SPLIT',targetTableId:'d',lineIds:['one','two'],idempotencyKey:key()})).status,409);
 assert.equal(await snapshot(),beforeInvalid);
 assert.equal((await call({...move,targetTableId:'d'})).status,409);
 const split={operation:'SPLIT',targetTableId:'d',lineIds:['one'],idempotencyKey:key()};
 const result=await call(split);assert.equal(result.status,200,result.error?.stack);const splitId=result.output.targetOrderId;
 assert.equal((await call(split)).output.targetOrderId,splitId);
 const moved=(await db.query('SELECT * FROM "TableOrderLine" WHERE "id"=$1',['one'])).rows[0];assert.equal(moved.orderId,splitId);assert.equal(Number(moved.unitPrice),2.5);assert.deepEqual(moved.allergensJson,['MILK']);
 const batches=(await db.query('SELECT * FROM "StorePreparationBatch"')).rows;assert.equal(batches.length,2);
 const splitBatch=batches.find(b=>b.tableOrderId===splitId);assert.deepEqual(splitBatch.itemsJson[0].modifiers,[{id:'milk',price:0.5}]);assert.equal(batches.find(b=>b.id==='batch').itemsJson[0].tableLineId,'two');
 // Same product on both accounts exposes legacy product-only checkout ambiguity.
 await db.exec(`UPDATE "TableOrderLine" SET "productId"='coffee' WHERE "id"='three';
 INSERT INTO "StorePreparationBatch" ("id","companyId","storeId","itemsJson","status","tableOrderId") VALUES ('target-batch','company','store','[{"tableLineId":"three","productId":"coffee","quantity":1}]','READY','target')`);
 const graphSnapshot=async()=>JSON.stringify(await Promise.all(['TableOrder','TableOrderLine','StorePreparationBatch','StoreOperatorAudit','TableOrderRequest'].map(async name=>(await db.query('SELECT * FROM "'+name+'" ORDER BY 1')).rows)));
 const sourceItems=splitBatch.itemsJson;
 await db.query('UPDATE "StorePreparationBatch" SET "itemsJson"=$1::jsonb WHERE "id"=$2',[JSON.stringify(sourceItems.map(item=>({...item,tableLineId:null}))),splitBatch.id]);
 const beforeLegacySource=await graphSnapshot();
 const legacySource=await call({operation:'MERGE',targetTableId:'c',idempotencyKey:key()},undefined,splitId);
 assert.equal(legacySource.status,409);assert.match(legacySource.error.message,/παλιά δελτία/);
 assert.equal(await graphSnapshot(),beforeLegacySource);
 await db.query('UPDATE "StorePreparationBatch" SET "itemsJson"=$1::jsonb WHERE "id"=$2',[JSON.stringify(sourceItems),splitBatch.id]);
 await db.exec(`UPDATE "StorePreparationBatch" SET "itemsJson"='[{"productId":"coffee","quantity":1}]' WHERE "id"='target-batch'`);
 const beforeLegacyTarget=await graphSnapshot();
 assert.equal((await call({operation:'MERGE',targetTableId:'c',idempotencyKey:key()},undefined,splitId)).status,409);
 assert.equal(await graphSnapshot(),beforeLegacyTarget);
 await db.exec(`UPDATE "StorePreparationBatch" SET "itemsJson"='[{"tableLineId":"three","productId":"coffee","quantity":1}]' WHERE "id"='target-batch'`);
 assert.equal((await call({operation:'MERGE',targetTableId:'c',idempotencyKey:key()},undefined,splitId)).status,200);
 const beforeClosed=await snapshot();
 assert.equal((await call({operation:'MOVE',targetTableId:'d',idempotencyKey:key()},undefined,splitId)).status,409);
 assert.equal(await snapshot(),beforeClosed);
 const total=(await db.query('SELECT "total" FROM "TableOrder" WHERE "id"=$1',['target'])).rows[0].total;assert.equal(Number(total),6.5);
 assert.equal((await db.query('SELECT "tableOrderId" FROM "StorePreparationBatch" WHERE "id"=$1',[splitBatch.id])).rows[0].tableOrderId,'target');
 await db.exec(`UPDATE "TableOrder" SET "cashParts"='[{"amountCents":100,"clientTransactionId":"old","sessionId":"shift"}]' WHERE "id"='source'`);
 assert.equal((await call({operation:'MERGE',targetTableId:'c',idempotencyKey:key()})).status,409);
 assert.equal((await call({operation:'MOVE',targetTableId:'a',idempotencyKey:key()})).status,200);
 assert.equal((await db.query(`SELECT "cashParts" FROM "TableOrder" WHERE "id"='source'`)).rows[0].cashParts[0].amountCents,100);
 assert.equal(Number((await db.query('SELECT SUM("total") AS total FROM "TableOrder"')).rows[0].total),13);
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "TableOrderLine"')).rows[0].n,3);
 console.log('PASS original restructure route with native PostgreSQL: move, replay/conflict, mixed-ticket split, snapshot/modifier/allergen preservation, merge, paid-parts guard, conserved 13 total/3 lines');
 }finally{
  await client.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
 }
});
