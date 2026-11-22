import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult} from '../src/services/ftext-cash-requests.js';
import {recordFtextOperatorDecision,releaseFtextRejectedAttempt} from '../src/services/ftext-operator-card.js';
import {pollFtextErrorEvidence,recordFtextErrorEvidence,ftextOriginalCommandHash} from '../src/services/ftext-error-evidence.js';
import {requestFtextVoid,claimFtextVoid,recordFtextVoidResult} from '../src/services/ftext-void.js';
// Historical unreleased NO fixtures preserve pre-upgrade evidence/VOID coverage.
async function historicalNo(tx,id,scope,actorId){
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id}`)[0];
 const decision={outcome:'NO',actorId,resultHash:row.resultHash,settingsHash:row.settingsHash,at:new Date().toISOString()};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextCardDecision:decision,ftextCardDecisionHistory:[decision]})}::jsonb WHERE "id"=${id} RETURNING *`)[0];
}
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
  const original=await a.$transaction(tx=>historicalNo(tx,first.id,scope,'cashier'));
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
  const rejected=await a.$transaction(tx=>historicalNo(tx,next.id,scope,'cashier'));
  await assert.rejects(a.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'other',{registerReady:true})));
  const released=await Promise.all([a.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'cashier',{registerReady:true})),b.$transaction(tx=>releaseFtextRejectedAttempt(tx,next.id,scope,'cashier',{registerReady:true}))]);
  assert.deepEqual(released[0].checkoutJson.ftextOperatorRelease,released[1].checkoutJson.ftextOperatorRelease);
  assert.deepEqual(released[0].result,rejected.result);assert.equal(released[0].saleId,null);
  await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,scope,next.id,'admin',ack,{device,settings})));
  const afterRelease=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'after-release'}));assert.notEqual(afterRelease.id,next.id);
  // Earlier released direct errors must not starve a later unknown NO report.
  // Use the real request/decision/release services and actual PostgreSQL ordering.
  await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{requestId:afterRelease.id,settingsHash:afterRelease.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'}));
  const current=await a.$transaction(tx=>historicalNo(tx,afterRelease.id,scope,'cashier'));
  const before=await a.$queryRaw`SELECT * FROM "FtextCashRequest" ORDER BY "createdAt", "id"`;
  assert.equal(before.length,3);
  const eligible=await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings));
  assert.equal(eligible.id,current.id);assert.equal(eligible.kind,'FTEXT_ERROR_RECHECK');
  assert.equal(eligible.originalResultHash,current.resultHash);
  for(const [d,s] of [[{...device,id:'foreign'},settings],[{...device,tokenVersion:4},settings],[device,{...settings,storeId:'foreign'}],[device,{...settings,terminalPos:'foreign'}],[device,{...settings,companyId:'foreign'}],[device,{...settings,lifecycleGeneration:'1'}]])assert.equal(await a.$transaction(tx=>pollFtextErrorEvidence(tx,d,s)),null);
  assert.deepEqual(await a.$queryRaw`SELECT * FROM "FtextCashRequest" ORDER BY "createdAt", "id"`,before);
  const currentProof={requestId:current.id,settingsHash:current.settingsHash,originalResultHash:current.resultHash,commandHash:ftextOriginalCommandHash(current,settings),rawResultBase64:raw.toString('base64')};
  const appended=await a.$transaction(tx=>recordFtextErrorEvidence(tx,device,settings,currentProof));
  for(const key of ['status','result','resultHash','saleId'])assert.deepEqual(appended[key],current[key]);
  assert.deepEqual(appended.checkoutJson.ftextCardDecision,current.checkoutJson.ftextCardDecision);
  assert.equal(await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings)),null);
  assert.deepEqual((await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${next.id}`)[0],before.find(row=>row.id===next.id));
  await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'pending-after-evidence'})));
  // Only the reviewed request table exists: any financial/stock/shift mutation fails.
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});

test('native operator NO atomically releases once with no second confirmation or invented physical attestation',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_review_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.href}),b=new PrismaClient({datasourceUrl:url.href});
 const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'},device={id:'device-a',tokenVersion:3},settings={...scope,serialNumber:'TEST12345',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:1,resultFormat:'OPERATOR_CONFIRMATION',confirmed:true}};
 const input={settings,scope,sessionId:'shift-a',clientTransactionId:'review-original',requestHash:'fixture',checkout:{actorId:'cashier',paymentMethod:'CARD'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:0.5,lineTotal:0.5,fiscalDepartment:4,vatRate:13}],summary:{subtotal:0.5,total:0.5}},context=async()=>({device,settings}),ack={registerReady:true,noReceiptIssued:true,noChargeApproved:true};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await provisionFtextRecoverySchema(a);
  const original=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{requestId:original.id,settingsHash:original.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'}));
  const before=(await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${original.id}`)[0];
  for(const [actor,selected,current] of [['foreign',scope,settings],['cashier',{...scope,storeId:'foreign'},settings],['cashier',{...scope,terminalPos:'foreign'},settings],['cashier',{...scope,companyId:'foreign'},settings],['cashier',scope,{...settings,lifecycleGeneration:'1'}],['cashier',scope,{...settings,serialNumber:'foreign'}]])await assert.rejects(a.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,selected,actor,{outcome:'NO'},{context:async()=>({settings:current})})));
  let lookups=0;
  await assert.rejects(a.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,scope,'cashier',{outcome:'NO'},{context:async()=>{if(++lookups===2)throw Error('fresh context unavailable');return {settings}}})));
  assert.deepEqual((await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${original.id}`)[0],before,'NO and release must roll back together');
  const released=await Promise.all([a.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,scope,'cashier',{outcome:'NO'},{context})),b.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,scope,'cashier',{outcome:'NO'},{context}))]);
  assert.deepEqual(released[0].checkoutJson.ftextOperatorRelease,released[1].checkoutJson.ftextOperatorRelease);
  assert.deepEqual(released[0].checkoutJson.ftextCardDecision,released[1].checkoutJson.ftextCardDecision);
  for(const row of released){for(const key of ['status','result','resultHash','saleId'])assert.deepEqual(row[key],before[key]);assert.equal(row.checkoutJson.ftextCardDecision.outcome,'NO');assert.equal(row.checkoutJson.ftextCardDecisionHistory.length,1);assert.equal(row.checkoutJson.ftextOperatorRelease.reviewMode,'OPERATOR_NO');assert.equal(row.checkoutJson.ftextOperatorRelease.readinessVerified,false);assert.equal(row.checkoutJson.ftextOperatorRelease.noReceiptIssued,undefined);assert.equal(row.checkoutJson.ftextOperatorRelease.noChargeApproved,undefined)}
  assert.deepEqual((await a.$transaction(tx=>recordFtextOperatorDecision(tx,original.id,scope,'cashier',{outcome:'NO'},{context}))).checkoutJson.ftextOperatorRelease,released[0].checkoutJson.ftextOperatorRelease);
  assert.equal(await a.$transaction(tx=>pollFtextErrorEvidence(tx,device,settings)),null);
  await assert.rejects(a.$transaction(tx=>requestFtextVoid(tx,scope,original.id,'admin',{noCardPresented:true,eftposStopped:true,exclusiveRegister:true},{device,settings})));
  const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'new-after-review'}));assert.notEqual(next.id,original.id);assert.equal(next.status,'PREPARED');
  assert.equal((await a.$queryRaw`SELECT COUNT(*)::int AS count FROM "FtextCashRequest"`)[0].count,2);
  // No Sale/Payment/stock/shift tables exist: accidental business writes fail.
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
