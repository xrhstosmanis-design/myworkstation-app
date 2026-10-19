import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createAssistantHistoryHttp} from '../src/services/assistant-history-http.js';
import {emptyHistoryArchive} from '../src/services/assistant-history-contract.js';
test('real HTTP history transport accepts only purpose-bound load/reset, sanitizes storage failures and propagates access denial',async()=>{
 let failure=null;const resets=[],turns={load:async()=>{if(failure)throw failure;return {revision:1,archive:emptyHistoryArchive(),historical:true,expired:false}},reset:async(req,input)=>{resets.push(input);return {revision:2,archive:emptyHistoryArchive(),historical:true}}};
 const app=express();app.use(express.json());const handlers=createAssistantHistoryHttp({turns,mode:'platform'});app.get('/history',handlers.load);app.post('/history/reset',handlers.reset);app.use((e,req,res,next)=>res.status(e.status||(e.name==='ZodError'?400:500)).json({error:'Rejected',code:e.code||'INVALID'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(base+'/history?companyId=c&storeId=s');assert.equal(response.status,200);assert.equal((await response.json()).retentionDays,30);
  assert.equal((await fetch(base+'/history?companyId=c')).status,400);assert.equal((await fetch(base+'/history?companyId=c&storeId=s&readScope=all_stores')).status,400);
  const body={generation:'2',requestId:randomUUID(),expectedRevision:1,selection:{companyId:'c',storeId:'s'}};
  const reset=await fetch(base+'/history/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(reset.status,200);assert.deepEqual(resets,[{generation:'2',requestId:body.requestId,expectedRevision:1}]);
  assert.equal((await fetch(base+'/history/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,archive:{answer:'FORGED'}})})).status,400);assert.equal(resets.length,1);
  for(const status of [401,403]){failure=Object.assign(new Error('denied'),{status,code:'NATIVE_DENIED'});assert.equal((await fetch(base+'/history?companyId=c&storeId=s')).status,status)}
  failure=Object.assign(new Error('PRIVATE DATABASE SQL'),{code:'P2010',meta:{code:'42P01'}});const missing=await fetch(base+'/history?companyId=c&storeId=s');assert.equal(missing.status,503);const unavailable=await missing.json();assert.equal(unavailable.available,false);assert.equal(unavailable.code,'ASSISTANT_HISTORY_UNAVAILABLE');assert.ok(!JSON.stringify(unavailable).includes('PRIVATE'));
  failure=Object.assign(new Error('maintenance'),{status:409,code:'STORE_LIFECYCLE_MAINTENANCE'});assert.equal((await fetch(base+'/history?companyId=c&storeId=s')).status,409);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
