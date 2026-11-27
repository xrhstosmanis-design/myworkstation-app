import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createStoreConsumptionFinancialRouter} from '../src/routes/store-consumption-financial.js';

test('mounted financial report routes enforce manager grant before and after source read, role and store isolation',async()=>{
  let user,grant,reads=0,checks=0,revoke=false;
  const app=express();app.use((req,_res,next)=>{req.user=user;req.staffGrant=grant;next()});
  app.use('/api/commerce/sales/financial-reports',createStoreConsumptionFinancialRouter({db:{},moduleAccess:()=> (req,_res,next)=>{req.targetStore={id:'s',companyId:'c'};next()},
    requireGrant:async()=>{checks++;if(revoke&&checks%2===0)throw Object.assign(Error('revoked'),{status:403});return {grant:{profile:'MANAGER'}}},
    reader:async(_db,args)=>{reads++;return {storeId:args.storeId,report:args.report,rows:[]}}
  }));
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/commerce/sales/financial-reports/`;
  const query='?storeId=s&from=2026-11-01&to=2026-11-30';
  try{
    user={role:'OWNER',companyId:'c'};let r=await fetch(url+'destructions'+query);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
    user={role:'OWNER',companyId:'foreign'};r=await fetch(url+'destructions'+query);assert.equal(r.status,403);
    user={role:'EMPLOYEE',tokenType:'STORE_OPERATOR',companyId:'c'};assert.equal((await fetch(url+'destructions'+query)).status,403);
    user={role:'OWNER',isSuperAdmin:true,supportContext:{companyId:'c'},companyId:'c'};assert.equal((await fetch(url+'destructions'+query)).status,200);
    user={role:'OWNER',isSuperAdmin:true,supportContext:{companyId:'c',storeId:'other'},companyId:'c'};assert.equal((await fetch(url+'destructions'+query)).status,403);
    user={role:'EMPLOYEE',staffAccess:true,companyId:'c',storeId:'s'};grant={capability:'financial-self-consumption.read'};checks=0;
    assert.equal((await fetch(url+'self-consumption'+query)).status,200);assert.equal(checks,2);
    const before=reads;assert.equal((await fetch(url+'destructions'+query)).status,403);assert.equal(reads,before);
    checks=0;revoke=true;assert.equal((await fetch(url+'self-consumption'+query)).status,403);
    assert.equal((await fetch(url+'self-consumption'+query.replace('storeId=s','storeId=other'))).status,403);
    assert.equal((await fetch(url+'self-consumption'+query,{method:'POST'})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
