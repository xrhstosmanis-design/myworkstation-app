import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {customerReceiptSchema,receiveCustomerDebt,recoverCustomerDebt} from '../src/lib/pos-customer-receipt.js';
import {customerAudience,customerLineTotal,applyCustomerDiscount} from '../../shared/customer-discount.mjs';
const user={id:'operator',companyId:'company',storeId:'store',tokenType:'STORE_OPERATOR',fullName:'Virtual operator',permissions:['CUSTOMERS_POS','POS_CASH','POS_CARDS']};
const scope={companyId:'company',storeId:'store',terminalPos:'MAIN',user};
const body=(extra={})=>({customerId:'customer',amount:3,expectedBalance:10,method:'CASH',received:true,idempotencyKey:crypto.randomUUID(),...extra});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('personal discount uses the better existing price, exact line cents and known audience IDs',()=>{
 assert.equal(customerLineTotal(1,1,20,.9),.8);
 assert.equal(customerLineTotal(1,1,10,.8),.8);
 assert.equal(customerLineTotal(1.23,2,10,2.46),2.21);
 assert.equal(customerLineTotal(1,1,0,.9),.9);
 assert.equal(customerLineTotal(1,1,100,.9),0);
 assert.equal(customerAudience('DOCTOR'),'DOCTOR');assert.equal(customerAudience('untrusted'),'CUSTOMER');
 const items=['RETAIL','MANUAL','OFFLINE_LOCKED','WHOLESALE'].map(priceSource=>({unitPrice:1,quantity:1,lineTotal:1,discount:0,priceSource}));
 applyCustomerDiscount(items,{discountPercent:20});assert.deepEqual(items.map(r=>r.lineTotal),[.8,1,1,1]);assert.equal(items[0].discount,.2);
 applyCustomerDiscount(items,{discountPercent:20});assert.equal(items[0].lineTotal,.8);assert.equal(items[0].discount,.2);
});
test('receipt requires a unique key, cent amount and explicit real receipt/card approval',async()=>{
 for(const extra of [{amount:0},{amount:3.001},{received:false},{idempotencyKey:undefined},{method:'CREDIT'},{method:'CARD',cardReference:''}])assert.equal(customerReceiptSchema.safeParse(body(extra)).success,false);
 assert.equal(customerReceiptSchema.safeParse(body({method:'CARD',cardReference:'APPROVED-TEST'})).success,true);
 const db={$transaction:()=>{throw Error('must not reach database')}};
 for(const rejected of [{...scope,user:{...user,permissions:[]}},{...scope,companyId:'foreign'},{...scope,storeId:'foreign'},{...scope,user:{...user,tokenType:'COMPANY',role:'EMPLOYEE'}}])await assert.rejects(receiveCustomerDebt(db,rejected,body()),e=>e.status===403);
});

test('native isolated PostgreSQL receipt serializes replay, atomically reconciles debt/shift/loyalty and cancels late requests',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`customer_receipt_test_${crypto.randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Customer"("id" text primary key,"companyId" text,"name" text,"email" text,"balance" numeric(14,2),"points" numeric(14,2),"active" boolean,"updatedAt" timestamptz)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedAt" timestamptz)',
   'CREATE TABLE "CustomerLedger"("id" text primary key,"customerId" text,"storeId" text,"entryType" text,"amount" numeric(14,2),"referenceType" text,"referenceId" text,"note" text,"actorId" text,"actorName" text,"paymentMethod" text,"sessionId" text)',
   'CREATE TABLE "CustomerLoyaltyLedger"("id" text primary key,"companyId" text,"storeId" text,"customerId" text,"sessionId" text,"type" text,"points" numeric(14,2),"amount" numeric(14,2),"actorId" text)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"actorId" text,"actorName" text)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)',
   'CREATE TABLE "Sale"("id" text primary key)', 'CREATE TABLE "StockMovement"("id" text primary key)',
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Customer" VALUES ('customer','company','Virtual customer',NULL,10,0,true,NOW()),('foreign','another','Foreign',NULL,10,0,true,NOW())`;
  await db.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('shift','company','store','OPEN','MAIN',NOW()),('control','company','store','OPEN','CONTROL',NOW())`;
  const state=async()=>({customer:(await db.$queryRaw`SELECT * FROM "Customer" WHERE "id"='customer'`)[0],ledger:await db.$queryRaw`SELECT * FROM "CustomerLedger"`,movements:await db.$queryRaw`SELECT * FROM "StoreTransaction"`,loyalty:await db.$queryRaw`SELECT * FROM "CustomerLoyaltyLedger"`,audit:await db.$queryRaw`SELECT * FROM "StoreOperatorAudit"`});
  const request=body(),pair=await Promise.all([receiveCustomerDebt(db,scope,request),receiveCustomerDebt(db,scope,request)]);
  assert.equal(pair.filter(x=>x.replayed).length,1);assert.equal(pair[0].ledgerId,pair[1].ledgerId);
  let s=await state();assert.equal(Number(s.customer.balance),7);assert.equal(Number(s.customer.points),3);assert.equal(s.ledger.length,1);assert.equal(Number(s.ledger[0].amount),-3);assert.equal(s.movements[0].type,'CUSTOMER_RECEIPT_CASH');assert.equal(s.movements[0].sessionId,'shift');assert.equal(s.loyalty.length,1);assert.equal(s.audit.length,1);
  await assert.rejects(receiveCustomerDebt(db,scope,{...request,amount:2}),e=>e.status===409);
  await assert.rejects(receiveCustomerDebt(db,scope,body({amount:8,expectedBalance:7})),e=>e.status===409);
  await assert.rejects(receiveCustomerDebt(db,scope,body({customerId:'foreign',expectedBalance:7})),e=>e.status===404);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`;
  assert.equal((await receiveCustomerDebt(db,scope,request)).replayed,true);
  await assert.rejects(receiveCustomerDebt(db,scope,body({expectedBalance:7})),e=>e.status===409);
  await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN' WHERE "id"='shift'`;
  await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "reject_payment" CHECK ("eventType"<>'CUSTOMER_BALANCE_PAYMENT') NOT VALID`);
  await assert.rejects(receiveCustomerDebt(db,scope,body({expectedBalance:7})));
  s=await state();assert.equal(Number(s.customer.balance),7);assert.equal(s.ledger.length,1);assert.equal(s.movements.length,1);assert.equal(s.loyalty.length,1);
  await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT "reject_payment"');
  const card=body({amount:2,expectedBalance:7,method:'CARD',cardReference:'TEST-APPROVED'});await receiveCustomerDebt(db,scope,card);
  s=await state();assert.equal(Number(s.customer.balance),5);assert.equal(s.movements.find(x=>x.type==='CUSTOMER_RECEIPT_CARD').amount.toString(),'2');assert.match(s.ledger.find(x=>x.paymentMethod==='CARD').note,/TEST-APPROVED/);
  assert.equal((await recoverCustomerDebt(db,scope,card)).replayed,true);
  const uncertain=body({amount:1,expectedBalance:5});assert.equal((await recoverCustomerDebt(db,scope,uncertain)).cancelled,true);
  await assert.rejects(receiveCustomerDebt(db,scope,uncertain),e=>e.status===409);
  assert.equal((await recoverCustomerDebt(db,scope,uncertain)).cancelled,true);
  const competitors=await Promise.allSettled([receiveCustomerDebt(db,scope,body({amount:1,expectedBalance:5})),receiveCustomerDebt(db,scope,body({amount:1,expectedBalance:5}))]);assert.equal(competitors.filter(x=>x.status==='fulfilled').length,1);
  s=await state();assert.equal(Number(s.customer.balance),4);assert.equal(s.movements.filter(x=>x.sessionId==='control').length,0);
  assert.equal((await db.$queryRaw`SELECT * FROM "Sale"`).length,0);assert.equal((await db.$queryRaw`SELECT * FROM "StockMovement"`).length,0);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

test('actual QR handler selects an exact company card with its group, respects store opt-in and hides the full card',async()=>{
 const fs=await import('node:fs/promises'),source=await fs.readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const start=source.indexOf('router.post("/stores/:storeId/customer-card/scan"'),end=source.indexOf('router.post("/stores/:storeId/customer-receipt-recovery"',start);
 const {z}=await import('zod');let handler,selected,enabled=true,seenCompany;
 const db={$queryRaw:async(strings,...values)=>{seenCompany=values[0];return values[0]==='company'&&values[1]==='MWSTESTCARD'?[{id:'customer'}]:[]},$executeRaw:async()=>1};
 new Function('router','prisma','z','crypto','assertStore','storeFor','normalizeAudienceCard','resolveCustomer','readPosAudienceSettings','customerAudience','saveAudienceSelection','findLinkedOperatorCustomer','normalizeWorkCard',source.slice(start,end))(
  {post(path,fn){handler=fn}},db,z,crypto,(req,id)=>{if(req.user.storeId!==id)throw Object.assign(Error('foreign store'),{status:403})},async()=>({id:'store'}),v=>String(v).replace(/[^A-Za-z0-9]/g,'').toUpperCase(),async()=>({id:'customer',name:'Virtual doctor',discountAudience:'DOCTOR',discountPercent:15,memberCard:'MWSTESTCARD'}),async()=>({enabled}),customerAudience,async(req,id,audience)=>selected=audience,async()=>[],v=>String(v).replace(/[^A-Za-z0-9]/g,"").toUpperCase());
 const invoke=async(cardCode,extra={})=>{let result,error,status=200;await handler({params:{storeId:'store'},user,...extra,body:{cardCode}},{status(v){status=v;return this},json(v){result=v}},e=>error=e);return {result,error,status}};
 let response=await invoke('mws-test-card');assert.equal(response.result.audience,'DOCTOR');assert.equal(selected,'DOCTOR');assert.equal(response.result.customer.discountPercent,15);assert.equal(response.result.customer.memberCard,undefined);assert.equal(seenCompany,'company');
 enabled=false;response=await invoke('MWSTESTCARD');assert.equal(response.result.audience,'NORMAL');assert.equal(selected,'NORMAL');
 assert.equal((await invoke('WRONGCARD')).status,404);
 assert.equal((await invoke('MWSTESTCARD',{params:{storeId:'foreign'}})).error.status,403);
 assert.equal((await invoke('MWSTESTCARD',{user:{...user,companyId:'foreign'}})).status,404);
});
