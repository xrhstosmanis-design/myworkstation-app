import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createCashReconciliationRouter} from '../src/routes/cash-reconciliation.js';
const request={requestId:'123e4567-e89b-42d3-a456-426614174000',head:'ROOT',generation:'0',period:{from:'2026-10-21',to:'2026-10-23'},data:{kind:'CONFIRM',sessionId:'a',sourceHash:'a'.repeat(64),planHash:'b'.repeat(64),note:'Ελέγχθηκαν τα πραγματικά στοιχεία.',reviewed:true}};
test('registered review HTTP rejects stale token roles, foreign store, inactive license/modules and malformed scope before source/audit writes',async()=>{
 let role='EMPLOYEE',company='co',active=true,modules=[],sourceCalls=0;
 const db={user:{findUnique:async()=>({id:'actor',fullName:'Test',companyId:'co',role,mustChangePassword:false})},store:{findUnique:async()=>({id:'store',companyId:company,active,company:{active:true}})},company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules})},$queryRaw:async(strings)=>{if(strings.join('').includes('StorePaidModule'))return[];sourceCalls++;throw Error('unexpected source access');},$queryRawUnsafe:async()=>{sourceCalls++;throw Error('unexpected lifecycle read');},$transaction:async()=>{sourceCalls++;throw Error('unexpected audit write');}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'authentication required'});req.user={id:'actor',companyId:'co',role:'SUPER_ADMIN'};next()});app.use(createCashReconciliationRouter({db}));
 const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,auth=true)=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,body:await res.json()};};
 try{
  assert.equal((await call('/stores/store?from=2026-10-21&to=2026-10-23',null,false)).status,401);
  assert.equal((await call('/stores/store?from=2026-10-21&to=2026-10-23')).status,403);assert.equal((await call('/stores/store/reviews',request)).status,403,'actual DB role overrides claimed token role');
  for(const body of [{...request,role:'SUPER_ADMIN'},{...request,data:{...request.data,reviewed:false}},{...request,data:{...request.data,cardOffset:10}}])assert.equal((await call('/stores/store/reviews',body)).status,400);
  assert.equal((await call('/stores/store?from=2026-10-01&to=2026-11-01')).status,400);
  role='OWNER';company='foreign';assert.equal((await call('/stores/store/reviews',request)).status,404);company='co';active=false;assert.equal((await call('/stores/store/reviews',request)).status,404);active=true;
  for(const missing of ['CASH_CONTROL','STORE_CHAT','AI_READER']){modules=['CASH_CONTROL','STORE_CHAT','AI_READER'].filter(k=>k!==missing).map(moduleKey=>({moduleKey,active:true}));assert.equal((await call('/stores/store/reviews',request)).status,403);}
  assert.equal(sourceCalls,0,'denied or invalid requests never read financial/paper sources or write audit');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('review HTTP never returns private source/provider diagnostics as a user error',async()=>{
 const app=express();app.use(createCashReconciliationRouter({db:{},authorize:async()=>{throw Error('PRIVATE_SOURCE_TOKEN account amount detail');}}));const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/stores/store?from=2026-10-21&to=2026-10-23`);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_SOURCE_TOKEN|account amount/);}finally{await new Promise(resolve=>server.close(resolve));}
});
