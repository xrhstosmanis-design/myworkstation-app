import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {installStaffActionPolicy} from './helpers/backoffice-staff-actions-fixture.js';
import {requireStaffAction} from '../src/services/backoffice-staff-access.js';
import {maybeChangeSameProductStock} from '../src/store-baking-same-product.js';
const cancellationSource=async()=>(await readFile(new URL('../src/routes/pos-sale-actions.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;').replace(/^export /gm,'');
test('canonical cancellation fixture preserves the exported bootstrap body and parses before PostgreSQL execution',async()=>{new Function(await cancellationSource())});

test('native actual delegated cancellation preserves fiscal/same-terminal gates and writes one inverse sale, ledger, audit and stock restore',{skip:!isolatedInvoiceDb(),timeout:90000},async()=>{
 const f=await invoiceDbFixture(),db=f.db;
 try{
  const user=await installStaffActionPolicy(db,{capabilities:['sales.read']});
  for(const sql of [
   'ALTER TABLE "StoreProduct" ADD COLUMN "active" boolean DEFAULT true',
   'ALTER TABLE "StoreTransaction" ADD COLUMN "sessionId" text,ADD COLUMN "actorId" text,ADD COLUMN "actorName" text',
   'CREATE TABLE "CashShiftSession" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedAt" timestamptz DEFAULT now())',
   'CREATE TABLE "Sale" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorEmployeeId" text,"customerId" text,"fiscalStatus" text,"subtotal" numeric,"discount" numeric DEFAULT 0,"total" numeric,"status" text,"source" text,"occurredAt" timestamptz DEFAULT now(),"createdAt" timestamptz DEFAULT now(),"transactionMode" text,"originalSaleId" text,"reversalKind" text,"reversalState" text,"reversedAt" timestamptz,"reversedBy" text,"reversedByName" text)',
   'CREATE TABLE "SaleLine" ("id" text PRIMARY KEY,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric DEFAULT 0,"vatRate" numeric,"lineTotal" numeric,"createdAt" timestamptz DEFAULT now())',
   'CREATE TABLE "Payment" ("id" text PRIMARY KEY,"saleId" text,"method" text,"amount" numeric,"createdAt" timestamptz DEFAULT now())',
   'CREATE TABLE "PosSaleActionAudit" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"saleId" text,"relatedSaleId" text,"actionType" text,"reason" text,"actorId" text REFERENCES "User"("id"),"actorName" text,"details" jsonb,"createdAt" timestamptz DEFAULT now())'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status") VALUES ('shift','c','s','POS2','OPEN'),('control-shift','c','control','CONTROL','OPEN')`;
  await db.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","fiscalStatus","subtotal","total","status","source") VALUES ('sale','c','s','NON_FISCAL',6,6,'COMPLETED','POS')`;
  await db.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","vatRate","lineTotal") VALUES ('line','sale','p','Synthetic',2,3,0,6)`;
  await db.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES ('cash','sale','CASH',3),('card','sale','CARD',2),('iris','sale','IRIS',1)`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description") VALUES ('cash','c','s','shift','SALE_CASH',3,'POS πώληση sale · ΜΕΤΡΗΤΑ'),('card','c','s','shift','SALE_CARD',3,'POS πώληση sale · ΚΑΡΤΑ + IRIS'),('control','c','control','control-shift','SALE_CASH',11.11,'Control')`;
  const handlers={},router={use:()=>{},get:()=>{},post:(path,handler)=>handlers[path]=handler};
  const source=await cancellationSource();
  const deps={Router:()=>router,z,crypto,prisma:db,requireStaffAction,maybeChangeSameProductStock};new Function(...Object.keys(deps),source)(...Object.values(deps));
  const invoke=async(kind='CANCEL',terminal='POS2')=>{let result,failure,status=200;const req={user,params:{storeId:'s',saleId:'sale'},staffGrant:{capability:'sales.cancel'},body:{kind,reason:'Synthetic reviewed cancellation'},headers:{'x-mws-terminal-pos':terminal},get:()=>terminal},res={status:value=>(status=value,res),json:value=>{result=value}};await handlers['/stores/:storeId/sales/:saleId/reverse'](req,res,error=>failure=error);return {status:failure?.status||status,result,failure}};
  const snapshot=async()=>{const out={};for(const table of ['Sale','SaleLine','Payment','StoreTransaction','StoreProduct','PosSaleActionAudit','StoreOperatorAudit'])out[table]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY "id"`);return JSON.stringify(out)};
  let before=await snapshot();assert.equal((await invoke()).status,403);assert.equal(await snapshot(),before);
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["sales.read","sales.cancel"]'::jsonb`;
  assert.equal((await invoke('RETURN')).status,403);assert.equal((await invoke('CANCEL','POS3')).status,409);assert.equal(await snapshot(),before);
  await db.$executeRaw`UPDATE "Sale" SET "fiscalStatus"='ISSUED' WHERE "id"='sale'`;before=await snapshot();assert.equal((await invoke()).status,409);assert.equal(await snapshot(),before);
  await db.$executeRaw`UPDATE "Sale" SET "fiscalStatus"='NON_FISCAL' WHERE "id"='sale'`;
  const results=await Promise.all([invoke(),invoke()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const reversed=(await db.$queryRaw`SELECT * FROM "Sale" WHERE "source"='POS_REVERSAL'`);assert.equal(reversed.length,1);assert.equal(Number(reversed[0].total),-6);assert.equal(reversed[0].originalSaleId,'sale');
  const amounts=await db.$queryRaw`SELECT "method",SUM("amount") AS amount FROM "Payment" GROUP BY "method" ORDER BY "method"`;assert.ok(amounts.every(r=>Number(r.amount)===0));
  const stocks=await db.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"`;assert.deepEqual(stocks.map(r=>[r.storeId,Number(r.currentStock)]),[['control',20],['s',12]]);
  const audit=await db.$queryRaw`SELECT "actorId","actionType","relatedSaleId" FROM "PosSaleActionAudit"`;assert.deepEqual(audit,[{actorId:'delegated',actionType:'CANCEL',relatedSaleId:'sale'}]);
  assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "StoreTransaction" WHERE "id"='control'`)[0].amount),11.11);
  const after=await snapshot();await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false`;assert.equal((await invoke()).status,403);assert.equal(await snapshot(),after);
 }finally{await f.close()}
});
