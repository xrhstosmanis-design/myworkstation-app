import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

test('native analytics requires an explicit store with its read prerequisites and suppresses revoked results',async()=>{
  const rights=['analytics.read','shifts.read','sales.read'];
  let capabilities=[...rights],reads=0,withdrawDuringRead=false,moduleActive=true;
  const principal={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
  const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL'].map(moduleKey=>({moduleKey,active:moduleActive}))})},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'MANAGER',capabilities}]:[];
    if(sql.includes('FROM "StorePaidModule"'))return [];
    reads++;
    assert.equal(values[0],'company');
    assert.ok(values.includes('store')||values.includes(null));
    if(withdrawDuringRead)capabilities=[];
    return [];
  }};
  const middleware=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
  const requireCompanyModule=new Function('prisma','ownerRestrictedModuleKeys',middleware.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn requireCompanyModule;')(db,ownerRestrictedModuleKeys);
  const source=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
  const start=source.indexOf('router.get("/sales/advanced-report",');
  const end=source.indexOf('\nrouter.get("/handover",',start);
  assert.ok(start>=0&&end>start);
  const router=express.Router();
  new Function('router','requireCompanyModule','prisma','ownedStore','greeceRangeDate','requireStaffGrant','staffError',source.slice(start,end))(router,requireCompanyModule,db,async(companyId,storeId)=>companyId==='company'&&storeId==='store'?{id:storeId}:null,value=>new Date(value),requireStaffGrant,staffError);
  const app=express();
  app.use(async(req,res,next)=>{
    req.user=req.get('x-owner')?{role:'OWNER',companyId:'company'}:{...principal};
    try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}
  });
  app.use('/api/commerce',router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({query='storeId=store',headerStore='store',owner=false}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/sales/advanced-report?${query}`,{headers:{'x-backoffice-store-id':headerStore,...(owner?{'x-owner':'yes'}:{})}});
    return {status:response.status,body:await response.json()};
  };
  try{
    const allowed=await request();
    assert.equal(allowed.status,200);
    assert.equal(allowed.body.storeId,'store');
    assert.equal(reads,10);
    for(const query of ['','storeId=','storeId=sibling','storeId=foreign','storeId=store&storeId=sibling']){
      const before=reads;
      assert.equal((await request({query})).status,403);
      assert.equal(reads,before);
    }
    for(const missing of rights){
      capabilities=rights.filter(right=>right!==missing);
      assert.equal((await request()).status,403);
    }
    capabilities=[...rights];
    moduleActive=false;
    assert.equal((await request()).status,403);
    moduleActive=true;
    withdrawDuringRead=true;
    const denied=await request();
    assert.equal(denied.status,403);
    assert.equal(Object.hasOwn(denied.body,'summary'),false);
    withdrawDuringRead=false;
    assert.equal((await request()).status,403);
    const owner=await request({owner:true,query:''});
    assert.equal(owner.status,200);
    assert.equal(owner.body.storeId,null);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
