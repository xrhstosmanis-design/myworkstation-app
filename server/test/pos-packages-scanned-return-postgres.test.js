import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {packageStatements,saveStockPackage,changePackageStock} from '../src/lib/pos-stock-packages.js';
import {scannedReturnStatements,quoteScannedCashReturn,recordScannedCashReturn,cancelScannedCashReturn,assertScannedReturnScope,scannedReturnSchema} from '../src/lib/pos-scanned-cash-return.js';
const owner={id:'owner',companyId:'company',role:'OWNER',fullName:'Virtual owner'};
const scope={companyId:'company',storeId:'store',terminalPos:'MAIN',user:owner};
const input={items:[{productId:'pack24',quantity:1},{productId:'water',quantity:1}]};
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('scanned cash return needs live return/cash rights, bound company/store and confirmation',()=>{
 assert.doesNotThrow(()=>assertScannedReturnScope(scope));
 const user={...owner,tokenType:'STORE_OPERATOR',role:'EMPLOYEE',storeId:'store',permissions:['RETURN_ITEMS','POS_CASH']};
 assert.doesNotThrow(()=>assertScannedReturnScope({...scope,user}));
 for(const bad of [{...scope,user:{...user,permissions:['RETURN_ITEMS']}},{...scope,user:{...user,permissions:['POS_CASH']}},{...scope,user:{...user,storeId:'foreign'}},{...scope,user:{...owner,staffAccess:true}},{...scope,user:{...owner,companyId:'foreign'}}])assert.throws(()=>assertScannedReturnScope(bad),{status:403});
 assert.equal(scannedReturnSchema.safeParse({...input,requestId:crypto.randomUUID(),sessionId:'shift',quoteHash:'a'.repeat(64),confirmed:false}).success,false);
});
test('isolated PostgreSQL: packages, atomic cash return, retries, cancellation, rollback and controls',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`pack_return_test_${crypto.randomUUID().replaceAll('-','')}`;
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const sqls=[
   'CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" bool)',
   'CREATE TABLE "Product"("id" text primary key,"companyId" text,"name" text,"sku" text,"unit" text,"active" bool,"trackStock" bool,"isSet" bool default false,"isRecipe" bool default false,"salePrice" numeric,"vatRate" numeric,"vatDepartmentId" text)',
   'CREATE TABLE "StoreProduct"("storeId" text,"productId" text,"active" bool,"currentStock" numeric,"salePrice" numeric,"vatDepartmentIdOverride" text,"updatedAt" timestamptz,primary key("storeId","productId"))',
   'CREATE TABLE "ProductBarcode"("productId" text,"barcode" text,"salePrice" numeric)',
   'CREATE TABLE "ManagementVatDepartment"("id" text,"companyId" text,"vatRate" numeric)',
   'CREATE TABLE "PreparationRecipeLine"("companyId" text,"productId" text,"automatic" bool)',
   'CREATE TABLE "StoreBakingPolicy"("companyId" text,"storeId" text,"productId" text)',
   'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedAt" timestamptz default now())',
   'CREATE TABLE "Sale"("id" text primary key,"companyId" text,"storeId" text,"operatorEmployeeId" text,"fiscalStatus" text,"subtotal" numeric,"discount" numeric,"total" numeric,"status" text,"source" text,"occurredAt" timestamptz,"transactionMode" text,"reversalKind" text,"operationChannel" text)',
   'CREATE TABLE "SaleLine"("id" text primary key,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"discount" numeric,"vatRate" numeric,"lineTotal" numeric)',
   'CREATE TABLE "Payment"("id" text primary key,"saleId" text,"method" text,"amount" numeric)',
   'CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"actorId" text,"actorName" text)',
   'CREATE TABLE "StockMovement"("id" text primary key,"storeId" text,"productId" text,"movementType" text,"quantity" numeric,"unitCost" numeric,"sourceType" text,"sourceId" text,"note" text,"createdByUserId" text,"idempotencyKey" text)',
   'CREATE TABLE "PosSaleActionAudit"("id" text primary key,"companyId" text,"storeId" text,"saleId" text,"actionType" text,"reason" text,"actorId" text,"actorName" text,"details" jsonb)',
   'CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)',
   ...packageStatements,...scannedReturnStatements];
  for(const sql of sqls)await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('store','company',true),('control','company',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name","unit","active","trackStock","salePrice","vatRate") VALUES('pack24','company','24-pack','PACKAGE',true,true,8,13),('water','company','500ml','PIECE',true,true,.5,13),('pack6','company','6-pack','PACKAGE',true,true,4,13),('water1500','company','1500ml','PIECE',true,true,.7,13)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("storeId","productId","active","currentStock","salePrice") VALUES('store','pack24',true,0,8),('store','water',true,100,.5),('store','pack6',true,0,4),('store','water1500',true,60,.7),('control','pack24',true,0,9),('control','water',true,500,.6)`);
  await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","terminalPos","status") VALUES('shift','company','store','MAIN','OPEN'),('control-shift','company','store','CONTROL','OPEN'),('other-store-shift','company','control','MAIN','OPEN')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount") VALUES('control-ledger','company','store','control-shift','SALE_CARD',55)`);
  await saveStockPackage(db,{...scope,productId:'pack24'},{baseProductId:'water',unitsPerPackage:24});
  await saveStockPackage(db,{...scope,productId:'pack6'},{baseProductId:'water1500',unitsPerPackage:6});
  await saveStockPackage(db,{...scope,storeId:'control',productId:'pack24'},{baseProductId:'water',unitsPerPackage:24});
  await db.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total","status","source","fiscalStatus") VALUES('original-card','company','store',12,'COMPLETED','POS','ISSUED')`);
  await db.$executeRawUnsafe(`INSERT INTO "Payment" VALUES('original-card-payment','original-card','CARD',12)`);
  const stock=async()=>Object.fromEntries((await db.$queryRaw`SELECT "storeId","productId","currentStock" FROM "StoreProduct"`).map(r=>[`${r.storeId}:${r.productId}`,Number(r.currentStock)]));
  const snapshot=async()=>JSON.stringify({stock:await stock(),sales:await db.$queryRaw`SELECT * FROM "Sale" ORDER BY "id"`,payments:await db.$queryRaw`SELECT * FROM "Payment" ORDER BY "id"`,ledger:await db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,movements:await db.$queryRaw`SELECT * FROM "StockMovement" ORDER BY "id"`,audit:await db.$queryRaw`SELECT * FROM "PosSaleActionAudit" ORDER BY "id"`});
  const request=async(extra={})=>{const q=await db.$transaction(tx=>quoteScannedCashReturn(tx,scope,input));return {...input,requestId:crypto.randomUUID(),sessionId:q.sessionId,quoteHash:q.quoteHash,confirmed:true,...extra}};
  await assert.rejects(db.$executeRawUnsafe(`UPDATE "StoreProduct" SET "currentStock"=1 WHERE "storeId"='store' AND "productId"='pack24'`));
  const beforeRecipe=await snapshot();await db.$executeRawUnsafe(`INSERT INTO "PreparationRecipeLine" VALUES('company','water',true)`);
  await assert.rejects(db.$transaction(tx=>quoteScannedCashReturn(tx,scope,input)),{status:409});assert.equal(await snapshot(),beforeRecipe);
  await db.$executeRawUnsafe(`DELETE FROM "PreparationRecipeLine"`);
  const q=await db.$transaction(tx=>quoteScannedCashReturn(tx,scope,input));assert.equal(q.refundCents,850);assert.equal(q.cardDeltaCents,0);
  const body=await request(),result=await recordScannedCashReturn(db,scope,body),after=await snapshot();
  assert.equal(result.total,-8.5);assert.equal((await stock())['store:water'],125);assert.equal((await stock())['control:water'],500);assert.equal((await stock())['store:pack24'],0);
  assert.equal(Number((await db.$queryRaw`SELECT * FROM "Payment" WHERE "id"='original-card-payment'`)[0].amount),12);assert.equal((await db.$queryRaw`SELECT * FROM "Payment" WHERE "method"='CASH'`).length,1);assert.equal(Number((await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"='control-ledger'`)[0].amount),55);
  assert.equal((await recordScannedCashReturn(db,scope,body)).replayed,true);assert.equal(await snapshot(),after);
  await assert.rejects(recordScannedCashReturn(db,scope,{...body,items:[{productId:'water',quantity:1}]}),{status:409});assert.equal(await snapshot(),after);
  await assert.rejects(recordScannedCashReturn(db,{...scope,terminalPos:'CONTROL'},body),{status:409});assert.equal(await snapshot(),after);
  const concurrent=await request();const twice=await Promise.all([recordScannedCashReturn(db,scope,concurrent),recordScannedCashReturn(db,scope,concurrent)]);assert.equal(twice.filter(x=>x.replayed).length,1);assert.equal((await stock())['store:water'],150);
  const cancelled=await request(),beforeCancel=await snapshot();assert.equal((await cancelScannedCashReturn(db,scope,cancelled)).cancelled,true);assert.equal((await recordScannedCashReturn(db,scope,cancelled)).cancelled,true);assert.equal(await snapshot(),beforeCancel);
  assert.equal((await cancelScannedCashReturn(db,scope,body)).saleId,result.saleId);
  const changed=await request();await db.$executeRawUnsafe(`UPDATE "StoreProduct" SET "salePrice"=7.35 WHERE "storeId"='store' AND "productId"='pack24'`);const beforeChanged=await snapshot();await assert.rejects(recordScannedCashReturn(db,scope,changed),{status:409});assert.equal(await snapshot(),beforeChanged);
  const other=await db.$transaction(tx=>quoteScannedCashReturn(tx,{...scope,storeId:'control'},input));assert.equal(other.refundCents,960);
  const failing=await request(),beforeFail=await snapshot();await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "reject_cash_return" CHECK("eventType"<>'POS_RETURN_COMPLETED') NOT VALID`);await assert.rejects(recordScannedCashReturn(db,scope,failing));assert.equal(await snapshot(),beforeFail);await db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT "reject_cash_return"`);
  const beforeSale=await stock();await db.$transaction(tx=>changePackageStock(tx,{companyId:'company',storeId:'store',productId:'pack6',quantity:2,saleId:'sale-six',lineId:'six-line'}));assert.equal((await stock())['store:water1500'],beforeSale['store:water1500']-12);
  await db.$transaction(tx=>changePackageStock(tx,{companyId:'company',storeId:'store',productId:'pack6',quantity:2,saleId:'restore-six',lineId:'six-return',originalLineId:'six-line',restore:true}));assert.equal((await stock())['store:water1500'],beforeSale['store:water1500']);
  await assert.rejects(saveStockPackage(db,{...scope,productId:'pack24'},{baseProductId:'water1500',unitsPerPackage:12}),{status:409});
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
