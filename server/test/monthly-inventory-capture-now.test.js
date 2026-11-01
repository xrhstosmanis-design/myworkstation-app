import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createMonthlyInventoryCaptureRouter} from '../src/routes/monthly-inventory-capture.js';
import {monthlyCaptureLatestDuePeriod,requireMonthlyPersonalCaptureNowContext,finishMonthlyPersonalCaptureNowInTransaction,normalizeMonthlyPersonalCaptureNowActor,normalizeMonthlyPersonalCaptureNowInput} from '../src/services/monthly-inventory-capture-authorization.js';
import {monthlyPersonalCaptureNowReceipt} from '../src/services/monthly-inventory-capture-now.js';
import {buildMonthlyInventorySnapshotCandidate,serializeMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';

test('current due period follows actual Athens07 boundary, January rollover and DST without caller period authority',()=>{
 for(const[now,month]of [['2026-11-01T04:59:59.999Z','2026-09'],['2026-11-01T05:00:00.000Z','2026-10'],['2026-01-01T04:59:59.999Z','2025-11'],['2026-01-01T05:00:00.000Z','2025-12'],['2026-04-01T03:59:59.999Z','2026-02'],['2026-04-01T04:00:00.000Z','2026-03']])assert.equal(monthlyCaptureLatestDuePeriod(now).issueMonth,month);
 assert.throws(()=>monthlyCaptureLatestDuePeriod('2026-11-01'),{code:'MONTHLY_CAPTURE_CLOCK_INVALID'});
});

test('bounded receipt preserves format-only honesty, exact microseconds and LATE current observation without raw rows',()=>{
 const candidate=buildMonthlyInventorySnapshotCandidate({companyId:'c',storeId:'s',lifecycleGeneration:'0',issueMonth:'2026-10',sourceObservedAt:'2026-11-01T14:00:00.000Z',sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0},products:[],invoices:{period:'2026-10',items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
 const receipt={receiptBasis:'FORMAT_VALIDATED_STORED_ONLY',sourceAuthenticityVerified:false,id:'id',companyId:'c',storeId:'s',lifecycleGeneration:'0',issueMonth:'2026-10',scheduledFor:candidate.period.scheduledFor,sourceObservedAt:candidate.period.sourceObservedAt,storedAt:'2026-11-01T14:00:01.123456Z',sourceHash:candidate.sourceHash,payloadHash:candidate.payloadHash,storedBytesSha256:'b'.repeat(64),candidateJsonText:serializeMonthlyInventorySnapshotCandidate(candidate)};
 const dto=monthlyPersonalCaptureNowReceipt(receipt);assert.equal(dto.observationStatus,'LATE');assert.equal(dto.delayMs,'32400000');assert.equal(dto.storedAt,receipt.storedAt);assert.equal(dto.sourceAuthenticityVerified,false);assert.equal(Object.keys(dto).length,16);assert.equal(Object.hasOwn(dto,'candidateJsonText'),false);assert.equal(Object.hasOwn(dto,'products'),false);assert.throws(()=>monthlyPersonalCaptureNowReceipt({...receipt,sourceAuthenticityVerified:true}));assert.throws(()=>monthlyPersonalCaptureNowReceipt({...receipt,storeId:'foreign'}));
});

test('empty/cloned/foreign personal contexts cannot authorize a source or writer or reach SQL',async()=>{
 let touched=0;const tx={$queryRawUnsafe:async()=>{touched++;throw Error('must not run')}};
 for(const stage of ['SOURCE','WRITE','LOOKUP'])assert.throws(()=>requireMonthlyPersonalCaptureNowContext(tx,Object.freeze({}),stage),{code:'MONTHLY_CAPTURE_CONTEXT_INVALID'});
 await assert.rejects(finishMonthlyPersonalCaptureNowInTransaction(tx,{}),{code:'MONTHLY_CAPTURE_CONTEXT_INVALID'});assert.equal(touched,0);
});

test('strict personal identity and period confirmation detach before awaits without reading private getters',()=>{
 const actor={id:'owner',companyId:'c',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:0},input={storeId:'s',lifecycleGeneration:'0',expectedIssueMonth:'2026-10'};let reads=0;
 Object.defineProperty(actor,'privateToken',{get(){reads++;throw Error('private')}});
 const principal=normalizeMonthlyPersonalCaptureNowActor(actor),selected=normalizeMonthlyPersonalCaptureNowInput(input,true);actor.id='foreign';input.storeId='foreign';assert.equal(principal.id,'owner');assert.equal(selected.storeId,'s');assert.equal(reads,0);assert.ok(Object.isFrozen(principal));assert.ok(Object.isFrozen(selected));
 for(const value of [{storeId:'s'},{...selected,expectedIssueMonth:{toString(){throw Error('coercion')}}},{...selected,expectedIssueMonth:'2026-10\n'}])assert.throws(()=>normalizeMonthlyPersonalCaptureNowInput(value,true),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
});

test('mounted capture-now adapter forwards genuine middleware actor and rejects arbitrary authorities before service',async()=>{
 const actor={id:'owner',companyId:'c',role:'OWNER'},calls=[],now={preview:async(a,v)=>{calls.push({a,v});return {status:'PREVIEW'}},capture:async(a,v)=>{calls.push({a,v});return{status:'STORED'}}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=actor;next()});app.use('/api/monthly-inventory-capture',createMonthlyInventoryCaptureRouter(null,{manager:{},personalNow:now}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base='http://127.0.0.1:'+server.address().port+'/api/monthly-inventory-capture/capture-now';
 const request=async(path='',body)=>fetch(base+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 try{
  assert.equal((await request('?storeId=s')).status,200);assert.equal(calls[0].a,actor);assert.deepEqual(calls[0].v,{storeId:'s'});
  const input={storeId:'s',lifecycleGeneration:'0',expectedIssueMonth:'2026-10'};const result=await request('',input);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(calls[1].a,actor);assert.deepEqual(calls[1].v,input);
  for(const extra of [{month:'2026-09'},{now:'2026-11-01T05:00:00.000Z'},{actor},{companyId:'foreign'},{candidateJsonText:'private'},{grantId:'g'}])assert.equal((await request('',{...input,...extra})).status,400);
  for(const body of [{...input,lifecycleGeneration:0},{...input,expectedIssueMonth:'2026-10\n'},{storeId:'s',lifecycleGeneration:'0'}])assert.equal((await request('',body)).status,400);
  assert.equal((await request('?storeId=s&storeId=other')).status,400);assert.equal((await request('?companyId=c&storeId=s')).status,400);assert.equal(calls.length,2);
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}
});
