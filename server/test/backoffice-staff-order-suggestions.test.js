import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {z} from 'zod';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';
import {buildOrderSuggestions} from '../src/lib/order-suggestions.js';
import {buildSupplierOrderGroups,SUPPLIER_EVIDENCE_LIMIT} from '../src/lib/supplier-order-groups.js';

test('both native order suggestion views admit only current scoped grants and withhold revoked report responses',async()=>{
  let capabilities=['order-suggestions.read'],moduleActive=true,withdrawDuringRead=false,reads=0;
  const staff={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
  const db={
    company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'ORDER_SUGGESTIONS',active:moduleActive}]})},
    store:{findUnique:async({where})=>({id:where.id,companyId:where.id==='foreign'?'other':'company'})},
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
      if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
      if(sql.includes('FROM "StorePaidModule"'))return [];
      reads++;
      assert.ok(values.includes('company'));
      assert.ok(values.includes('store'));
      assert.equal(values.includes('foreign'),false);
      if(withdrawDuringRead)capabilities=[];
      return [];
    },
    $transaction:async work=>{const {$transaction,...tx}=db;return work(tx)},
  };
  const guardSource=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
  const requireStoreModule=new Function('prisma','ownerRestrictedModuleKeys',guardSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn requireStoreModule;')(db,ownerRestrictedModuleKeys);
  const routeSource=await readFile(new URL('../src/routes/order-suggestions.js',import.meta.url),'utf8');
  const router=new Function('Router','z','prisma','requireStoreModule','buildOrderSuggestions','buildSupplierOrderGroups','SUPPLIER_EVIDENCE_LIMIT','requireStaffGrant','staffError','expectedReceiptReadiness','expectedReceiptRows',routeSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'').replace('default router;','return router;'))(express.Router,z,db,requireStoreModule,buildOrderSuggestions,buildSupplierOrderGroups,SUPPLIER_EVIDENCE_LIMIT,requireStaffGrant,staffError,async()=>({available:false}),async()=>[]);
  const app=express();
  app.use(async(req,res,next)=>{
    req.user=req.get('x-owner')?{role:'OWNER',companyId:'company'}:{...staff};
    try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}
  });
  app.use('/api/commerce',router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({suffix='',store='store',headerStore='store',method='GET',owner=false,query=''}={})=>{
    const res=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/order-suggestions${suffix}?storeId=${store}${query}`,{method,headers:{'x-backoffice-store-id':headerStore,...(owner?{'x-owner':'true'}:{})}});
    return {status:res.status,body:await res.json()};
  };
  try{
    for(const suffix of ['','/by-supplier']){
      capabilities=['order-suggestions.read'];
      assert.equal((await request({suffix})).status,200);
      const before=reads;
      for(const options of [{store:'sibling',headerStore:'sibling'},{store:'foreign',headerStore:'foreign'},{store:'sibling'},{method:'POST'}]){
        assert.equal((await request({suffix,...options})).status,403);
      }
      assert.equal((await request({suffix,query:'&historyDays=0'})).status,400);
      assert.equal(reads,before);
      moduleActive=false;
      assert.equal((await request({suffix})).status,403);
      moduleActive=true;
      capabilities=['products.read'];
      assert.equal((await request({suffix})).status,403);
      capabilities=['order-suggestions.read'];
      withdrawDuringRead=true;
      const withheld=await request({suffix});
      assert.equal(withheld.status,403);
      assert.equal(Object.hasOwn(withheld.body,'rows'),false);
      withdrawDuringRead=false;
      const afterWithdrawal=reads;
      assert.equal((await request({suffix})).status,403);
      assert.equal(reads,afterWithdrawal);
      assert.equal((await request({suffix,owner:true})).status,200);
    }
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
