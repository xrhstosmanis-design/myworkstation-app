import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult,ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
import {requestFtextVoid,claimFtextVoid,recordFtextVoidResult} from '../src/services/ftext-void.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native VOID single dispatch, immutable result, scoped refusal, pending release and exact legacy index upgrade',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_void_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.href}),b=new PrismaClient({datasourceUrl:url.href});
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},device={id:'device-a',tokenVersion:3},settings={...scope,serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:6,resultFormat:'POS_LINE8_OS7',confirmed:true}};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'original',requestHash:'fixture',checkout:{paymentMethod:'CARD'},items:[{productId:'product-a',name:'FIXTURE',quantity:1,effectiveUnitPrice:0.5,lineTotal:0.5,fiscalDepartment:4,vatRate:13}],summary:{subtotal:0.5,total:0.5}},ack={noCardPresented:true,eftposStopped:true,exclusiveRegister:true};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await provisionFtextRecoverySchema(a);
  // Recreate the exact accepted v1 index, then prove ordinary upgrade preserves rows.
  await a.$executeRawUnsafe(`DROP INDEX "FtextCashRequest_register_pending_idx"`);await a.$executeRawUnsafe(`CREATE UNIQUE INDEX "FtextCashRequest_register_pending_idx" ON "FtextCashRequest" ("companyId","storeId","serialNumber") WHERE "status"<>'SALE_COMMITTED'`);
  const first=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));const before=await a.$queryRaw`SELECT row_to_json(t)::text AS row FROM "FtextCashRequest" t`;
  await Promise.all([provisionFtextRecoverySchema(a),provisionFtextRecoverySchema(b)]);assert.deepEqual(await a.$queryRaw`SELECT row_to_json(t)::text AS row FROM "FtextCashRequest" t`,before);
  await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  const original={requestId:first.id,settingsHash:first.settingsHash,outcome:'REQUIRES_CHECK',code:48,failedCommand:'PAY||2',rawResultHash:'c'.repeat(64)};
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,original));const context={device,settings};
  for(const [sc,body,ctx] of [[{...scope,storeId:'foreign'},ack,context],[scope,{...ack,noCardPresented:false},context],[scope,ack,{device:{...device,tokenVersion:4},settings}],[scope,ack,{device,settings:{...settings,lifecycleGeneration:'1'}}]])await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,sc,first.id,'admin',body,ctx)));
  const jobs=await Promise.all([a.$transaction(tx=>requestFtextVoid(tx,scope,first.id,'admin',ack,context)),b.$transaction(tx=>requestFtextVoid(tx,scope,first.id,'admin',ack,context))]);assert.equal(jobs[0].checkoutJson.ftextVoid.id,jobs[1].checkoutJson.ftextVoid.id);
  const claims=await Promise.all([a.$transaction(tx=>claimFtextVoid(tx,device,settings)),b.$transaction(tx=>claimFtextVoid(tx,device,settings))]);assert.equal(claims.filter(Boolean).length,1);assert.equal(await a.$transaction(tx=>claimFtextVoid(tx,device,settings)),null);
  await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'blocked'})));
  const claim=claims.find(Boolean),proof={requestId:claim.id,originalRequestId:first.id,settingsHash:first.settingsHash,outcome:'VOID_CONFIRMED',code:0,serialNumber:settings.serialNumber,dayId:'1',dayCounter:'27',deviceTime:'fixture',rawResultHash:'d'.repeat(64)};
  await assert.rejects(a.$transaction(tx=>recordFtextVoidResult(tx,{...device,id:'foreign'},settings,proof)));
  await assert.rejects(a.$transaction(tx=>recordFtextVoidResult(tx,device,settings,{...proof,qr:'https://www1.aade.gr/receipt'})));
  const finished=await a.$transaction(tx=>recordFtextVoidResult(tx,device,settings,proof));assert.deepEqual(finished.result,original);assert.equal(finished.resultHash,jobs[0].resultHash);assert.equal(ftextCashRequestView(finished).status,'CANCELLED');assert.equal(finished.saleId,null);
  assert.deepEqual((await b.$transaction(tx=>recordFtextVoidResult(tx,device,settings,proof))).checkoutJson,finished.checkoutJson);
  await assert.rejects(a.$transaction(tx=>recordFtextVoidResult(tx,device,settings,{...proof,rawResultHash:'e'.repeat(64)})));
  const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'next'}));assert.notEqual(next.id,first.id);
  const replay=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));assert.equal(ftextCashRequestView(replay).status,'CANCELLED');
  // No financial tables exist: any sale/payment/stock write would have failed this native flow.
  const saved=await a.$queryRaw`SELECT "result","resultHash","checkoutJson" FROM "FtextCashRequest" WHERE "id"=${first.id}`;await provisionFtextRecoverySchema(a);assert.deepEqual(await a.$queryRaw`SELECT "result","resultHash","checkoutJson" FROM "FtextCashRequest" WHERE "id"=${first.id}`,saved);
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
