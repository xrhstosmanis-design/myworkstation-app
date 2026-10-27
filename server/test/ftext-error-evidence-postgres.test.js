import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {recordFtextOperatorDecision,releaseFtextRejectedAttempt} from '../src/services/ftext-operator-card.js';
import {pollFtextErrorEvidence,recordFtextErrorEvidence,ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {requestFtextVoid,claimFtextVoid,recordFtextVoidResult} from '../src/services/ftext-void.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native late error evidence is scoped, immutable and concurrent; only separate verified VOID releases pending',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_error_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.href}),b=new PrismaClient({datasourceUrl:url.href});
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},device={id:'device-a',tokenVersion:3},settings={...scope,serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true}};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'original',requestHash:'fixture',checkout:{actorId:'cashier',paymentMethod:'CARD'},items:[{productId:'product-a',name:'FIXTURE',quantity:1,effectiveUnitPrice:0.5,lineTotal:0.5,fiscalDepartment:4,vatRate:13}],summary:{subtotal:0.5,total:0.5}};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await provisionFtextRecoverySchema(a);
  const first=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  const result={requestId:first.id,settingsHash:first.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,result));
  const context=async()=>({device,settings});
  const original=await a.$transaction(tx=>recordFtextOperatorDecision(tx,first.id,scope,'cashier',{outcome:'NO'},{context}));
  const raw=await readFile(new URL('../../tools/windows-ftext/fixtures/eftpos-error-48.res',import.meta.url));
  const proof={requestId:first.id,settingsHash:first.settingsHash,originalResultHash:original.resultHash,commandHash:ftextOriginalCommandHash(original,settings),rawResultBase64:raw.toString('base64')};
  const poll=await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings));assert.equal(poll.id,first.id);assert.equal(poll.kind,'FTEXT_ERROR_RECHECK');
  for(const [d,c,p] of [[{...device,id:'foreign'},settings,proof],[{...device,tokenVersion:4},settings,proof],[device,{...settings,storeId:'foreign'},proof],[device,{...settings,lifecycleGeneration:'1'},proof],[device,settings,{...proof,originalResultHash:'e'.repeat(64)}],[device,settings,{...proof,commandHash:'f'.repeat(64)}]])await assert.rejects(a.$transaction(tx=>recordFtextErrorEvidence(tx,d,c,p)));
  const saved=await Promise.all([a.$transaction(tx=>recordFtextErrorEvidence(tx,device,settings,proof)),b.$transaction(tx=>recordFtextErrorEvidence(tx,device,settings,proof))]);
  assert.equal(saved[0].checkoutJson.ftextLateError.evidenceHash,saved[1].checkoutJson.ftextLateError.evidenceHash);
  for(const row of saved){for(const key of ['status','result','resultHash','saleId'])assert.deepEqual(row[key],original[key]);assert.deepEqual(row.checkoutJson.ftextCardDecision,original.checkoutJson.ftextCardDecision);assert.equal(row.checkoutJson.ftextVoid,undefined)}
  assert.equal(await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings)),null);
  await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'still-blocked'})));
  await assert.rejects(a.$transaction(tx=>recordFtextErrorEvidence(tx,device,settings,{...proof,rawResultBase64:Buffer.from('44\r\nEFT-POS ERROR\r\nPAY||2\r\n').toString('base64')})));
  await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...result,code:48,failedCommand:'PAY||2',rawResultHash:'a'.repeat(64)})));
  const ack={noCardPresented:true,eftposStopped:true,exclusiveRegister:true};
  await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,scope,first.id,'admin',{...ack,noCardPresented:false},{device,settings})));
  const job=await a.$transaction(tx=>requestFtextVoid(tx,scope,first.id,'admin',ack,{device,settings}));assert.equal(job.checkoutJson.ftextVoid.originalResultHash,original.resultHash);
  const claims=await Promise.all([a.$transaction(tx=>claimFtextVoid(tx,device,settings)),b.$transaction(tx=>claimFtextVoid(tx,device,settings))]);assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(Boolean);
  assert.equal(claim.originalRawResultHash,'022ddb6a253c87c3c0b15036bf9ab312b9af222a58eede98a94530b1ca57fc53');
  const finished=await a.$transaction(tx=>recordFtextVoidResult(tx,device,settings,{requestId:claim.id,originalRequestId:first.id,settingsHash:first.settingsHash,outcome:'VOID_CONFIRMED',code:0,serialNumber:settings.serialNumber,dayId:'1',dayCounter:'27',deviceTime:'fixture',rawResultHash:'d'.repeat(64)}));
  assert.deepEqual(finished.result,original.result);assert.equal(finished.resultHash,original.resultHash);assert.equal(finished.saleId,null);assert.deepEqual(finished.checkoutJson.ftextLateError,saved[0].checkoutJson.ftextLateError);
  assert.equal((await a.$transaction(tx=>recordFtextErrorEvidence(tx,device,settings,proof))).checkoutJson.ftextVoid.status,'CONFIRMED');
  const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'next'}));assert.notEqual(next.id,first.id);
  await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{requestId:next.id,settingsHash:next.settingsHash,outcome:'REQUIRES_CHECK',code:48,failedCommand:'PAY||2',rawResultHash:'a'.repeat(64)}));
  const rejected=await a.$transaction(tx=>recordFtextOperatorDecision(tx,next.id,scope,'cashier',{outcome:'NO'},{context}));
  await assert.rejects(a.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'other',{registerReady:true})));
  const released=await Promise.all([a.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'cashier',{registerReady:true})),b.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'cashier',{registerReady:true}))]);
  assert.deepEqual(released[0].checkoutJson.ftextOperatorRelease,released[1].checkoutJson.ftextOperatorRelease);
  assert.deepEqual(released[0].result,rejected.result);assert.equal(released[0].saleId,null);
  await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,scope,next.id,'admin',ack,{device,settings})));
  const afterRelease=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'after-release'}));assert.notEqual(afterRelease.id,next.id);
  // Only the reviewed request table exists: any financial/stock/shift mutation fails.
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
