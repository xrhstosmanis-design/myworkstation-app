import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
const scope={companyId:'c',companyName:'Fixture',storeId:'s',storeName:'Store',supportPreview:false};
const metadata=()=>({generation:'0',threadId:randomUUID(),requestId:randomUUID(),expectedRevision:3});
const req=()=>({user:{id:'u',role:'OWNER'},params:{storeId:'s'},body:{question:'Ποια διαφορά είχε το ταμείο;',history:[{role:'user',content:'FORGED CLIENT CONTEXT'}],conversation:metadata()}});
const response=()=>({response:{ok:true},raw:{output_text:JSON.stringify({answer:'Checked server answer',highlights:[],limitations:''})}});
async function invoke({beginFailure=null,revokeAfterSave=false,extra={}}={}){
 let providers=0,reads=0,captured=null,error,out,allowed=true;
 const request=req();request.body.conversation={...request.body.conversation,...extra};
 const historyTurns={
  begin:async(r,m,q)=>{
   assert.equal(m.expectedRevision,3);assert.equal(q,request.body.question);
   if(beginFailure)throw beginFailure;
   return {
    history:[{role:'user',content:'SERVER-SAVED CONTEXT'}],
    finish:async(result,actualReads)=>{
     captured={result,actualReads};if(revokeAfterSave)allowed=false;
     return {saved:true,revision:4,expiresAt:'2026-11-18T12:00:00Z'};
    }
   };
  }
 };
 const handlers=createOwnerAssistantHandlers({
  historyTurns,
  authorize:async()=>{if(!allowed)throw Object.assign(new Error('revoked'),{status:403});return scope},
  requestProvider:async settings=>{
   providers++;
   if(providers===1){
    assert.match(JSON.stringify(settings),/SERVER-SAVED CONTEXT/);
    assert.doesNotMatch(JSON.stringify(settings),/FORGED CLIENT CONTEXT/);
    return {response:{ok:true},raw:{output:[{type:'function_call',name:'cash_details',call_id:'read',arguments:'{"date":"2026-10-10"}'}]}};
   }
   return response();
  },
  readCash:async()=>{reads++;return {...scope,scope:'OWNER_SELECTED_STORE',rows:[]}}
 });
 await handlers.ask(request,{status(){return this},json:v=>out=v},e=>error=e);
 return {providers,reads,captured,error,out};
}
test('actual Owner ask replaces browser dialogue with fresh server history and captures only checked final answer plus original read log',async()=>{
 const r=await invoke();assert.equal(r.error,undefined);assert.equal(r.providers,2);assert.equal(r.reads,1);assert.equal(r.out.historyReceipt.saved,true);assert.equal(r.out.historyReceipt.revision,4);assert.equal(r.captured.result.answer,'Checked server answer');assert.deepEqual(r.captured.actualReads,[{name:'cash_details',args:{date:'2026-10-10'}}]);
});
test('history conflict/forged metadata stop before provider and source, without automatic repeat',async()=>{
 const r=await invoke({beginFailure:Object.assign(new Error('conflict'),{status:409,code:'ASSISTANT_HISTORY_CONFLICT'})});assert.equal(r.error.status,409);assert.equal(r.providers,0);assert.equal(r.reads,0);assert.equal(r.out,undefined);
 const forged=await invoke({extra:{answer:'FORGED'}});assert.equal(forged.error.name,'ZodError');assert.equal(forged.providers,0);assert.equal(forged.reads,0);
});
test('native report authorization lost during persistence withholds final private answer without repeating provider/source',async()=>{
 const r=await invoke({revokeAfterSave:true});assert.equal(r.error.status,403);assert.equal(r.out,undefined);assert.equal(r.providers,2);assert.equal(r.reads,1);
});
