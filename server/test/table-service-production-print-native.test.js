import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {z} from 'zod';
import {createProductionPrinting} from '../src/services/production-printing.js';
import * as idempotency from '../src/table-order-idempotency.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native table round atomically queues its existing KDS batch once with printer replay, failure and scope protection',{skip:!isolated(),timeout:90000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),schema='table_print_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  const exec=async sql=>{for(const part of sql.split(';').filter(x=>x.trim()))await a.$executeRawUnsafe(part)};
  await exec(`CREATE TABLE "Store" ("id" text,"companyId" text,"name" text,"active" boolean);
   CREATE TABLE "Product" ("id" text,"companyId" text,"name" text,"salePrice" numeric,"active" boolean);
   CREATE TABLE "StoreProduct" ("storeId" text,"productId" text,"salePrice" numeric,"active" boolean);
   CREATE TABLE "PreparationProductSettings" ("companyId" text,"productId" text,"preparationEnabled" boolean,"productionStation" text);
   CREATE TABLE "StoreOperatorAudit" ("id" text,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb);
   INSERT INTO "Store" VALUES ('store','company','LAB',true),('foreign','other','Other',true);
   INSERT INTO "Product" VALUES ('coffee','company','Καφές',1,true),('food','company','Φαγητό',2,true);
   INSERT INTO "StoreProduct" VALUES ('store','coffee',1,true),('store','food',2,true);
   INSERT INTO "PreparationProductSettings" VALUES ('company','coffee',true,'ΚΑΦΕ'),('company','food',true,'ΚΟΥΖΙΝΑ')`);
  const source=fs.readFileSync(new URL('../src/routes/store-table-orders.js',import.meta.url),'utf8');
  const make=client=>{
   const routes=new Map();let bootstrap;
   const db={
    $queryRaw:(...args)=>client.$queryRaw(...args),$executeRaw:(...args)=>client.$executeRaw(...args),$queryRawUnsafe:(...args)=>client.$queryRawUnsafe(...args),$executeRawUnsafe:(...args)=>client.$executeRawUnsafe(...args),
    $transaction:fn=>client.$transaction(fn,{timeout:20000}),
    store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',companyId:'company',name:'LAB',active:true}:null},companyModule:{findFirst:async()=>({id:'module'})}
   };
   const productionPrinting=createProductionPrinting({db,moduleState:async()=>({licenseAllowed:true,activeModules:['STORE_MODE']})});
   const router={use:fn=>bootstrap=fn,post:(path,handler)=>routes.set(path,handler),get(){},patch(){}};
   vm.runInNewContext(source.replace(/^import .*\n/gm,'').replace(/^export default router;$/m,''),{
    prisma:db,z,crypto,Router:()=>router,...idempotency,productionPrinting,
    lockActiveSaleProducts:async()=>{},resolveModifierInventoryPrices:async(_tx,_c,_s,rows)=>rows,
    ensurePreparationBatchTable:async()=>exec(`CREATE TABLE IF NOT EXISTS "StorePreparationBatch" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"operatorName" text,"productionStation" text,"priority" text,"note" text,"itemsJson" jsonb,"status" text,"tableOrderId" text,"readyAt" timestamptz,"createdAt" timestamptz DEFAULT NOW())`)
   });
   const call=async(body,user={id:'waiter',companyId:'company',storeId:'store',tokenType:'STORE_OPERATOR',fullName:'LAB Waiter'})=>{
    let status=200,output,error;await routes.get('/stores/:storeId/table-orders')({params:{storeId:'store'},body,user,headers:{}},{status(n){status=n;return this},json(value){output=value}},e=>error=e);return{status:error?.status||(error?500:status),output,error};
   };
   return{call,service:productionPrinting,bootstrap:()=>new Promise((resolve,reject)=>bootstrap({method:'POST',user:{id:'waiter',companyId:'company',storeId:'store',tokenType:'STORE_OPERATOR',fullName:'LAB Waiter'}},{},e=>e?reject(e):resolve()))};
  };
  const first=make(a),second=make(b);await first.bootstrap();await second.bootstrap();await first.service.ensure();await second.service.ensure();
  await exec(`INSERT INTO "StoreTableServiceConfig" ("companyId","storeId","enabled") VALUES ('company','store',true);INSERT INTO "DiningTable" ("id","companyId","storeId","name") VALUES ('table','company','store','LAB ΤΡΑΠΕΖΙ')`);
  const body=()=>({idempotencyKey:crypto.randomUUID(),tableId:'table',notes:'Γενική οδηγία\u001b',items:[{productId:'coffee',quantity:1,notes:'Ζεστό\u001b',allergens:['ΓΑΛΑ']},{productId:'food',quantity:1,notes:'Χωρίς αλάτι'}]});
  const disabled=await first.call(body());assert.equal(disabled.status,201,disabled.error?.stack);assert.ok(disabled.output.preparationBatches.every(batch=>batch.printStatus==='NOT_CONFIGURED'));
  const settings={enabled:true,name:'LAB',transport:'NETWORK',host:'192.168.1.87',productIds:['coffee']};
  await first.service.configure('company','store',settings);
  const counts=async()=>Promise.all(['TableOrderLine','StorePreparationBatch','ProductionPrintJob','TableOrderRequest','StoreOperatorAudit'].map(async table=>Number((await a.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}"`))[0].n)));
  const before=await counts();
  const unpaired=await first.call(body());assert.equal(unpaired.status,409);assert.match(unpaired.error.message,/συνδεθεί/);assert.deepEqual(await counts(),before);
  const pairing=await first.service.pairing('company','store'),{token}=await first.service.pair(pairing.code);
  const request=body(),results=await Promise.all([first.call(request),second.call(request)]);
  assert.ok(results.every(row=>[200,201].includes(row.status)),results.map(r=>r.error?.stack).join('\n'));assert.equal(results.filter(row=>row.output.idempotentReplay).length,1);
  const batches=results[0].output.preparationBatches;assert.equal(batches.length,2);assert.equal(batches.find(batch=>batch.productionStation==='ΚΑΦΕ').printStatus,'QUEUED');assert.equal(batches.find(batch=>batch.productionStation==='ΚΟΥΖΙΝΑ').printStatus,'NO_MATCH');
  const after=await counts();assert.deepEqual(after,before.map((n,i)=>n+[2,2,1,1,1][i]));
  const [job]=await a.$queryRaw`SELECT * FROM "ProductionPrintJob"`;assert.equal(job.batchId,batches.find(batch=>batch.printStatus==='QUEUED').id);assert.equal(job.ticket.tableName,'LAB ΤΡΑΠΕΖΙ');assert.equal(job.ticket.roundNumber,2);assert.equal(job.ticket.productionStation,'ΚΑΦΕ');assert.equal(job.ticket.note,'Γενική οδηγία ');assert.equal(job.ticket.items[0].note,'Ζεστό ');assert.deepEqual(job.ticket.items[0].allergens,['ΓΑΛΑ']);
  assert.equal((await first.call(request)).output.idempotentReplay,true);assert.deepEqual(await counts(),after);
  const changed=await first.call({...request,notes:'διαφορετικό'});assert.equal(changed.status,409);assert.deepEqual(await counts(),after);
  const foreign=await first.call(body(),{id:'other',companyId:'other',storeId:'store',tokenType:'STORE_OPERATOR'});assert.equal(foreign.status,404);assert.deepEqual(await counts(),after);
  const noKey=body();delete noKey.idempotencyKey;assert.equal((await first.call(noKey)).status,409);assert.deepEqual(await counts(),after);
  // A failed printer INSERT rolls back the round, lines, KDS, audit and replay row.
  await exec(`ALTER TABLE "ProductionPrintJob" ADD CONSTRAINT reject_new_job CHECK (false) NOT VALID`);
  assert.equal((await first.call(body())).status,500);
  assert.deepEqual(await counts(),after);await exec(`ALTER TABLE "ProductionPrintJob" DROP CONSTRAINT reject_new_job`);
  const claims=await Promise.all([first.service.claim(token),second.service.claim(token)]);assert.equal(claims.filter(value=>value.job).length,1);assert.equal((await first.service.claim(token)).job,null);
  const claimed=claims.find(value=>value.job).job;await first.service.acknowledge(token,claimed.id,claimed.claimId,'UNKNOWN');assert.equal((await second.service.claim(token)).job,null);
  assert.deepEqual(await counts(),after);
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
