import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

test('native handover list and attachment remain scoped, revoke before response and never admit acknowledgments',async()=>{
  let capabilities=['handover.read'],reads=0,withdrawDuringRead=false,moduleActive=true,wrongAttachmentStore=false;
  const principal={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
  const db={company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'SHIFT_HANDOVER',active:moduleActive}]})},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
    if(sql.includes('FROM "StorePaidModule"'))return [];
    assert.match(sql,/FROM "ShiftHandover"/);
    reads++;
    if(withdrawDuringRead)capabilities=[];
    if(sql.includes('JOIN "Store" s')){
      assert.match(sql,/s\."companyId"=\?/);
      assert.match(sql,/OR h\."storeId"=\?/);
      assert.equal(values[1],'company');
      if(values[0]==='foreign')return [];
      return [{storeId:wrongAttachmentStore?'sibling':'store',attachmentData:'data:image/png;base64,AAA=',attachmentMimeType:'image/png',attachmentFilename:'synthetic.png'}];
    }
    assert.deepEqual(values,['store']);
    return [{id:'message',message:'Synthetic handover',hasAttachment:true}];
  }};
  const middleware=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
  const requireCompanyModule=new Function('prisma','ownerRestrictedModuleKeys',middleware.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn requireCompanyModule;')(db,ownerRestrictedModuleKeys);
  const source=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
  const start=source.indexOf('router.get("/handover",');
  const end=source.indexOf('\nrouter.get("/documents/inbox",',start);
  assert.ok(start>=0&&end>start);
  const router=express.Router();
  new Function('router','requireCompanyModule','prisma','ownedStore','requireStaffGrant','staffError',source.slice(start,end))(router,requireCompanyModule,db,async(companyId,storeId)=>companyId==='company'&&storeId==='store'?{id:storeId}:null,requireStaffGrant,staffError);
  const app=express();
  app.use(async(req,res,next)=>{
    req.user=req.get('x-owner')?{role:'OWNER',companyId:'company'}:{...principal};
    try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}
  });
  app.use('/api/commerce',router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({suffix='',query='storeId=store',headerStore='store',owner=false,method='GET'}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/handover${suffix}?${query}`,{method,headers:{'x-backoffice-store-id':headerStore,...(owner?{'x-owner':'yes'}:{})}});
    return {status:response.status,body:await response.json()};
  };
  try{
    for(const suffix of ['','/message/attachment']){
      capabilities=['handover.read'];
      assert.equal((await request({suffix})).status,200);
      const before=reads;
      for(const query of ['','storeId=sibling','storeId=foreign','storeId=store&storeId=sibling'])assert.equal((await request({suffix,query})).status,403);
      for(const [method,path] of [['POST',''],['POST','/message/ack'],['DELETE','/message']])assert.equal((await request({suffix:path,method})).status,403);
      assert.equal(reads,before);
      moduleActive=false;
      assert.equal((await request({suffix})).status,403);
      moduleActive=true;
      capabilities=['shifts.read'];
      assert.equal((await request({suffix})).status,403);
      capabilities=['handover.read'];
      withdrawDuringRead=true;
      const denied=await request({suffix});
      assert.equal(denied.status,403);
      assert.equal(Object.hasOwn(denied.body,'dataUrl'),false);
      withdrawDuringRead=false;
      assert.equal((await request({suffix})).status,403);
      assert.equal((await request({suffix,owner:true})).status,200);
    }
    capabilities=['handover.read'];
    assert.equal((await request({suffix:'/foreign/attachment'})).status,404);
    wrongAttachmentStore=true;
    assert.equal((await request({suffix:'/message/attachment'})).status,403);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
