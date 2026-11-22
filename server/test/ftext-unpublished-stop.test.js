import test from 'node:test';
import assert from 'node:assert/strict';
import {stopFixture} from './helpers/ftext-stop-fixture.mjs';
import {stopFtextBeforeExecution,acceptFtextHandoff,assertFtextHandoffResult,ftextPreExecutionStopPhase} from '../src/services/ftext-handoff.js';
import {ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
const input={stopBeforeExecution:true};
const stop=(f,actor='cashier',scope=f.scope,body=input)=>stopFtextBeforeExecution(f.tx,f.row.id,scope,actor,body,{context:f.context});
for(const [method,format] of [['CASH','OPERATOR_CONFIRMATION'],['CARD','OPERATOR_CONFIRMATION'],['CARD','POS_LINE8_OS7']])for(const phase of ['PREPARED','OFFERED'])test(`${method}/${format}/${phase}: original stop preserves evidence and replay, never grants execution`,async()=>{
 const f=stopFixture({method,format,phase}),before=structuredClone(f.row);
 assert.equal(ftextPreExecutionStopPhase(f.row),phase);assert.equal(ftextCashRequestView(f.row).canStopBeforeExecution,true);
 const result=await stop(f);assert.equal(ftextCashRequestView(result).operatorReleaseMode,'RELEASED');assert.equal(ftextCashRequestView(result).canStopBeforeExecution,false);
 for(const k of ['id','status','result','resultHash','saleId','plan','dispatchedAt','claimedByDeviceId','claimedTokenVersion'])assert.deepEqual(result[k],before[k]);
 assert.equal(result.checkoutJson.ftextOperatorRelease.readinessVerified,false);assert.equal(f.writes,1);
 assert.deepEqual(await stop(f),result);assert.equal(f.writes,1);
 await assert.rejects(stop(f,'foreign'));assert.equal(f.writes,1);
 if(phase==='OFFERED'){
  const ack=await acceptFtextHandoff(f.tx,f.device,f.settings,f.handoffInput());assert.equal(ack.state,'STOPPED');assert.equal(ack.authorization,null);assert.equal(ack.requiresReadiness,false);assert.equal(ack.allowResend,false);
  assert.deepEqual(await acceptFtextHandoff(f.tx,f.device,f.settings,{...f.handoffInput(),readyForExecution:false}),ack);assert.equal(f.writes,1);
  assert.throws(()=>assertFtextHandoffResult(f.row,f.device,f.settings));
 }
});
test('accepted authorization wins; stop refuses without changing it',async()=>{
 const f=stopFixture({phase:'OFFERED'});const ack=await acceptFtextHandoff(f.tx,f.device,f.settings,f.handoffInput()),before=structuredClone(f.row);
 assert.ok(ack.authorization.acceptedAt);assert.equal(ftextCashRequestView(f.row).canStopBeforeExecution,false);
 await assert.rejects(stop(f));assert.deepEqual(f.row,before);assert.equal(f.writes,1);assert.doesNotThrow(()=>assertFtextHandoffResult(f.row,f.device,f.settings));
});
test('old/foreign/final/altered/partly claimed work cannot be stopped or produce a terminal ack',async()=>{
 for(const mutate of [f=>{f.row.plan.planHash='invalid'},f=>{delete f.row.checkoutJson.ftextHandoff},f=>{delete f.row.checkoutJson.ftextHandoff.stopVersion},f=>{f.row.checkoutJson.ftextHandoff.acceptedAt=new Date().toISOString()},f=>{f.row.result={outcome:'CONFIRMED'}},f=>{f.row.resultHash='a'.repeat(64)},f=>{f.row.saleId='sale'},f=>{f.row.checkoutJson.ftextVoid=null},f=>{f.row.checkoutJson.ftextLateCashReceipt={}},f=>{f.row.checkoutJson.ftextCardDecision={outcome:'NO'}},f=>{f.row.claimedTokenVersion++},f=>{f.row.claimedByDeviceId='foreign'},f=>{f.device.tokenVersion++},f=>{f.device.status='REVOKED'},f=>{f.settings.lifecycleGeneration='1'},f=>{f.settings.serialNumber='FOREIGN'},f=>{f.row.plan.lines[0].description='ALTERED'}]){
  const f=stopFixture({phase:'OFFERED'});mutate(f);const before=structuredClone(f.row);await assert.rejects(stop(f));assert.equal(f.writes,0);assert.deepEqual(f.row,before);
 }
 for(const body of [{},{stopBeforeExecution:false},{stopBeforeExecution:true,outcome:'NO'}]){const f=stopFixture();await assert.rejects(stop(f,'cashier',f.scope,body));assert.equal(f.writes,0);}
 for(const patch of [{claimedByDeviceId:'foreign'},{claimedTokenVersion:2},{dispatchedAt:new Date()},{status:'DISPATCHED'}]){const f=stopFixture();Object.assign(f.row,patch);await assert.rejects(stop(f));assert.equal(f.writes,0);}
 const f=stopFixture();await assert.rejects(stop(f,'foreign'));await assert.rejects(stop(f,'cashier',{...f.scope,storeId:'foreign'}));assert.equal(f.writes,0);
});
test('terminal stop proof is immutable and bound to the original request/settings/device/plan',async()=>{
 for(const mutate of [f=>{f.row.checkoutJson.ftextPreExecutionStop.proofHash='a'.repeat(64)},f=>{f.row.checkoutJson.ftextPreExecutionStop.at='changed'},f=>{f.row.checkoutJson.ftextPreExecutionStop.phase='ACCEPTED'},f=>{f.row.plan.planHash='b'.repeat(64)},f=>{f.row.checkoutJson.ftextOperatorRelease.stopProofHash='c'.repeat(64)},f=>{f.device.id='foreign'},f=>{f.device.tokenVersion++}]){
  const f=stopFixture({phase:'OFFERED'});await stop(f);mutate(f);const before=structuredClone(f.row);await assert.rejects(stop(f));await assert.rejects(acceptFtextHandoff(f.tx,f.device,f.settings,f.handoffInput()));assert.deepEqual(f.row,before);assert.equal(f.writes,1);
 }
});
