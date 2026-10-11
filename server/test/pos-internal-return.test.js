import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {internalReturnSchema,internalReturnAmounts,recordInternalReturn,INTERNAL_RETURN_REASONS} from '../src/lib/pos-internal-return.js';
const user={id:'actor',companyId:'company',storeId:'store',employeeId:'employee',tokenType:'STORE_OPERATOR',permissions:['RETURN_ITEMS'],fullName:'Virtual employee'};
const scope={companyId:'company',storeId:'store',saleId:'sale',terminalPos:'MAIN',user};
const body=(extra={})=>({items:[{lineId:'line',quantity:1}],reason:'Λάθος χειριστή',refundMethod:'CASH',confirmed:true,...extra});
test('internal return requires explicit confirmation, actual refund method and exactly three dropdown reasons',()=>{
 assert.deepEqual(INTERNAL_RETURN_REASONS,['Λάθος χειριστή','Επιστροφή από πελάτη','Λάθος καταχώρηση']);
 for(const reason of INTERNAL_RETURN_REASONS)assert.equal(internalReturnSchema.safeParse(body({reason})).success,true);
 for(const extra of [{reason:''},{reason:'Δοκιμή'},{confirmed:false},{confirmed:undefined},{refundMethod:'BANK'},{items:[]},{items:[{lineId:'line',quantity:Infinity}]}])assert.equal(internalReturnSchema.safeParse(body(extra)).success,false);
});
test('internal refund reconciles discounts, fractional quantities and cent allocation without exceeding original total',()=>{
 const lines=[{id:'a',quantity:3,lineTotal:1,discount:0},{id:'b',quantity:3,lineTotal:1,discount:0},{id:'c',quantity:3,lineTotal:1,discount:0}];
 let r=internalReturnAmounts({total:2},lines,[{method:'CASH',amount:2}],lines.map(l=>({lineId:l.id,quantity:3})));assert.equal(r.refundCents,200);assert.equal(r.selected.reduce((s,l)=>s+l.returnCents,0),200);
 r=internalReturnAmounts({total:2},lines,[{method:'CARD',amount:2}],[{lineId:'a',quantity:1.5}]);assert.equal(r.refundCents,33);
 for(const items of [[{lineId:'a',quantity:1},{lineId:'a',quantity:1}],[{lineId:'foreign',quantity:1}],[{lineId:'a',quantity:4}],[{lineId:'a',quantity:0.0001}]])assert.throws(()=>internalReturnAmounts({total:3},lines,[{method:'CASH',amount:3}],items));
 for(const payments of [[{method:'OTHER',amount:3}],[{method:'CASH',amount:2}],[{method:'CASH',amount:-3}]])assert.throws(()=>internalReturnAmounts({total:3},lines,payments,[{lineId:'a',quantity:1}]));
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native isolated PostgreSQL internal return is atomic, original fiscal receipt immutable, no duplicate financial/stock action',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`internal_return_test_${crypto.randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"operatorEmployeeId" text,"customerId" text,"fiscalStatus" text,"subtotal" numeric(14,2),"discount" numeric(14,2),"total" numeric(14,2),"status" text,"source" text,"occurredAt" timestamptz,"transactionMode" text,"originalSaleId" text,"reversalKind" text,"operationChannel" text,"receiptNumber" text,"reversalState" text)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric(14,3),"unitPrice" numeric(14,2),"discount" numeric(14,2),"vatRate" numeric(14,2),"lineTotal" numeric(14,2),"createdAt" timestamptz default now())',
   'CREATE TABLE "Payment"("id" text primary key,"saleId" text,"method" text,"amount" numeric(14,2),"createdAt" timestamptz default now())',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedAt" timestamptz default now())',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"actorId" text,"actorName" text)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"trackStock" boolean)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"currentStock" numeric(14,3),primary key("storeId","productId"))',
   'CREATE TABLE "RbsCapDriverV1Request"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"status" text,"terminalPos" text)',
   'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"relatedSaleId" text,"actionType" text,"reason" text,"actorId" text,"actorName" text,"details" jsonb)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)'
  ])await db.$executeRawUnsafe(sql);
  const reset=async()=>{
   await db.$executeRawUnsafe('TRUNCATE "Sale","SaleLine","Payment","CashShiftSession","StoreTransaction","Product","StoreProduct","RbsCapDriverV1Request","PosSaleActionAudit","StoreOperatorAudit"');
   await db.$executeRawUnsafe(`INSERT INTO "Sale" VALUES('sale','company','store','employee',null,'ISSUED',3,0,3,'COMPLETED','POS','2026-10-11T10:00:00Z','NORMAL',null,null,'COUNTER','REAL-ORIGINAL',null)`);
   await db.$executeRawUnsafe(`INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES('line','sale','product','VIRTUAL WATER',3,1,0,24,3)`);
   await db.$executeRawUnsafe(`INSERT INTO "Payment"("id","saleId","method","amount") VALUES('payment','sale','CASH',3)`);
   await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","status","terminalPos") VALUES('shift','company','store','OPEN','MAIN'),('control','company','store','OPEN','CONTROL')`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction" VALUES('original-ledger','company','store','shift','SALE_CASH',3,'POS πώληση sale · ΜΕΤΡΗΤΑ','actor','Virtual employee'),('control-ledger','company','store','control','SALE_CASH',22,'control','control','Control')`);
   await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('product','company',true)`);await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('store','product',10),('control-store','product',55)`);
   await db.$executeRawUnsafe(`INSERT INTO "RbsCapDriverV1Request" VALUES('rbs','company','store','sale','SALE_COMMITTED','MAIN')`);
  };
  const snapshot=async()=>({sales:await db.$queryRaw`SELECT * FROM "Sale" ORDER BY "id"`,lines:await db.$queryRaw`SELECT * FROM "SaleLine" ORDER BY "id"`,payments:await db.$queryRaw`SELECT * FROM "Payment" ORDER BY "id"`,ledger:await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,stock:await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId"`,rbs:await db.$queryRaw`SELECT * FROM "RbsCapDriverV1Request"`,audit:await db.$queryRaw`SELECT * FROM "PosSaleActionAudit"`,operator:await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`});
  await reset();const before=await snapshot(),result=await recordInternalReturn(db,scope,body()),after=await snapshot();assert.equal(result.total,-1);assert.equal(result.transactionMode,'INTERNAL_RETURN_PENDING_RBS');assert.deepEqual(after.sales.find(s=>s.id==='sale'),before.sales[0]);assert.deepEqual(after.rbs,before.rbs);assert.equal(after.sales.length,2);assert.equal(after.payments.length,2);assert.equal(Number(after.stock.find(s=>s.storeId==='store').currentStock),11);assert.equal(Number(after.stock.find(s=>s.storeId==='control-store').currentStock),55);assert.deepEqual(after.ledger.find(s=>s.id==='control-ledger'),before.ledger.find(s=>s.id==='control-ledger'));assert.equal(after.audit.length,1);assert.equal(after.operator.length,1);assert.equal(after.audit[0].reason,'Λάθος χειριστή');assert.equal(after.audit[0].details.originalReceiptNumber,'REAL-ORIGINAL');assert.match(after.ledger.find(s=>s.amount.toString()==='-1').description,/Εκκρεμεί φορολογική επιστροφή RBS/);
  await assert.rejects(recordInternalReturn(db,scope,body()),e=>e.status===409);assert.deepEqual(await snapshot(),after);
  await reset();const race=await Promise.allSettled([recordInternalReturn(db,scope,body()),recordInternalReturn(db,scope,body())]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal((await snapshot()).audit.length,1);
  await reset();const rollback=await snapshot();await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "reject_internal" CHECK("eventType"<>'POS_INTERNAL_RETURN_PENDING_RBS')`);await assert.rejects(recordInternalReturn(db,scope,body()));assert.deepEqual(await snapshot(),rollback);await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT "reject_internal"');
  for(const badScope of [{...scope,companyId:'foreign'},{...scope,storeId:'foreign'},{...scope,terminalPos:'CONTROL'},{...scope,user:{...user,permissions:[]}}]){await reset();const before=await snapshot();await assert.rejects(recordInternalReturn(db,badScope,body()));assert.deepEqual(await snapshot(),before);}
  for(const sql of [`UPDATE "Sale" SET "fiscalStatus"='NON_FISCAL'`,`UPDATE "Sale" SET "operationChannel"='DELIVERY'`,`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`,`UPDATE "RbsCapDriverV1Request" SET "status"='DISPATCHED'`,`UPDATE "Payment" SET "amount"=2`,`DELETE FROM "StoreProduct" WHERE "storeId"='store'`]){await reset();await db.$executeRawUnsafe(sql);const before=await snapshot();await assert.rejects(recordInternalReturn(db,scope,body()));assert.deepEqual(await snapshot(),before);}
  await reset();await db.$executeRawUnsafe(`UPDATE "Product" SET "trackStock"=false`);await recordInternalReturn(db,scope,body({refundMethod:'CARD',reason:'Επιστροφή από πελάτη'}));assert.equal(Number((await snapshot()).stock.find(s=>s.storeId==='store').currentStock),10);assert.equal((await snapshot()).payments.find(p=>p.id!=='payment').method,'CARD');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
