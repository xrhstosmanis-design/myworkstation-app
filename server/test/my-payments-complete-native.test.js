import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {canCorrectPayment} from '../src/lib/payment-amount-correction.js';

const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
const actor={id:'actor',fullName:'Virtual operator',companyId:'company',storeId:'store',terminalPos:'MAIN',tokenType:'STORE_OPERATOR',permissions:['STORE_LEDGER','SUPPLIER_PAYMENT','THIRD_PARTY_PAYMENT']};
function register(db){
  const handlers=new Map();let guard;
  const Router=()=>({use(...args){guard=args.at(-1)},...Object.fromEntries(['get','post'].map(method=>[method,(path,...args)=>handlers.set(method+path,args.at(-1))]))});
  const tables=new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','canCorrectPayment',source+';return tableStatements;')(Router,db,crypto,z,()=>{},async()=>{},canCorrectPayment);
  const run=(user=actor,storeId='store')=>new Promise(resolve=>{let status=200;const req={method:'GET',user,params:{storeId},query:{},headers:{},originalUrl:`/api/transactions/stores/${storeId}/overview`},res={status(n){status=n;return this},json(data){resolve({status,data})}};guard(req,res,()=>handlers.get('get/stores/:storeId/overview')(req,res));});
  return {tables,run};
}
test('actual overview denies foreign stores and unauthorized actors before querying payments',async()=>{
  let reads=0;const {run}=register({store:{findFirst:async()=>null},$queryRaw:async()=>{reads++;return []}});
  assert.equal((await run(actor,'foreign')).status,403);
  assert.equal((await run({...actor,permissions:[]})).status,403);assert.equal(reads,0);
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native actual overview includes older-than-80 own payments and excludes other actor/company/store/terminal/closed/external rows',{skip:!isolated()},async()=>{
  const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schemaName='my_payments_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schemaName);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const wrapped=new Proxy(db,{get(target,key){if(key==='store')return {findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store',name:'Virtual store',companyId:'company',active:true}:null};if(key==='$queryRawUnsafe')return async()=>[];const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  const {tables,run}=register(wrapped);
  try{
    for(const sql of tables)await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe('CREATE TABLE "Supplier" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"taxId" TEXT,"active" BOOLEAN DEFAULT true)');
    await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"documentNumber" TEXT,"documentDate" TIMESTAMPTZ,"totalGross" NUMERIC(14,2),"status" TEXT)');
    await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","openedBy","status") VALUES ('shift','company','store','MAIN','actor','OPEN'),('control','company','store','CONTROL','actor','OPEN'),('closed','company','store','OLD','actor','CLOSED')`;
    const payment=async(id,amount,type='SUPPLIER_PAYMENT',sessionId='shift',actorId='actor',companyId='company',storeId='store',reversedAt=null)=>db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","actorId","actorName","subtractFromShift","occurredAt","createdAt","reversedAt") VALUES (${id},${companyId},${storeId},${sessionId},${type},${amount},${actorId},'Virtual actor',true,'2026-10-12T00:00:00Z'::timestamptz,'2026-10-12T17:22:00Z'::timestamptz,${reversedAt})`;
    await payment('supplier',400);await payment('expense',80,'OTHER_EXPENSE');await payment('reversed',99,'OTHER_EXPENSE','shift','actor','company','store',new Date('2026-10-12T18:00:00Z'));
    await payment('other-actor',777,'SUPPLIER_PAYMENT','shift','other');await payment('foreign-company',777,'SUPPLIER_PAYMENT','shift','actor','foreign');await payment('foreign-store',777,'SUPPLIER_PAYMENT','shift','actor','company','foreign');await payment('other-terminal',777,'SUPPLIER_PAYMENT','control');await payment('closed-shift',777,'SUPPLIER_PAYMENT','closed');await payment('external',777,'SUPPLIER_PAYMENT',null);
    for(let i=0;i<120;i++)await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","actorId","occurredAt") VALUES (${`sale${i}`},'company','store','shift','SALE_CASH',1,'actor','2026-10-12T18:00:00Z'::timestamptz)`;
    const result=await run();assert.equal(result.status,200);assert.equal(result.data.recent.length,80);assert.ok(result.data.recent.every(row=>row.type==='SALE_CASH'));
    assert.deepEqual(result.data.myPayments.map(row=>row.id).sort(),['expense','reversed','supplier']);assert.equal(result.data.myPayments.filter(row=>!row.reversedAt).reduce((sum,row)=>sum+row.amount,0),480);
    assert.equal(result.data.myPayments.find(row=>row.id==='supplier').canCorrectAmount,true);assert.equal(result.data.myPayments.find(row=>row.id==='reversed').canCorrectAmount,false);assert.equal(new Date(result.data.myPayments.find(row=>row.id==='supplier').createdAt).toISOString(),'2026-10-12T17:22:00.000Z');
    const review=await run({...actor,permissions:[...actor.permissions,'STORE_LEDGER_REVIEW']});assert.deepEqual(review.data.myPayments.map(row=>row.id).sort(),['expense','reversed','supplier']);
    await db.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift'`;const closed=await run();assert.equal(closed.data.openSession,null);assert.deepEqual(closed.data.myPayments,[]);
    assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "StoreTransaction"`)[0].n),129);
  }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);await admin.$disconnect();}
});
