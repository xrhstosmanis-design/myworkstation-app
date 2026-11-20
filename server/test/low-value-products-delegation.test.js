import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {z} from 'zod';
import {requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';
import {lowValueLabOwnerAccess} from '../src/services/low-value-lab-owner-access.js';
import {buildLowValueProducts} from '../src/lib/low-value-products.js';

test('native low-value report preserves owner reads and scopes delegated access through withdrawal before response',async()=>{
  let revoked=false,revokeDuringReport=false,reportReads=0,grantReads=0;
  const company={id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'LOW_VALUE_PRODUCTS',active:true}]};
  const db={
    company:{findUnique:async()=>company},
    store:{findUnique:async({where})=>({id:where.id,companyId:where.id==='foreign'?'other':'company'})},
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{userId:'staff',companyId:'company'}];
      if(sql.includes('FROM "BackofficeStaffGrant" g')){
        grantReads++;
        assert.deepEqual(values,['staff','company','store']);
        return revoked?[]:[{profile:'AUDITOR',capabilities:['low-value-products.read']}];
      }
      if(sql.includes('FROM "StorePaidModule"'))return [];
      reportReads++;
      if(revokeDuringReport)revoked=true;
      return [];
    },
    $transaction:async work=>work(db),
  };
  const guardSource=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
  const requireStoreModule=new Function('prisma','ownerRestrictedModuleKeys',guardSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn requireStoreModule;')(db,ownerRestrictedModuleKeys);
  const routeSource=await readFile(new URL('../src/routes/low-value-products.js',import.meta.url),'utf8');
  const router=new Function('Router','z','prisma','requireStoreModule','lowValueLabOwnerAccess','buildLowValueProducts','requireStaffGrant','staffError',routeSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'').replace('default router;','return router;'))(express.Router,z,db,requireStoreModule,lowValueLabOwnerAccess,buildLowValueProducts,requireStaffGrant,staffError);
  const owner={role:'OWNER',companyId:'company'};
  const staff={id:'staff',companyId:'company',storeId:'store',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',permissions:['LOW_VALUE_PRODUCTS']};
  const app=express();
  app.use((req,_res,next)=>{
    req.user=req.get('x-user')==='owner'?owner:{...staff};
    req.staffGrant={capability:req.get('x-capability')||'low-value-products.read'};
    next();
  });
  app.use('/api/commerce',router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({store='store',user='staff',capability='low-value-products.read',suffix=''}={})=>{
    const res=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/low-value-products${suffix}?storeId=${store}`,{headers:{'x-user':user,'x-capability':capability}});
    return {status:res.status,body:await res.json()};
  };
  try{
    assert.equal((await request({user:'owner'})).status,200);
    assert.equal(grantReads,0);
    const accessReads=reportReads;
    assert.deepEqual(await request({suffix:'/access'}),{status:200,body:{storeId:'store'}});
    assert.equal(reportReads,accessReads);
    assert.equal((await request()).status,200);
    for(const suffix of ['','/access']){
      const before=reportReads;
      assert.equal((await request({store:'sibling',suffix})).status,403);
      assert.equal((await request({store:'foreign',suffix})).status,404);
      assert.equal((await request({capability:'products.read',suffix})).status,403);
      assert.equal(reportReads,before);
    }
    revokeDuringReport=true;
    const withheld=await request();
    assert.equal(withheld.status,403);
    assert.equal(withheld.body.code,'STAFF_ACCESS_DENIED');
    assert.equal(Object.hasOwn(withheld.body,'rows'),false);
    revokeDuringReport=false;
    const before=reportReads;
    assert.equal((await request({suffix:'/access'})).status,403);
    assert.equal((await request()).status,403);
    assert.equal(reportReads,before);
    assert.equal((await request({user:'owner'})).status,200);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
