import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticReportDeliveryRepository} from '../src/services/automatic-report-delivery-repository.js';
import {createDeliverySlot,claimDelivery,recoverDelivery} from '../src/services/automatic-report-delivery-lifecycle.js';

const NOW='2026-10-22T12:00:00.000Z',later=ms=>new Date(Date.parse(NOW)+ms).toISOString();
const copy=value=>structuredClone(value);
function input(){return {companyId:'synthetic-company',storeId:'selected-store',reportType:'CASH',frequency:'DAILY',periodFrom:'2026-10-20T04:00:00.000Z',periodTo:'2026-10-21T04:00:00.000Z',recipient:'fixture@example.invalid',snapshot:{settingsVersion:1,recipientVersion:2,consentRevision:3,lifecycleGeneration:'4',sourceFingerprint:'a'.repeat(64),payloadFingerprint:'b'.repeat(64),policyFingerprint:'c'.repeat(64),principalId:'synthetic-principal',financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};}
function eligibility(i,now){return {...copy(i),checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};}
function claimed(i=input()){const r=createDeliverySlot(i,{now:NOW,current:eligibility(i,NOW)});return claimDelivery(r,{expectedVersion:r.version,token:'first-token',now:NOW,leaseMs:1000});}
function fixture({initial=claimed(),change,denied=false,gateError,corrupt=false}={}){
 let state=copy(initial),externalCommit,updates=0,gateCalls=0;
 const events=[],scope=initial?{companyId:initial.input.companyId,storeId:initial.input.storeId,slotId:initial.slotId}:null;
 const projection=()=>({slotId:state.slotId,companyId:state.input.companyId,storeId:state.input.storeId,version:corrupt?'999':String(state.version),status:state.status,token:state.token,record:copy(state)});
 const tx={$queryRaw:async(strings,...values)=>{
  const sql=strings.join('?');
  if(sql.startsWith('SELECT')){
   events.push(sql.includes('FOR UPDATE')?'slot-lock':'probe');
   assert.match(sql,/WHERE "companyId"=\? AND "storeId"=\? AND "slotId"=\?/);
   return state&&values[0]===state.input.companyId&&values[1]===state.input.storeId&&values[2]===state.slotId?[projection()]:[];
  }
  if(sql.startsWith('UPDATE')){
   updates++;events.push('persist');
   assert.equal(values[7],BigInt(state.version));assert.equal(values[8],state.status);assert.equal(values[9],state.token);assert.deepEqual(JSON.parse(values[10]),state);
   state=JSON.parse(values[3]);return [projection()];
  }
  throw new Error('Unexpected SQL');
 }};
 const db={$transaction:async fn=>{const before=copy(state);events.push('begin');try{const result=await fn(tx);events.push('commit');return result;}catch(error){state=externalCommit===undefined?before:copy(externalCommit);events.push('rollback');throw error;}}};
 const repo=createAutomaticReportDeliveryRepository({db,readEligibility:async args=>{
  events.push('eligibility');gateCalls++;assert.equal(args.tx,tx);assert.equal(args.companyId,args.input.companyId);assert.equal(args.storeId,args.input.storeId);assert.ok(Object.isFrozen(args.input));
  if(gateError)throw gateError;
  const result=eligibility(args.input,args.now);if(denied)result.consentActive=false;
  if(change){state=copy(change(copy(state)));externalCommit=copy(state);}
  return result;
 }});
 return {repo,scope,events,record:()=>copy(state),updates:()=>updates,gateCalls:()=>gateCalls};
}
const options=(r,now=NOW)=>({expectedVersion:r.version,token:r.token,now});

test('start probes canonical stored input before eligibility and takes slot lock only after eligibility, then commits before return',async()=>{
 const f=fixture(),before=f.record();const result=await f.repo.start(f.scope,options(before));f.events.push('resolved');
 assert.deepEqual(f.events,['begin','probe','eligibility','slot-lock','persist','commit','resolved']);assert.equal(result.status,'ATTEMPTING');assert.equal(result.version,before.version+1);assert.deepEqual(result.input,before.input);assert.equal(f.gateCalls(),1);assert.equal(f.updates(),1);
});
test('absent, foreign or corrupt probe never invokes eligibility or persistence',async()=>{
 const r=claimed();
 for(const kind of ['absent','foreign','corrupt']){
  const f=fixture({initial:kind==='absent'?null:r,corrupt:kind==='corrupt'}),s=kind==='foreign'?{...f.scope,companyId:'foreign'}:f.scope||{companyId:r.input.companyId,storeId:r.input.storeId,slotId:r.slotId};
  await assert.rejects(f.repo.start(s,options(r)),{code:kind==='corrupt'?'DELIVERY_CORRUPT':'DELIVERY_NOT_FOUND'});
  assert.equal(f.gateCalls(),0);assert.equal(f.updates(),0);assert.equal(f.events.includes('slot-lock'),false);
 }
});
test('trusted eligibility failure stops before taking the slot lock and never retries',async()=>{
 const error=new Error('synthetic eligibility refusal'),f=fixture({gateError:error}),before=f.record();
 await assert.rejects(f.repo.start(f.scope,options(before)),e=>e===error);assert.deepEqual(f.events,['begin','probe','eligibility','rollback']);assert.deepEqual(f.record(),before);assert.equal(f.gateCalls(),1);assert.equal(f.updates(),0);
});
test('revoked eligibility cannot persist ATTEMPTING',async()=>{
 const f=fixture({denied:true}),before=f.record();await assert.rejects(f.repo.start(f.scope,options(before)),{code:'DELIVERY_BLOCKED'});assert.deepEqual(f.record(),before);assert.equal(f.updates(),0);assert.equal(f.gateCalls(),1);
});
test('a recovery/reclaim committed between probe and lock preserves the winner and rejects the stale start',async()=>{
 let winner;const f=fixture({change:r=>{const pending=recoverDelivery(r,{expectedVersion:r.version,now:later(1000)});winner=claimDelivery(pending,{expectedVersion:pending.version,token:'replacement-token',now:later(1000),leaseMs:1000});return winner;}}),before=f.record();
 await assert.rejects(f.repo.start(f.scope,options(before,later(1000))),{code:'STALE_VERSION'});assert.deepEqual(f.record(),winner);assert.equal(f.updates(),0);assert.equal(f.gateCalls(),1);
});
test('a canonical replacement snapshot with the same slot/version/token fails immutable recheck before any update',async()=>{
 let replacement;const f=fixture({change:r=>{const changed=copy(r.input);changed.snapshot.payloadFingerprint='d'.repeat(64);replacement=claimed(changed);return replacement;}}),before=f.record();
 await assert.rejects(f.repo.start(f.scope,options(before)),{code:'DELIVERY_CONFLICT'});assert.deepEqual(f.record(),replacement);assert.equal(f.updates(),0);assert.equal(f.gateCalls(),1);
});
test('a row removed after the probe cannot supply a successful start receipt',async()=>{
 const f=fixture({change:()=>null}),before=f.record();await assert.rejects(f.repo.start(f.scope,options(before)),{code:'DELIVERY_NOT_FOUND'});assert.equal(f.record(),null);assert.equal(f.updates(),0);assert.equal(f.gateCalls(),1);
});
