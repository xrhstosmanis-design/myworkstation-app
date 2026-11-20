import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createExpectedReceiptInstallation} from '../src/services/supplier-expected-receipts-installation.js';
import {createExpectedReceiptInstallationRouter} from '../src/routes/supplier-expected-receipts-installation.js';
const revision='a'.repeat(40);
const actor={id:'admin',isSuperAdmin:true,sessionId:'session',sessionVersion:0,tokenType:'BACKOFFICE_USER'};
test('No14 exact source/target identity and explicit disabled gate require no DB access',()=>{
 const db={$transaction(){throw Error('unexpected DB')}};
 const off=createExpectedReceiptInstallation(db,{sourceRevision:revision});
 assert.equal(off.describe().oldPlanHash,'54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828');
 assert.equal(off.describe().targetPlanHash,'75ddba0584cc6a256bd0d97b6d4b8ad466229061da7329f72c07a068acc49183');
 assert.equal(off.describe().productionActivated,false);
 assert.throws(()=>off.install(actor,{}),{code:'EXPECTED_RECEIPT_INSTALL_DISABLED'});
 assert.throws(()=>createExpectedReceiptInstallation(db,{sourceRevision:revision,enabled:true}).install(actor,{}),{code:'EXPECTED_RECEIPT_INSTALL_AUTHORIZATION_REQUIRED'});
 assert.throws(()=>createExpectedReceiptInstallation(db,{sourceRevision:'invalid'}));
});
for(const [label,patch,status] of [['owner',{isSuperAdmin:false,role:'OWNER'},403],['manager',{isSuperAdmin:false,role:'MANAGER'},403],['staff',{isSuperAdmin:false,role:'STAFF'},403],['support',{supportContext:{}},403],['scoped-token',{tokenType:'STORE_STAFF'},403],['no-session',{sessionId:null},401],['revoked',{},401]])test('No14 route denies '+label+' before service construction',async()=>{
 let constructed=0;
 const app=express();app.use((req,res,next)=>{req.user={...actor,...patch};next();});
 app.use('/companies/:companyId/stores/:storeId',createExpectedReceiptInstallationRouter({userSession:{findUnique:async()=>null}},{env:{GIT_COMMIT:revision},createInstallation:()=>{constructed++;throw Error('unexpected');}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/companies/c/stores/s/inspect`);assert.equal(response.status,status);assert.equal(constructed,0);assert.equal(response.headers.get('cache-control'),'no-store');}
 finally{await new Promise(resolve=>server.close(resolve));}
});
for(const alias of [false,true])test('No14 valid privileged session admits '+(alias?'store alias with DB-derived company':'canonical company route'),async()=>{
 const calls=[];
 const db={userSession:{findUnique:async()=>({userId:'admin',expiresAt:new Date(Date.now()+60000),revokedAt:null,user:{id:'admin',role:'SUPER_ADMIN',sessionVersion:0,mustChangePassword:false}})},store:{findUnique:async({where})=>{assert.equal(where.id,'s');return {companyId:'derived-company'};}}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=actor;next();});
 app.use(alias?'/stores/:storeId':'/companies/:companyId/stores/:storeId',createExpectedReceiptInstallationRouter(db,{env:{GIT_COMMIT:revision},createInstallation:async(_db,options)=>{assert.equal(options.enabled,false);return {inspect:async(admitted,scope)=>{assert.equal(admitted,actor);calls.push(scope);return {eligible:true,packet:scope};},install:(admitted,input)=>createExpectedReceiptInstallation({$transaction(){throw Error('foreign packet reached DB');}},{sourceRevision:revision,enabled:true}).install(admitted,input)};}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`+(alias?'/stores/s':'/companies/c/stores/s');
 try{
  const response=await fetch(base+'/inspect');assert.equal(response.status,200);assert.deepEqual(calls,[{companyId:alias?'derived-company':'c',storeId:'s'}]);
  const foreign=await fetch(base+'/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet:{companyId:'foreign',storeId:'s'},explicitAuthorization:true})});
  assert.equal(foreign.status,409);assert.equal((await foreign.json()).code,'EXPECTED_RECEIPT_INSTALL_REFUSED');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
