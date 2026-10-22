import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {ensureFtextCashSchema} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {finalizeFtextCashRequest} from '../src/services/ftext-cash-finalize.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native ftext cash: concurrent one-shot dispatch, durable result, real stock/financial atomic commit and replay',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_cash_'+randomBytes(12).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},settings={...scope,serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]},device={id:'device-a',tokenVersion:3};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'checkout-a',requestHash:'fixture-hash',checkout:{paymentMethod:'CASH',actorId:'operator-a',actorName:'Synthetic operator',operatorId:'cashier-a'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:1.25,discount:0,lineTotal:1.25,fiscalDepartment:4,vatRate:13,fiscalVatCode:'2'}],summary:{subtotal:1.25,discount:0,total:1.25}};
 const context=async()=>({settings});const opts={context};let request,receipt;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await ensureFtextCashSchema(a);
  for(const sql of [
   'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN)',
   'CREATE TABLE "StoreProduct" ("storeId" TEXT,"productId" TEXT,"active" BOOLEAN,"currentStock" NUMERIC,"updatedAt" TIMESTAMPTZ,PRIMARY KEY("storeId","productId"))',
   'CREATE TABLE "StoreBakingPolicy" ("companyId" TEXT,"storeId" TEXT,"productId" TEXT,"mode" TEXT,"sourceProductId" TEXT)',
   'CREATE TABLE "PreparationRecipeLine" ("companyId" TEXT,"productId" TEXT,"automatic" BOOLEAN)',
   'CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"movementType" TEXT,"quantity" NUMERIC,"unitCost" NUMERIC,"sourceType" TEXT,"sourceId" TEXT,"note" TEXT,"createdByUserId" TEXT,"idempotencyKey" TEXT)',
   'CREATE UNIQUE INDEX "movement_key" ON "StockMovement" ("storeId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL',
   'CREATE TABLE "CashShiftSession" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"terminalPos" TEXT,"status" TEXT)',
   'CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"operatorEmployeeId" TEXT,"fiscalStatus" TEXT,"subtotal" NUMERIC,"discount" NUMERIC,"total" NUMERIC,"status" TEXT,"source" TEXT,"clientTransactionId" TEXT,"saleFingerprint" TEXT,"duplicateConfirmed" BOOLEAN,"transactionMode" TEXT,"operationChannel" TEXT,"audience" TEXT)',
   'CREATE TABLE "SaleLine" ("id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"description" TEXT,"quantity" NUMERIC,"unitPrice" NUMERIC,"discount" NUMERIC,"vatRate" NUMERIC,"lineTotal" NUMERIC,"scannedBarcode" TEXT)',
   'CREATE TABLE "Payment" ("id" TEXT PRIMARY KEY,"saleId" TEXT,"method" TEXT,"amount" NUMERIC)',
   'CREATE TABLE "StoreTransaction" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"sessionId" TEXT,"type" TEXT,"amount" NUMERIC,"description" TEXT,"actorId" TEXT,"actorName" TEXT)',
   'CREATE TABLE "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"operatorId" TEXT,"actorId" TEXT,"eventType" TEXT,"details" JSONB)'
  ])await a.$executeRawUnsafe(sql);
  await a.$executeRaw`INSERT INTO "Product" VALUES ('product-a','company-a',true,true),('product-control','company-b',true,true)`;
  await a.$executeRaw`INSERT INTO "StoreProduct" VALUES ('store-a','product-a',true,0,NOW()),('store-control','product-control',true,20,NOW())`;
  await a.$executeRaw`INSERT INTO "CashShiftSession" VALUES ('shift-a','company-a','store-a','POS-01','OPEN')`;
  await t.test('same client identity races to one durable request; changed body and second pending refuse',async()=>{
   const rows=await Promise.all([a.$transaction(tx=>prepareFtextCashRequest(tx,input)),b.$transaction(tx=>prepareFtextCashRequest(tx,input))]);assert.equal(rows[0].id,rows[1].id);request=rows[0];
   await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,requestHash:'changed'})),e=>e.code==='FTEXT_CASH_KEY_CHANGED');
   await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'checkout-other'})),e=>e.code==='FTEXT_CASH_PENDING');
   assert.equal((await a.$queryRaw`SELECT * FROM "Sale"`).length,0);
  });
  await t.test('two real pollers can commit only one dispatch; no redelivery after lost response',async()=>{
   const claims=await Promise.all([a.$transaction(tx=>claimFtextCashRequest(tx,device,settings)),b.$transaction(tx=>claimFtextCashRequest(tx,device,settings))]);assert.equal(claims.filter(Boolean).length,1);assert.equal(claims.find(Boolean).id,request.id);
   assert.equal(await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings)),null);
   await assert.rejects(finalizeFtextCashRequest(a,request.id,scope,opts));assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,0);
  });
  await t.test('foreign token/settings/result refuse; final receipt durable before accounting',async()=>{
   receipt={requestId:request.id,settingsHash:request.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:settings.serialNumber,dayId:'17',dayCounter:'42',deviceTime:'fixture time',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64)};
   for(const wrong of [{...device,id:'foreign'},{...device,tokenVersion:4}])await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,wrong,settings,receipt)));
   await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,{...settings,lifecycleGeneration:'1'},receipt)));
   const confirmed=await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,receipt));assert.equal(confirmed.status,'CONFIRMED');
   assert.equal((await a.$queryRaw`SELECT * FROM "Sale"`).length,0);assert.equal((await a.$queryRaw`SELECT * FROM "StockMovement"`).length,0);
   assert.equal((await b.$transaction(tx=>recordFtextCashResult(tx,device,settings,receipt))).resultHash,confirmed.resultHash);
   await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...receipt,dayCounter:'43'})));
  });
  await t.test('closed original shift, foreign scope and stock failure roll back all business writes',async()=>{
   await a.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift-a'`;
   await assert.rejects(finalizeFtextCashRequest(a,request.id,scope,opts));await a.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN' WHERE "id"='shift-a'`;
   await assert.rejects(finalizeFtextCashRequest(a,request.id,{...scope,storeId:'foreign'},opts));
   await assert.rejects(finalizeFtextCashRequest(a,request.id,scope,{context,reserveStock:async()=>{throw Error('injected stock failure')}}));
   assert.equal((await a.$queryRaw`SELECT * FROM "Sale"`).length,0);assert.equal((await a.$queryRaw`SELECT * FROM "SaleLine"`).length,0);assert.equal((await a.$queryRaw`SELECT * FROM "StoreTransaction"`).length,0);
   assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest"`)[0].status,'CONFIRMED');
  });
  await t.test('concurrent finalizers use real reserveSharedStock and create exactly one sale/payment/cash/movement',async()=>{
   const results=await Promise.all([finalizeFtextCashRequest(a,request.id,scope,opts),finalizeFtextCashRequest(b,request.id,scope,opts)]);assert.equal(results[0].saleId,results[1].saleId);assert.equal(results.filter(r=>r.replay).length,1);assert.equal(results[0].inventoryWarnings[0].code,'NEGATIVE_STOCK_RECORDED');assert.deepEqual(results[0].inventoryWarnings,results[1].inventoryWarnings);
   for(const table of ['Sale','SaleLine','Payment','StoreTransaction','StockMovement','StoreOperatorAudit'])assert.equal(Number((await a.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`))[0].n),1,table);
   const stock=await a.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"`;assert.equal(Number(stock.find(r=>r.storeId==='store-a').currentStock),-1);assert.equal(Number(stock.find(r=>r.storeId==='store-control').currentStock),20);
   assert.equal((await a.$queryRaw`SELECT "operatorId" FROM "StoreOperatorAudit"`)[0].operatorId,'cashier-a');assert.equal((await a.$queryRaw`SELECT "fiscalStatus" FROM "Sale"`)[0].fiscalStatus,'ISSUED');assert.equal((await a.$queryRaw`SELECT "type","amount" FROM "StoreTransaction"`)[0].type,'SALE_CASH');
   assert.equal((await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,receipt))).status,'SALE_COMMITTED');
  });
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
