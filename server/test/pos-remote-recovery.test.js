import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {recoveryBlocker,recoveryView,recoverPosRequest} from '../src/services/pos-remote-recovery.js';
const scope={companyId:'company',storeId:'target',actorId:'admin'};
const fixture=()=>({id:randomUUID(),companyId:'company',storeId:'target',terminalPos:'POS1',clientTransactionId:randomUUID(),paymentMethod:'CASH',total:'2.70',status:'DISPATCHED',saleId:null,operatorOutcome:null,createdAt:new Date('2026-10-18T20:00:00Z'),updatedAt:new Date('2026-10-18T20:00:01Z'),checkoutJson:{actorId:'operator',operatorEmployeeId:'employee',operationChannel:'COUNTER',baseSummary:{subtotal:2.7,total:2.7,discount:0},resolvedItems:[{productId:'p',name:'Product',quantity:1,effectiveUnitPrice:2.7,lineTotal:2.7,vatRate:13}]}});
test('recovery refuses unconfirmed/ambiguous and special settlement paths; preview binds saved scope and checkout',()=>{
 const r=fixture();assert.equal(recoveryBlocker(r),null);for(const status of ['PREPARED','CLAIMED','REQUIRES_CHECK','DECLINED'])assert.ok(recoveryBlocker({...r,status}));
 assert.ok(recoveryBlocker({...r,paymentMethod:'CARD'}));assert.ok(recoveryBlocker({...r,paymentMethod:'CARD',status:'OPERATOR_CONFIRMED',operatorOutcome:'NO'}));assert.equal(recoveryBlocker({...r,paymentMethod:'CARD',status:'OPERATOR_CONFIRMED',operatorOutcome:'YES'}),null);
 for(const extra of [{customerId:'customer'},{redeemPoints:1},{onlineOrderId:'order'},{operationChannel:'DELIVERY_DELAYED'},{actorId:null}])assert.ok(recoveryBlocker({...r,checkoutJson:{...r.checkoutJson,...extra}}));
 assert.notEqual(recoveryView(r).preview,recoveryView({...r,storeId:'sibling'}).preview);assert.notEqual(recoveryView(r).preview,recoveryView({...r,updatedAt:new Date()}).preview);
 assert.equal('clientTransactionId' in recoveryView(r),false);
 assert.ok(recoveryBlocker({...r,checkoutJson:{...r.checkoutJson,resolvedItems:[null]}}));assert.deepEqual(recoveryView({...r,checkoutJson:{resolvedItems:'invalid'}}).items,[]);
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native locked recovery: one commit under concurrency, exact replay, rollback on audit failure and zero-write scope/shift/generation refusals',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='pos_recovery_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await db.$executeRawUnsafe(`CREATE TABLE "Company"("id" text PRIMARY KEY,"active" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Store"("id" text PRIMARY KEY,"companyId" text,"active" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedAt" timestamptz,"openedBy" text)`);
  await db.$executeRawUnsafe(`CREATE TABLE "RbsCapDriverV1Request"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"clientTransactionId" text,"paymentMethod" text,"total" numeric,"status" text,"saleId" text,"operatorOutcome" text,"createdAt" timestamptz,"updatedAt" timestamptz,"checkoutJson" jsonb,"requestHash" text DEFAULT 'hash')`);
  await db.$executeRawUnsafe(`CREATE TABLE "Sale"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"clientTransactionId" text UNIQUE,"status" text,"fiscalStatus" text,"customerId" text,"operatorEmployeeId" text,"subtotal" numeric,"discount" numeric,"total" numeric,"source" text,"saleFingerprint" text,"duplicateConfirmed" boolean,"transactionMode" text,"operationChannel" text,"audience" text)`);
  for(const sql of [
   `CREATE TABLE "SaleLine"("id" text PRIMARY KEY,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric,"promotionId" text,"promotionType" text,"scannedBarcode" text)`,
   `CREATE TABLE "Payment"("id" text PRIMARY KEY,"saleId" text,"method" text,"amount" numeric)`,
   `CREATE TABLE "StoreTransaction"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text)`,
   `CREATE TABLE "Product"("id" text PRIMARY KEY,"companyId" text,"active" boolean,"trackStock" boolean)`,
   `CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"active" boolean,"currentStock" numeric,"updatedAt" timestamptz,PRIMARY KEY("storeId","productId"))`,
   `CREATE TABLE "StoreBakingPolicy"("companyId" text,"storeId" text,"productId" text,"mode" text,"sourceProductId" text)`,
   `CREATE TABLE "PreparationRecipeLine"("companyId" text,"productId" text,"automatic" boolean)`,
   `CREATE TABLE "StockMovement"("id" text PRIMARY KEY,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text,"idempotencyKey" text)`,
   `CREATE UNIQUE INDEX movement_key ON "StockMovement"("storeId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('p','company',true,true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('target','p',true,10,NOW()),('sibling','p',true,20,NOW())`);
  await db.$executeRawUnsafe(`CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('company',true),('foreign',true)`);await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('target','company',true),('sibling','company',true),('foreign','foreign',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES('shift','company','target','POS1','OPEN','2026-10-18T19:00:00Z','operator')`);
  const insert=async r=>db.$executeRawUnsafe(`INSERT INTO "RbsCapDriverV1Request" ("id","companyId","storeId","terminalPos","clientTransactionId","paymentMethod","total","status","saleId","operatorOutcome","createdAt","updatedAt","checkoutJson") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,r.id,r.companyId,r.storeId,r.terminalPos,r.clientTransactionId,r.paymentMethod,Number(r.total),r.status,r.saleId,r.operatorOutcome,r.createdAt,r.updatedAt,JSON.stringify(r.checkoutJson));
  const stored=async id=>(await db.$queryRawUnsafe(`SELECT * FROM "RbsCapDriverV1Request" WHERE "id"=$1`,id))[0];
  const {finalizeDispatchedCashRequest,finalizeConfirmedCardRequest}=await import('../src/rbs-capdriver-v1-sale-finalize.js');
  const deps={finalizeCash:finalizeDispatchedCashRequest,finalizeCard:finalizeConfirmedCardRequest};
  const run=async(r,over={},sc=scope)=>recoverPosRequest(db,sc,{requestId:r.id,preview:recoveryView(r).preview,receiptPrinted:true,reason:'Printed receipt recovery',...over},deps);
  const r=fixture();await insert(r);const original=await stored(r.id);
  await assert.rejects(run(original,{}, {...scope,storeId:'sibling'}));await assert.rejects(run(original,{}, {...scope,companyId:'foreign'}));await assert.rejects(run(original,{receiptPrinted:false}));await assert.rejects(run(original,{preview:'stale'}));
  await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "openedAt"='2026-10-18T21:00:00Z'`);await assert.rejects(run(original),/βάρδια/);await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "openedAt"='2026-10-18T19:00:00Z'`);
  await db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)`);await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('target','company',1,false,false)`);await assert.rejects(run(original),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');await assert.rejects(finalizeDispatchedCashRequest(original.id,{db}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM \"Sale\"`))[0].n,0);await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0`);
  const results=await Promise.all([run(original),run(original)]);assert.equal(results[0].saleId,results[1].saleId);assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "Sale"`)).length,1);for(const table of ['Payment','StoreTransaction','StockMovement','SaleLine'])assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "${table}"`)).length,1);assert.deepEqual((await db.$queryRawUnsafe(`SELECT "storeId","currentStock"::text AS stock FROM "StoreProduct" ORDER BY "storeId"`)),[{storeId:'sibling',stock:'20'},{storeId:'target',stock:'9'}]);assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "StoreOperatorAudit" WHERE "eventType"='POS_REMOTE_RECOVERY'`)).length,1);
  const r2=fixture();await insert(r2);await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT reject_second CHECK ("actorId"<>'reject')`);await assert.rejects(run(await stored(r2.id),{}, {...scope,actorId:'reject'}));assert.equal((await stored(r2.id)).status,'DISPATCHED');assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "Sale"`)).length,1);for(const table of ['Payment','StoreTransaction','StockMovement','SaleLine'])assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "${table}"`)).length,1);assert.deepEqual((await db.$queryRawUnsafe(`SELECT "storeId","currentStock"::text AS stock FROM "StoreProduct" ORDER BY "storeId"`)),[{storeId:'sibling',stock:'20'},{storeId:'target',stock:'9'}]);
  const card={...fixture(),paymentMethod:'CARD',status:'OPERATOR_CONFIRMED',operatorOutcome:'YES'};await insert(card);
  await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "status"='CLOSED'`);await assert.rejects(run(await stored(card.id)),/βάρδια/);await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "status"='OPEN'`);
  await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "openedBy"='other'`);await assert.rejects(run(await stored(card.id)),/βάρδια/);await db.$executeRawUnsafe(`UPDATE "CashShiftSession" SET "openedBy"='operator'`);
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=1`);await assert.rejects(finalizeConfirmedCardRequest(card.id,{db}),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0`);
  const cardResult=await run(await stored(card.id));assert.ok(cardResult.saleId);assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "Payment" WHERE "method"='CARD'`)).length,1);assert.equal((await db.$queryRawUnsafe(`SELECT * FROM "StoreTransaction" WHERE "type"='SALE_CARD'`)).length,1);assert.equal((await db.$queryRawUnsafe(`SELECT "currentStock"::text AS stock FROM "StoreProduct" WHERE "storeId"='target'`))[0].stock,'8');
  const conflict=fixture();await insert(conflict);await db.$executeRawUnsafe(`INSERT INTO "Sale" ("id","companyId","storeId","clientTransactionId","status","fiscalStatus","total") VALUES($1,'company','target',$2,'COMPLETED','NON_FISCAL',2.7)`,randomUUID(),conflict.clientTransactionId);await assert.rejects(run(await stored(conflict.id)),/διαφορετική/);assert.equal((await stored(conflict.id)).status,'DISPATCHED');
  // A new stored receipt at generation1 binds its original epoch inside the
  // real finalizer transaction; a pooled connection must not retain that epoch.
  const fresh=fixture();fresh.checkoutJson.lifecycleGeneration='1';await insert(fresh);
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=1`);
  const beforeFresh=await db.$queryRawUnsafe(`SELECT "storeId","currentStock"::text AS stock FROM "StoreProduct" ORDER BY "storeId"`);
  const saleCount=(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Sale"`))[0].n;
  await db.$executeRawUnsafe(`CREATE FUNCTION require_fresh_epoch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),'')::jsonb->>'target','0')<>'1' THEN RAISE EXCEPTION 'MISSING ORIGINAL EPOCH'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fresh_epoch BEFORE INSERT ON "Sale" FOR EACH ROW EXECUTE FUNCTION require_fresh_epoch()`);
  const completed=await finalizeDispatchedCashRequest(fresh.id,{db});assert.ok(completed.saleId);
  assert.deepEqual(await db.$queryRawUnsafe(`SELECT "storeId","currentStock"::text AS stock FROM "StoreProduct" ORDER BY "storeId"`),beforeFresh.map(row=>row.storeId==='target'?{...row,stock:String(Number(row.stock)-1)}:row));
  assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Sale"`))[0].n,saleCount+1);
  assert.equal((await finalizeDispatchedCashRequest(fresh.id,{db})).skipped,true);
  assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Sale"`))[0].n,saleCount+1);
  assert.deepEqual((await db.$queryRawUnsafe(`SELECT COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),''),'{}')::jsonb AS context`))[0].context,{});
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
