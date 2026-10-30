import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {recordFtextOperatorDecision,releaseFtextRejectedAttempt} from '../src/services/ftext-operator-card.js';
import {pollFtextErrorEvidence} from '../src/services/ftext-error-evidence.js';
import {requestFtextVoid} from '../src/services/ftext-void.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native reviewed unknown NO releases only after original-cashier attestations, once under concurrency, without any business tables',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_review_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.href}),b=new PrismaClient({datasourceUrl:url.href});
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},device={id:'device-a',tokenVersion:3},settings={...scope,serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true}};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'review-original',requestHash:'fixture',checkout:{actorId:'cashier',paymentMethod:'CARD'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:0.5,lineTotal:0.5,fiscalDepartment:4,vatRate:13}],summary:{subtotal:0.5,total:0.5}},context=async()=>({device,settings}),ack={registerReady:true,noReceiptIssued:true,noChargeApproved:true};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await provisionFtextRecoverySchema(a);
  const original=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{requestId:original.id,settingsHash:original.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'}));
  await a.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,scope,'cashier',{outcome:'NO'},{context}));
  const before=(await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${original.id}`)[0];
  await assert.rejects(a.$transaction(tx=>releaseFtextRejectedAttempt(tx,original.id,scope,'cashier',{registerReady:true},{context})));
  for(const [actor,selected,current] of [['foreign',scope,settings],['cashier',{...scope,storeId:'foreign'},settings],['cashier',{...scope,terminalPos:'foreign'},settings],['cashier',{...scope,companyId:'foreign'},settings],['cashier',scope,{...settings,lifecycleGeneration:'1'}],['cashier',scope,{...settings,serialNumber:'foreign'}]])await assert.rejects(a.$transaction(tx=>releaseFtextRejectedAttempt(tx,original.id,selected,actor,ack,{context:async()=>({settings:current})})));
  assert.deepEqual((await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${original.id}`)[0],before);
  await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'still-held'})));
  const released=await Promise.all([a.$transaction(tx=>releaseFtextRejectedAttempt(tx,original.id,scope,'cashier',ack,{context})),b.$transaction(tx=>releaseFtextRejectedAttempt(tx,original.id,scope,'cashier',ack,{context}))]);
  assert.deepEqual(released[0].checkoutJson.ftextOperatorRelease,released[1].checkoutJson.ftextOperatorRelease);
  for(const row of released){for(const key of ['status','result','resultHash','saleId'])assert.deepEqual(row[key],before[key]);assert.deepEqual(row.checkoutJson.ftextCardDecision,before.checkoutJson.ftextCardDecision);assert.equal(row.checkoutJson.ftextLateError,undefined);assert.equal(row.checkoutJson.ftextVoid,undefined);assert.equal(row.checkoutJson.ftextOperatorRelease.reviewMode,'OPERATOR_VERIFIED_NO_SALE')}
  assert.deepEqual((await a.$transaction(tx=>releaseFtextRejectedAttempt(tx,original.id,scope,'cashier',ack,{context}))).checkoutJson.ftextOperatorRelease,released[0].checkoutJson.ftextOperatorRelease);
  assert.equal(await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings)),null);
  await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,scope,original.id,'admin',{noCardPresented:true,eftposStopped:true,exclusiveRegister:true},{device,settings})));
  const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'new-after-review'}));assert.notEqual(next.id,original.id);assert.equal(next.status,'PREPARED');
  assert.equal((await a.$queryRaw`SELECT COUNT(*)::int AS count FROM "FtextCashRequest"`)[0].count,2);
  // No Sale/Payment/stock/shift tables exist: accidental business writes fail.
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
