import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveInventoryBulkCard} from '../src/lib/inventory-bulk-card.js';
const user={id:'owner',companyId:'co',role:'OWNER'};
const request=(patch={})=>({storeId:'store',requestId:randomUUID(),allProducts:true,allowPosPriceChange:true,...patch});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('only permission operations receive a bounded extended transaction budget and retryable timeout message',async()=>{
 const options=[];
 const db={$transaction:async(_work,config)=>{options.push(config);throw Object.assign(Error('expired'),{code:'P2028'})}};
 await assert.rejects(saveInventoryBulkCard(db,user,request()),e=>e.status===409&&/δεν ολοκληρώθηκε/.test(e.message));
 assert.deepEqual(options[0],{timeout:20000,maxWait:2000});
 await assert.rejects(saveInventoryBulkCard(db,user,{storeId:'store',requestId:randomUUID(),productIds:['p'],active:false}),e=>e.code==='P2028');assert.equal(options[1],undefined);
});
test('native 8000-product permission update is atomic, leaves StoreProduct unlocked and survives a controlled six-second operation',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='bulk_large_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 let unlock,lockTask;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"allowPosPriceChange" bool default false,"active" bool default true,"salePrice" numeric default 1.2,"vatRate" numeric default 13,"updatedAt" timestamp default NOW())',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric default 3,"salePrice" numeric default 2,"active" bool default true,"updatedAt" timestamp default NOW(),primary key("storeId","productId"))',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)',
   'CREATE TABLE "ProductPriceHistory"("id" text)',
   'CREATE TABLE "StoreTransaction"("id" text,"amount" numeric)',
   'CREATE TABLE "StockMovement"("id" text,"quantity" numeric)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','co',true),('control','co',true),('foreign','other',true),('empty','co',true)`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId","active") SELECT 'p'||lpad(n::text,5,'0'),'co',n%2=0 FROM generate_series(1,8000) n`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId") VALUES ('control','co'),('foreign','other')`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId","active") SELECT 'store',"id","active" FROM "Product" WHERE "id" LIKE 'p%'`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") VALUES ('control','p00001'),('control','control'),('foreign','foreign')`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES ('old',4)`;await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('old',3)`;
  const protectedState=async()=>JSON.stringify(await db.$queryRaw`SELECT
   (SELECT md5(string_agg((to_jsonb(p)-'allowPosPriceChange'-'updatedAt')::text,'' ORDER BY p."id")) FROM "Product" p) AS products,
   (SELECT md5(string_agg(row_to_json(s)::text,'' ORDER BY s."storeId",s."productId")) FROM "StoreProduct" s) AS stocks,
   (SELECT json_agg(t) FROM "StoreTransaction" t) AS finance,(SELECT json_agg(m) FROM "StockMovement" m) AS movements,
   (SELECT count(*)::int FROM "ProductPriceHistory") AS history`);
  const before=await protectedState();
  // A stock-row lock must not hold up this metadata-only operation.
  let locked;const ready=new Promise(resolve=>{locked=resolve});const release=new Promise(resolve=>{unlock=resolve});
  lockTask=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "productId" FROM "StoreProduct" WHERE "storeId"='store' AND "productId"='p00001' FOR UPDATE`;locked();await release},{timeout:20000});
  await ready;
  const first=request();let result;try{result=await saveInventoryBulkCard(db,user,first)}finally{unlock();await lockTask;lockTask=null}
  assert.equal(result.changed,8000);assert.equal(await protectedState(),before);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "Product" WHERE "allowPosPriceChange"`)[0].n),8000);
  const [receipt]=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit"`;assert.equal(receipt.details.changes.length,8000);assert.equal(receipt.details.updatedCount,8000);assert.deepEqual(receipt.details.changes[0].before,{id:'p00001',allowPosPriceChange:false});assert.deepEqual(receipt.details.changes[0].after,{allowPosPriceChange:true});
  const retries=await Promise.all([saveInventoryBulkCard(db,user,first),saveInventoryBulkCard(db,user,first)]);assert.ok(retries.every(r=>r.idempotent));assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "StoreOperatorAudit"`)[0].n),1);
  await assert.rejects(saveInventoryBulkCard(db,user,request({allProducts:undefined,productIds:['foreign']})),e=>e.status===409);
  for(const patch of [{storeId:'foreign'},{storeId:'empty'},{allProducts:undefined,productIds:['p00001','foreign']}])await assert.rejects(saveInventoryBulkCard(db,user,request(patch)));
  // The real regression exceeded Prisma's old 5s budget. Delay one row only;
  // don't rely on flaky elapsed-time thresholds or weaken a global timeout.
  await db.$executeRawUnsafe(`CREATE FUNCTION slow_one_permission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id"='p00001' THEN PERFORM pg_sleep(6); END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER slow_permission BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION slow_one_permission()');
  const off=request({allowPosPriceChange:false});assert.equal((await saveInventoryBulkCard(db,user,off)).changed,8000);
  await db.$executeRawUnsafe('DROP TRIGGER slow_permission ON "Product"');
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "Product" WHERE "allowPosPriceChange"`)[0].n),0);assert.equal(await protectedState(),before);
  const last=(await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "details"->>'requestId'=${off.requestId}`)[0].details;assert.equal(last.changes.length,8000);assert.equal(last.updatedCount,8000);assert.equal(last.changes[0].before.allowPosPriceChange,true);assert.equal(last.changes[0].after.allowPosPriceChange,false);
  const failedId=randomUUID();await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT reject_receipt CHECK ("details"->>'requestId'<>'${failedId}')`);
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT md5(string_agg(row_to_json(p)::text,'' ORDER BY p."id")) FROM "Product" p) AS products,(SELECT count(*)::int FROM "StoreOperatorAudit") AS audits`),rollbackBefore=await snapshot();
  await assert.rejects(saveInventoryBulkCard(db,user,request({requestId:failedId})));assert.equal(await snapshot(),rollbackBefore);assert.equal(await protectedState(),before);
  // The already successful selected-100 route stays valid and scoped.
  const hundred=Array.from({length:100},(_,n)=>'p'+String(n+1).padStart(5,'0'));assert.equal((await saveInventoryBulkCard(db,user,request({allProducts:undefined,productIds:hundred}))).changed,100);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "Product" WHERE "allowPosPriceChange"`)[0].n),100);assert.equal(await protectedState(),before);
 }finally{unlock?.();if(lockTask)await lockTask.catch(()=>{});await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
