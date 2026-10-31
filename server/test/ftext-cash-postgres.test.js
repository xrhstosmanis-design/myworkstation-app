import {recordLateCashReceipt} from '../src/services/ftext-late-cash-receipt.js';
import {ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {recordFtextOperatorDecision,releaseFtextRejectedAttempt} from '../src/services/ftext-operator-card.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {ensureFtextCashSchema,ftextCashLifecycleReviewProposal} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult,findPendingFtextCashRequest} from '../src/services/ftext-cash-requests.js';
import {finalizeFtextCashRequest} from '../src/services/ftext-cash-finalize.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native ftext cash: concurrent one-shot dispatch, durable result, real stock/financial atomic commit and replay',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_cash_'+randomBytes(12).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},settings={...scope,serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]},device={id:'device-a',tokenVersion:3};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'checkout-a',requestHash:'fixture-hash',checkout:{paymentMethod:'CASH',actorId:'operator-a',actorName:'Synthetic operator',operatorId:'cashier-a'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:1.25,discount:0,lineTotal:1.25,fiscalDepartment:4,vatRate:13,fiscalVatCode:'004'}],summary:{subtotal:1.25,discount:0,total:1.25}};
 const context=async()=>({settings});const opts={context};let request,receipt;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await ensureFtextCashSchema(a,{manifest:ftextCashLifecycleReviewProposal()});
  const actualColumns=await a.$queryRaw`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname='FtextCashRequest' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
  assert.deepEqual(actualColumns.map(c=>[c.name,c.type,c.required]),ftextCashLifecycleReviewProposal().knownColumns.FtextCashRequest);
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
   const rows=await Promise.all([a.$transaction(tx=>prepareFtextCashRequest(tx,input)),b.$transaction(tx=>prepareFtextCashRequest(tx,input))]);assert.equal(rows[0].id,rows[1].id);request=rows[0];assert.equal(request.plan.lines[0].department,'4');assert.equal(request.plan.lines[0].vatCode,'2');
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
  await t.test('an old final receipt cannot be assigned to a second checkout',async()=>{
   const second=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'checkout-second'}));
   await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
   await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...receipt,requestId:second.id,dayId:'017',dayCounter:'042'})),e=>e.code==='FTEXT_CASH_RECEIPT_REUSED');
   assert.equal((await a.$queryRaw`SELECT * FROM "Sale"`).length,1);assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${second.id}`)[0].status,'DISPATCHED');
  });

  await t.test('confirmed CARD result commits exactly once without a second cash posting; invalid evidence and stock failure commit nothing',async()=>{
   // Remove only this synthetic fixture's intentionally unresolved reused-receipt request.
   await a.$executeRaw`DELETE FROM "FtextCashRequest" WHERE "clientTransactionId"='checkout-second'`;
   Object.assign(settings,{cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:6,resultFormat:'POS_LINE8_OS7',confirmed:true}});
   const card=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'checkout-card',checkout:{...input.checkout,paymentMethod:'CARD'}}));
   assert.equal(card.plan.payment.method,'CARD');assert.equal(card.plan.payment.code,2);
   const claims=await Promise.all([a.$transaction(tx=>claimFtextCashRequest(tx,device,settings)),b.$transaction(tx=>claimFtextCashRequest(tx,device,settings))]);assert.equal(claims.filter(Boolean).length,1);
   const result={...receipt,requestId:card.id,settingsHash:card.settingsHash,dayCounter:'43',posPayments:[{cardType:'Visa Debit',amount:'1.25',cardNumberMasked:'416598******5605'}]};
   for(const patch of [{posPayments:undefined},{posPayments:[]},{posPayments:[{...result.posPayments[0],amount:'1.24'}]},{posPayments:[{...result.posPayments[0],cardType:'IRIS'}]},{posPayments:[{...result.posPayments[0],cardNumberMasked:'4165981234565605'}]}])await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...result,...patch})));
   assert.equal((await a.$queryRaw`SELECT "status" FROM "FtextCashRequest" WHERE "id"=${card.id}`)[0].status,'DISPATCHED');
   assert.equal((await a.$queryRaw`SELECT * FROM "Sale"`).length,1);
   await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,result));
   await assert.rejects(finalizeFtextCashRequest(a,card.id,scope,{context,reserveStock:async()=>{throw Error('injected card stock failure')}}));
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,1);
   const commits=await Promise.all([finalizeFtextCashRequest(a,card.id,scope,opts),finalizeFtextCashRequest(b,card.id,scope,opts)]);assert.equal(commits[0].saleId,commits[1].saleId);assert.equal(commits.filter(c=>c.replay).length,1);
   const payments=await a.$queryRaw`SELECT "method","amount" FROM "Payment" ORDER BY "method"`;assert.deepEqual(payments.map(p=>[p.method,Number(p.amount)]),[['CARD',1.25],['CASH',1.25]]);
   const txs=await a.$queryRaw`SELECT "type","amount" FROM "StoreTransaction" ORDER BY "type"`;assert.deepEqual(txs.map(p=>[p.type,Number(p.amount)]),[['SALE_CARD',1.25],['SALE_CASH',1.25]]);
   const stock=await a.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct"`;assert.equal(Number(stock.find(s=>s.storeId==='store-a').currentStock),-2);assert.equal(Number(stock.find(s=>s.storeId==='store-control').currentStock),20);
   assert.equal((await a.$queryRaw`SELECT * FROM "StockMovement"`).length,2);
   assert.equal(await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings)),null);
  });

  await t.test('operator card: no auto commit, original cashier decision bound to receipt, concurrent exactly-once commit',async()=>{
   settings.cardPayment={code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true};
   const card=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'operator-card',checkout:{...input.checkout,paymentMethod:'CARD'}}));
   await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
   const decide=(db,outcome,actor='operator-a',selected=scope)=>db.$transaction(tx=>recordFtextOperatorDecision(tx,card.id,selected,actor,{outcome},{context}));
   await assert.rejects(decide(a,'YES'));
   const result={...receipt,requestId:card.id,settingsHash:card.settingsHash,dayCounter:'44'};
   await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,result));
   await assert.rejects(finalizeFtextCashRequest(a,card.id,scope,opts));
   await assert.rejects(decide(a,'YES','foreign-cashier'));
   await assert.rejects(decide(a,'YES','operator-a',{...scope,terminalPos:'foreign'}));
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,2);
   const results=await Promise.all([decide(a,'YES'),decide(b,'YES')]);assert.deepEqual(results[0].checkoutJson.ftextCardDecision,results[1].checkoutJson.ftextCardDecision);
   await assert.rejects(decide(a,'NO'));
   await assert.rejects(finalizeFtextCashRequest(a,card.id,scope,{context,reserveStock:async()=>{throw Error('stock failure')}}));
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,2);
   const commits=await Promise.all([finalizeFtextCashRequest(a,card.id,scope,opts),finalizeFtextCashRequest(b,card.id,scope,opts)]);assert.equal(commits[0].saleId,commits[1].saleId);assert.equal(commits.filter(x=>x.replay).length,1);
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,3);
   assert.equal((await a.$queryRaw`SELECT * FROM "StockMovement"`).length,3);
   assert.equal(Number((await a.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='store-a'`)[0].currentStock),-3);
   assert.equal(Number((await a.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='store-control'`)[0].currentStock),20);
   const replay=await decide(a,'YES');assert.equal(replay.status,'SALE_COMMITTED');
  });
  await t.test('operator NO on failed PAY preserves immutable result, no business writes and atomic application release',async()=>{
   const card=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'operator-declined',checkout:{...input.checkout,paymentMethod:'CARD'}}));
   await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
   const original=await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{requestId:card.id,settingsHash:card.settingsHash,outcome:'REQUIRES_CHECK',code:48,failedCommand:'PAY||2',rawResultHash:'e'.repeat(64)}));
   const row=await a.$transaction(tx=>recordFtextOperatorDecision(tx,card.id,scope,'operator-a',{outcome:'NO'},{context}));
   assert.equal(row.status,'REQUIRES_CHECK');assert.equal(row.resultHash,original.resultHash);assert.deepEqual(row.result,original.result);
   await assert.rejects(a.$transaction(tx=>recordFtextOperatorDecision(tx,card.id,scope,'operator-a',{outcome:'YES'},{context})));
   await assert.rejects(finalizeFtextCashRequest(a,card.id,scope,opts));
   assert.equal(row.checkoutJson.ftextOperatorRelease.reviewMode,'OPERATOR_NO');assert.equal(row.checkoutJson.ftextOperatorRelease.readinessVerified,false);
   assert.equal((await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'new-after-no'}))).status,'PREPARED');
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,3);assert.equal((await a.$queryRaw`SELECT * FROM "StockMovement"`).length,3);
  });


  await t.test('late CASH receipt retains original timeout and commits once with original shift; replay, foreign and reused proof protected',async()=>{
   const rejected=(await a.$queryRaw`SELECT "id" FROM "FtextCashRequest" WHERE "clientTransactionId"='operator-declined'`)[0];
   await a.$transaction(tx=>releaseFtextRejectedAttempt(tx,rejected.id,scope,'operator-a',{registerReady:true}));
   // Reuse the PREPARED request deliberately left by the preceding NO-release test; never delete a pending row to make recovery pass.
   const late=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'new-after-no'}));
   assert.equal(late.status,'PREPARED');
   assert.equal(Number((await a.$queryRaw`SELECT COUNT(*)::int AS n FROM "FtextCashRequest" WHERE "clientTransactionId"='new-after-no'`)[0].n),1);
   await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
   const unknown={requestId:late.id,settingsHash:late.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
   const original=await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,unknown));
   const unchanged=await a.$queryRaw`SELECT * FROM "FtextCashRequest" ORDER BY "createdAt"`;
   assert.equal((await findPendingFtextCashRequest(a,scope)).id,late.id,'Released historical CARD must not hide the current CASH recovery');
   assert.equal(await findPendingFtextCashRequest(a,{...scope,storeId:'foreign'}),null);
   assert.equal(await findPendingFtextCashRequest(a,{...scope,terminalPos:'foreign'}),null);
   assert.deepEqual(await a.$queryRaw`SELECT * FROM "FtextCashRequest" ORDER BY "createdAt"`,unchanged,'Inspection must never mutate released history');
   const encode=x=>Buffer.from(x).toString('base64'),raw='0\r\n17\r\n45\r\nSYNTHETIC01\r\n30/10/2026 19:32\r\n0\r\nhttps://www1.aade.gr/tameiakes/myweb/q1.php?SIG=SYNTHETIC01ABC26103019321.25\r\n\r\n671\r\n\r\n';
   const proof={intentBase64:encode(JSON.stringify({requestId:late.id,settingsHash:late.settingsHash,commandHash:ftextOriginalCommandHash(original,settings)})),reportBase64:encode(JSON.stringify(unknown)),rawResultBase64:encode(raw),reason:'Synthetic owner verified original printed receipt'};
   const recover=(db,selected=scope,current={device,settings})=>db.$transaction(tx=>recordLateCashReceipt(tx,selected,late.id,'admin',proof,{context:async()=>current}));
   await assert.rejects(recover(a,{...scope,storeId:'foreign'}));await assert.rejects(recover(a,scope,{device:{...device,tokenVersion:4},settings}));
   const before=(await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${late.id}`)[0];assert.deepEqual(before,original);
   const copies=await Promise.all([recover(a),recover(b)]);assert.deepEqual(copies[0].checkoutJson.ftextLateCashReceipt,copies[1].checkoutJson.ftextLateCashReceipt);
   for(const recovered of copies){assert.equal(recovered.status,'CONFIRMED');assert.deepEqual(recovered.result,original.result);assert.equal(recovered.resultHash,original.resultHash);assert.equal(recovered.saleId,null);}
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,3);
   await a.$executeRaw`UPDATE "CashShiftSession" SET "status"='CLOSED' WHERE "id"='shift-a'`;
   await assert.rejects(finalizeFtextCashRequest(a,late.id,scope,opts));await a.$executeRaw`UPDATE "CashShiftSession" SET "status"='OPEN' WHERE "id"='shift-a'`;
   await assert.rejects(finalizeFtextCashRequest(a,late.id,scope,{context,reserveStock:async()=>{throw Error('late stock failure')}}));
   assert.equal((await a.$queryRaw`SELECT * FROM "Payment"`).length,3);
   const commits=await Promise.all([finalizeFtextCashRequest(a,late.id,scope,opts),finalizeFtextCashRequest(b,late.id,scope,opts)]);assert.equal(commits[0].saleId,commits[1].saleId);assert.equal(commits.filter(x=>x.replay).length,1);
   for(const table of ['Sale','Payment','StockMovement','StoreTransaction','StoreOperatorAudit'])assert.equal((await a.$queryRawUnsafe(`SELECT * FROM "${table}"`)).length,4,table);
   assert.equal(Number((await a.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='store-a'`)[0].currentStock),-4);
   assert.equal(Number((await a.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='store-control'`)[0].currentStock),20);
   const audit=(await a.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "details"->>'requestId'=${late.id}`)[0];assert.equal(audit.details.receipt.dayCounter,'45');assert.equal(audit.details.receipt.outcome,'CONFIRMED');
   const replay=await recover(a);assert.equal(replay.saleId,commits[0].saleId);assert.deepEqual(replay.result,original.result);assert.equal(replay.resultHash,original.resultHash);
   const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'late-reused'}));await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
   await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...receipt,requestId:next.id,settingsHash:next.settingsHash,dayCounter:'45'})),e=>e.code==='FTEXT_CASH_RECEIPT_REUSED');
  });

 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
