import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssistantHistory} from '../../client/src/components/voice/assistant-history-view.js';
const token=claims=>'fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture';
const claims=()=>({id:'admin',role:'SUPER_ADMIN',isSuperAdmin:true,platformRole:'SUPER_ADMIN',tokenType:'BACKOFFICE_USER',companyId:'c',sessionId:'session',sessionVersion:1,exp:Math.floor(Date.now()/1000)+3600});
const storage=initial=>{const m=new Map(Object.entries(initial));return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const path='/api/platform/ai-command-center/history?companyId=c&storeId=s';
test('history GET uses the existing matching central credential and never the support token/browser override',async()=>{
 const c=claims(),central=token(c),support=token({...c,supportContext:{companyId:'store-company',storeId:'store',destination:'BACKOFFICE'}}),local=storage({token:support}),sessions=storage({platformToken:central});let captured;
 const out=await requestAssistantHistory(async(p,o)=>{captured={p,o};return {archive:'fixture'}},path,{headers:{Authorization:'FORGED'}},{mode:'platform',storage:local,sessions});
 assert.deepEqual(out,{archive:'fixture'});assert.equal(captured.p,path);assert.equal(captured.o.headers.Authorization,'Bearer '+central);assert.equal(local.getItem('token'),support);
});
test('history transport refuses other paths/methods and missing/mismatched native context before HTTP',async()=>{
 const c=claims(),local=storage({token:token(c)}),sessions=storage({});let calls=0;const api=async()=>{calls++};
 for(const [p,o] of [['https://foreign.invalid'+path,{}],['/api/platform/ai-command-center/ask',{}],[path,{method:'POST'}],[path+'#hidden',{}]])await assert.rejects(requestAssistantHistory(api,p,o,{mode:'platform',storage:local,sessions}));assert.equal(calls,0);
 local.setItem('token',token({...c,supportContext:{companyId:'c',storeId:'s'}}));sessions.setItem('platformToken',token({...c,sessionId:'other'}));await assert.rejects(requestAssistantHistory(api,path,{}, {mode:'platform',storage:local,sessions}));assert.equal(calls,0);
});
test('history from an old client session is withdrawn on success or error without waiting for a watcher tick',async()=>{
 for(const error of [false,true]){const c=claims(),local=storage({token:token(c)}),sessions=storage({});await assert.rejects(requestAssistantHistory(async()=>{local.setItem('token',token({...c,sessionVersion:2}));if(error)throw new Error('private previous failure');return {private:'OLD PRIVATE HISTORY'}},path,{}, {mode:'platform',storage:local,sessions}),e=>e.code==='ASSISTANT_HISTORY_CLIENT_CONTEXT_CHANGED')}
 const local=storage({token:'owner-session'}),sessions=storage({});await assert.rejects(requestAssistantHistory(async()=>{local.setItem('token','other-owner-session');return {private:'OLD OWNER HISTORY'}},'/api/owner-assistant/stores/s/history',{}, {mode:'owner',storage:local,sessions}),e=>e.code==='ASSISTANT_HISTORY_CLIENT_CONTEXT_CHANGED');
});
