import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createMonthlyInventoryCaptureRouter} from '../src/routes/monthly-inventory-capture.js';
import {authorizeMonthlyCaptureGrantManagementInTransaction} from '../src/services/monthly-inventory-capture-authorization.js';

const purpose='MONTHLY_INVENTORY_CAPTURE',actor=Object.freeze({id:'owner',companyId:'authenticated-company',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'real-session',sessionVersion:0});
async function mounted(run){
 const calls=[],manager=Object.fromEntries(['read','createInactive','enable','revoke'].map(action=>[action,async(user,input)=>{calls.push({action,user,input});return action==='read'?{status:'READ',...input,lifecycleGeneration:'0',purpose,grant:null}:{status:action==='createInactive'?'ALREADY_EXISTS':action==='enable'?'ALREADY_ENABLED':'ALREADY_REVOKED',grant:{id:'g',...input,active:action!=='revoke'}}}]));
 let failure;const service=new Proxy(manager,{get(target,key){return async(...args)=>{if(failure)throw failure;return target[key](...args)}}});
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=actor;next()});app.use('/api/monthly-inventory-capture',createMonthlyInventoryCaptureRouter(null,{manager:service}));app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:'Isolated invalid request'}));
 const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value))});const origin='http://127.0.0.1:'+server.address().port;
 const request=async(path='',{method='GET',body,headers={}}={})=>{const response=await fetch(origin+'/api/monthly-inventory-capture'+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return{status:response.status,headers:response.headers,data}};
 try{await run({request,calls,manager,setFailure:error=>{failure=error},origin})}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})}
}

test('registered HTTP adapter forwards the exact actor and manager DTOs with authenticated company only',async()=>mounted(async({request,calls})=>{
 const read=await request('?storeId=selected',{headers:{'x-company-id':'foreign-company'}});assert.equal(read.status,200);assert.deepEqual(read.data,{status:'READ',companyId:actor.companyId,storeId:'selected',lifecycleGeneration:'0',purpose,grant:null});
 const inputs=[['/create-inactive',{storeId:'selected',lifecycleGeneration:'0'},'createInactive','ALREADY_EXISTS'],['/enable',{storeId:'selected',lifecycleGeneration:'0',grantId:'g',expectedRevision:'3',purpose},'enable','ALREADY_ENABLED'],['/revoke',{storeId:'selected',lifecycleGeneration:'0',grantId:'g',expectedRevision:'4'},'revoke','ALREADY_REVOKED']];
 for(const[path,body,action,status]of inputs){const response=await request(path,{method:'POST',body});assert.equal(response.status,200);assert.equal(response.data.status,status);assert.deepEqual(Object.keys(response.data).sort(),['grant','status']);const call=calls.at(-1);assert.equal(call.action,action);assert.equal(call.user,actor);assert.deepEqual(call.input,{companyId:actor.companyId,...body});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(Object.hasOwn(body,'companyId'),false)}
 assert.equal(calls[0].user,actor);assert.equal(read.headers.get('cache-control'),'no-store');
}));

test('query/body/action whitelist rejects caller authorities, duplicates, wrong strings and extra input before manager',async()=>mounted(async({request,calls})=>{
 for(const query of ['','?storeId=','?storeId=a&storeId=b','?storeId[]=a','?storeId=a&companyId=foreign','?storeId=a&actor=x','?storeId=%20a','?storeId=a&now=2026-01-01'])assert.notEqual((await request(query)).status,200,query);
 const base={storeId:'selected',lifecycleGeneration:'0'},enable={...base,grantId:'g',expectedRevision:'1',purpose};
 for(const body of [null,[],{}, {...base,companyId:'foreign'},{...base,lifecycleGeneration:0},{...base,lifecycleGeneration:'01'},{...base,lifecycleGeneration:'9223372036854775808'},{...base,storeId:['selected']},{...base,firstScheduledFor:'caller'},{...base,actor},{...base,control:{enabled:true}}])assert.equal((await request('/create-inactive',{method:'POST',body})).status,400);
 for(const body of [{...enable,purpose:'CASH_CONTROL'},{...enable,expectedRevision:1},{...enable,expectedRevision:'0'},{...enable,sessionId:'caller'},{...enable,sourceRevision:'a'.repeat(40)},{...enable,activationId:'caller'}])assert.equal((await request('/enable',{method:'POST',body})).status,400);
 assert.equal((await request('/revoke',{method:'POST',body:{...enable}})).status,400,'revoke cannot accept a purpose/status switch');
 assert.equal((await request('/create-inactive?storeId=selected',{method:'POST',body:base})).status,400);
 for(const[path,method]of[['/capture','POST'],['/enable','PUT'],['/','POST']])assert.equal((await request(path,{method,body:base})).status,404);
 assert.equal(calls.length,0);
}));

test('even an explicitly empty transported GET body is refused without manager access',async()=>mounted(async({origin,calls})=>{
 const result=await new Promise((resolve,reject)=>{const req=http.request(origin+'/api/monthly-inventory-capture?storeId=selected',{method:'GET',headers:{'Content-Type':'application/json','Content-Length':'2'}},res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(body)}))});req.on('error',reject);req.end('{}')});
 assert.equal(result.status,400);assert.equal(result.data.code,'MONTHLY_CAPTURE_HTTP_INPUT_INVALID');assert.equal(result.headers['cache-control'],'no-store');assert.equal(calls.length,0);
}));

test('typed schema/enrollment/stale refusals stay failures; unexpected database details never escape or become empty grants',async()=>mounted(async({request,calls,setFailure})=>{
 for(const code of ['MONTHLY_CAPTURE_SCHEMA_UNAVAILABLE','MONTHLY_CAPTURE_SCHEMA_CHANGED','MONTHLY_CAPTURE_ENROLLMENT_REQUIRED','MONTHLY_CAPTURE_GRANT_REVISION_STALE']){setFailure(Object.assign(Error('PRIVATE SQL AND SECRET'),{status:409,code}));const result=await request('?storeId=selected');assert.equal(result.status,409);assert.equal(result.data.code,code);assert.equal(Object.hasOwn(result.data,'grant'),false);assert.doesNotMatch(JSON.stringify(result.data),/PRIVATE|SQL|SECRET/);assert.equal(result.headers.get('cache-control'),'no-store')}
 setFailure(Object.assign(Error('PRIVATE table SQL URL token'),{code:'P2010',status:500}));const unknown=await request('?storeId=selected');assert.equal(unknown.status,503);assert.deepEqual(Object.keys(unknown.data).sort(),['code','error']);assert.equal(unknown.data.code,'MONTHLY_CAPTURE_REQUEST_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(unknown.data),/PRIVATE|table|SQL|URL|token/);assert.equal(calls.length,0);
}));

test('support-context parser admits only existing issuer metadata and rejects malformed/accessor/symbol fields before SQL',async()=>{
 const sentinel=Error('STOP_AT_FIRST_REAL_DATABASE_BOUNDARY');let calls=0,getters=0;const tx={$queryRawUnsafe:async()=>{calls++;throw sentinel}};
 const admin={...actor,isSuperAdmin:true,platformRole:'SUPER_ADMIN'},scope={companyId:actor.companyId,storeId:'selected'};
 for(const context of [{companyId:actor.companyId},{companyId:actor.companyId,storeId:null},{companyId:actor.companyId,storeId:'selected'},...['ALL','BACKOFFICE','SHIFTS','CASH_CONTROL'].map(destination=>({companyId:actor.companyId,companyName:'  display '.repeat(100),storeId:'selected',storeName:'',destination})),{companyId:actor.companyId,storeId:null,companyName:'Company',storeName:null,destination:'ALL'}])await assert.rejects(authorizeMonthlyCaptureGrantManagementInTransaction(tx,{...admin,supportContext:context},scope),error=>error===sentinel);
 const validCalls=calls;
 for(const context of [{companyId:actor.companyId,unknown:true},{companyId:actor.companyId,companyName:null},{companyId:actor.companyId,storeName:[]},{companyId:actor.companyId,destination:'OWNER'},{companyId:actor.companyId,storeId:' selected'},Object.assign(Object.create({inherited:true}),{companyId:actor.companyId})])await assert.rejects(authorizeMonthlyCaptureGrantManagementInTransaction(tx,{...admin,supportContext:context},scope),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
 const accessor={companyId:actor.companyId};Object.defineProperty(accessor,'companyName',{get(){getters++;return 'unsafe'},enumerable:true});await assert.rejects(authorizeMonthlyCaptureGrantManagementInTransaction(tx,{...admin,supportContext:accessor},scope),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
 const symbolic={companyId:actor.companyId,[Symbol('scope')]:'x'};await assert.rejects(authorizeMonthlyCaptureGrantManagementInTransaction(tx,{...admin,supportContext:symbolic},scope),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
 assert.equal(calls,validCalls);assert.equal(getters,0);
});

test('production composition mounts only this personal router behind actual auth and paid Inventory with no-store before auth',()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.ok(source.includes('app.use("/api/monthly-inventory-capture",(req,res,next)=>{res.setHeader("Cache-Control","no-store");next()},auth,requireStoreModule("INVENTORY"),createMonthlyInventoryCaptureRouter(prisma));'));
});
