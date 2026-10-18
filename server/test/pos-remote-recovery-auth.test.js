import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import router from '../src/routes/platform-device-operations.js';
test('actual recovery HTTP routes reject unauthenticated and non-admin requests before database access',async()=>{
 const old=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-pos-recovery-auth-test';const app=express();app.use(express.json());app.use('/ops',router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/ops/companies/company/stores/target/pos-recovery`;
  for(const method of ['GET','POST']){
   const endpoint=method==='POST'?url+'/00000000-0000-4000-8000-000000000001':url;
   assert.equal((await fetch(endpoint,{method})).status,401);
   const token=jwt.sign({id:'ordinary',companyId:'company',role:'OWNER'},process.env.JWT_SECRET);
   assert.equal((await fetch(endpoint,{method,headers:{Authorization:`Bearer ${token}`}})).status,403);
  }
 }finally{await new Promise(resolve=>server.close(resolve));if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old}
});
