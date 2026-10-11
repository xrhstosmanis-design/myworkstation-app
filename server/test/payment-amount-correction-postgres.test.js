import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {z} from 'zod';
import {correctPaymentAmount,paymentCorrectionContext,canCorrectPayment,paymentCorrectionSchema} from '../src/lib/payment-amount-correction.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const user={companyId:'company',storeId:'store',id:'actor',tokenType:'STORE_OPERATOR',permissions:['THIRD_PARTY_PAYMENT','SUPPLIER_PAYMENT'],fullName:'Virtual operator'};
const scope={companyId:'company',storeId:'store',transactionId:'payment',terminalPos:'MAIN',user};
const request=(extra={})=>({amount:5,expectedAmount:3,expectedCorrectionId:null,reason:'Wrong amount entered',idempotencyKey:crypto.randomUUID(),allocations:[],...extra});
test('payment correction enforces own tenant/terminal, active payment and cent precision',()=>{
 const row={companyId:'company',storeId:'store',sessionId:'shift',actorId:'actor',type:'OTHER_EXPENSE'},session={id:'shift',storeId:'store',status:'OPEN',terminalPos:'MAIN'};
 assert.equal(canCorrectPayment(user,row,session,'MAIN'),true);
 for(const [u,r,s,t] of [[{...user,id:'another'},row,session,'MAIN'],[{...user,companyId:'foreign'},row,session,'MAIN'],[{...user,permissions:[]},row,session,'MAIN'],[user,row,{...session,status:'CLOSED'},'MAIN'],[user,row,session,'CONTROL'],[user,{...row,type:'SALE_CASH'},session,'MAIN'],[user,{...row,reversedAt:'now'},session,'MAIN']])assert.equal(canCorrectPayment(u,r,s,t),false);
 for(const amount of [0,NaN,Infinity,1.234,9999999999])assert.equal(paymentCorrectionSchema.safeParse(request({amount})).success,false);
 assert.equal(paymentCorrectionSchema.safeParse(request({amount:0.29})).success,true);
 assert.equal(paymentCorrectionSchema.safeParse(request({reason:' '})).success,false);
 assert.equal(paymentCorrectionSchema.safeParse({...request(),expectedCorrectionId:undefined}).success,false);
});

test('isolated PostgreSQL payment correction is atomic, serializes races, preserves identity and reconciles linked amounts',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`payment_correction_test_${crypto.randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text,"terminalPos" text)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"subtractFromShift" boolean,"actorId" text,"actorName" text,"description" text,"supplierId" text,"supplierName" text,"paymentMethod" text,"attachmentData" text,"invoicePaymentKey" text,"occurredAt" timestamptz,"reversedAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz)',
   'CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"documentNumber" text,"totalGross" numeric(14,2))',
   'CREATE TABLE "SupplierPaymentSettlement"("id" text primary key,"companyId" text,"storeId" text,"transactionId" text,"status" text,"supplierId" text,"reviewedBy" text,"reviewedAt" timestamptz,"reviewNote" text)',
   'CREATE TABLE "SupplierPaymentAllocation"("id" text primary key,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric(14,2))',
   'CREATE TABLE "OtherExpenseReview"("id" text,"companyId" text,"storeId" text,"transactionId" text,"status" text,"reviewedBy" text,"reviewedAt" timestamptz,"reviewNote" text)',
   'CREATE TABLE "BankLedgerEntry"("id" text,"companyId" text,"storeId" text,"sourceTransactionId" text,"amount" numeric(14,2),"status" text,"attachmentData" text,"reviewedBy" text,"reviewedAt" timestamptz,"reviewNote" text)'
  ])await db.$executeRawUnsafe(sql);
  const reset=async()=>{
   await db.$executeRawUnsafe('TRUNCATE "StoreTransaction","CashShiftSession","StoreOperatorAudit","PurchaseDocument","SupplierPaymentSettlement","SupplierPaymentAllocation","OtherExpenseReview","BankLedgerEntry"');
   await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES('shift','company','store','OPEN','MAIN'),('control-shift','company','store','OPEN','CONTROL')`;
   await db.$executeRaw`INSERT INTO "StoreTransaction" VALUES('payment','company','store','shift','OTHER_EXPENSE',3,true,'actor','Original operator','Original description',null,null,'CASH_SHIFT','original proof','original key','2026-10-11T08:52:33Z',null),('control','company','store','control-shift','OTHER_EXPENSE',22,true,'control','Control','Control',null,null,'CASH_SHIFT',null,null,'2026-10-11T08:00:00Z',null)`;
   await db.$executeRaw`INSERT INTO "OtherExpenseReview" VALUES('review','company','store','payment','CONFIRMED','owner',NOW(),'Old review')`;
  };
  const state=async()=>{
   const rows=await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,events=await db.$queryRaw`SELECT * FROM "StoreOperatorAudit" ORDER BY "createdAt"`,reviews=await db.$queryRaw`SELECT * FROM "OtherExpenseReview"`;
   assert.equal(Number(rows.find(r=>r.id==='control').amount),22);
   return {payment:rows.find(r=>r.id==='payment'),events,reviews};
  };
  await reset();const before=await state(),body=request(),result=await correctPaymentAmount(db,scope,body);assert.equal(result.cashDelta,-2);
  let after=await state();assert.equal(Number(after.payment.amount),5);assert.deepEqual({...after.payment,amount:before.payment.amount},before.payment);assert.equal(after.events.length,1);assert.equal(after.events[0].actorId,'actor');assert.equal(after.events[0].details.reason,body.reason);assert.equal(after.events[0].details.previousAmount,3);assert.equal(after.reviews[0].status,'PENDING_REVIEW');
  assert.equal((await correctPaymentAmount(db,scope,body)).duplicate,true);assert.deepEqual(await state(),after);
  await assert.rejects(correctPaymentAmount(db,scope,{...body,amount:6}),e=>e.status===409);
  const context=await paymentCorrectionContext(db,scope);assert.equal(context.expectedCorrectionId,result.correctionId);
  const back=await correctPaymentAmount(db,scope,request({amount:3,expectedAmount:5,expectedCorrectionId:result.correctionId}));assert.equal(back.cashDelta,2);
  await assert.rejects(correctPaymentAmount(db,scope,request()),e=>e.status===409,'ABA amount alone is insufficient');
  await reset();const race=await Promise.allSettled([correctPaymentAmount(db,scope,request({amount:5})),correctPaymentAmount(db,scope,request({amount:7}))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal((await state()).events.length,1);
  await reset();await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "reject_test_audit" CHECK ("eventType"<>'PAYMENT_AMOUNT_CORRECTED')`);
  await assert.rejects(correctPaymentAmount(db,scope,request()));assert.deepEqual(await state(),await (async()=>{const s=await state();assert.equal(Number(s.payment.amount),3);assert.equal(s.reviews[0].status,'CONFIRMED');assert.equal(s.events.length,0);return s})());
  await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT "reject_test_audit"');
  for(const rejectedScope of [{...scope,companyId:'foreign'},{...scope,storeId:'foreign'},{...scope,terminalPos:'CONTROL'},{...scope,user:{...user,id:'other'}},{...scope,user:{...user,permissions:[]}}])await assert.rejects(correctPaymentAmount(db,rejectedScope,request()));
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`;await assert.rejects(correctPaymentAmount(db,scope,request()));assert.equal((await state()).events.length,0);
  await reset();await db.$executeRaw`UPDATE "StoreTransaction" SET "type"='SUPPLIER_PAYMENT',"supplierId"='supplier' WHERE "id"='payment'`;
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES('doc','company','TEST-DOC',10)`;
  await db.$executeRaw`INSERT INTO "SupplierPaymentSettlement" VALUES('settlement','company','store','payment','CONFIRMED','supplier','owner',NOW(),'Old proof')`;
  await db.$executeRaw`INSERT INTO "SupplierPaymentAllocation" VALUES('allocation','company','settlement','doc',3)`;
  await assert.rejects(correctPaymentAmount(db,scope,request({amount:11,allocations:[{purchaseDocumentId:'doc',amount:11}]})),e=>e.status===409);assert.equal((await state()).events.length,0);
  await assert.rejects(correctPaymentAmount(db,scope,request({amount:5,allocations:[{purchaseDocumentId:'doc',amount:4}]})),e=>e.status===400);
  await correctPaymentAmount(db,scope,request({amount:5,allocations:[{purchaseDocumentId:'doc',amount:5}]}));assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "SupplierPaymentAllocation"`)[0].amount),5);assert.equal((await db.$queryRaw`SELECT "status" FROM "SupplierPaymentSettlement"`)[0].status,'PENDING_REVIEW');
  await reset();await db.$executeRaw`UPDATE "StoreTransaction" SET "subtractFromShift"=false,"paymentMethod"='BANK_TRANSFER' WHERE "id"='payment'`;
  await db.$executeRaw`INSERT INTO "BankLedgerEntry" VALUES('bank','company','store','payment',-3,'CONFIRMED','old proof','owner',NOW(),'old review')`;
  assert.equal((await correctPaymentAmount(db,scope,request())).cashDelta,0);const bank=(await db.$queryRaw`SELECT * FROM "BankLedgerEntry"`)[0];assert.equal(Number(bank.amount),-5);assert.equal(bank.status,'PENDING_REVIEW');
  // Exercise the actual registered route, including store and ledger guards.
  const handlers=new Map();let guard;
  const Router=()=>({use(...args){guard=args.at(-1)},...Object.fromEntries(['get','post'].map(method=>[method,(path,...args)=>handlers.set(method+path,args.at(-1))]))});
  const routeDb=new Proxy(db,{get(target,key){if(key==='store')return {findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',active:true,companyId:'company'}:null};const value=target[key];return typeof value==='function'?value.bind(target):value}});
  const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
  new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','canCorrectPayment','correctPaymentAmount','paymentCorrectionContext',source)(Router,routeDb,crypto,z,()=>{},async()=>{},canCorrectPayment,correctPaymentAmount,paymentCorrectionContext);
  const run=(method,body,requestUser={...user,terminalPos:'MAIN',permissions:[...user.permissions,'STORE_LEDGER']},storeId='store')=>new Promise(resolve=>{let status=200;const req={method,user:requestUser,params:{storeId,transactionId:'payment'},headers:{},query:{},body,originalUrl:`/api/transactions/stores/${storeId}/payments/payment/${method==='GET'?'correction-context':'correct-amount'}`},res={status(n){status=n;return this},json(data){resolve({status,data})}};guard(req,res,()=>handlers.get(method.toLowerCase()+'/stores/:storeId/payments/:transactionId/'+(method==='GET'?'correction-context':'correct-amount'))(req,res))});
  await reset();assert.equal((await run('GET')).data.amount,3);assert.equal((await run('POST',request())).status,200);assert.equal(Number((await state()).payment.amount),5);
  assert.equal((await run('POST',request(),{...user,terminalPos:'MAIN',permissions:[]})).status,403);
  assert.equal((await run('POST',request(),{...user,terminalPos:'MAIN',permissions:['STORE_LEDGER']})).status,403);
  assert.equal((await run('GET',undefined,{...user,terminalPos:'MAIN',permissions:['STORE_LEDGER']},'foreign')).status,403);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
