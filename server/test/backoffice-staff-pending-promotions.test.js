import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {parsePromotionDate} from '../src/promotion-time.js';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated view attempted schema bootstrap or a mutation');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function moduleRuntime(db){
 const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
 return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule,isPlatformSuperAdmin};')(db,ownerRestrictedModuleKeys);
}
async function serverFor(db,path,router,moduleGuard){
 const app=express();app.use(express.json());
 app.use(async(req,res,next)=>{req.user=req.get('x-owner')?{id:'owner',role:'OWNER',companyId:'company'}:staff();try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error)}});
 app.use(path,...(moduleGuard?[moduleGuard]:[]),router);
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
 return {async request(suffix,{store='store',header='store',method='GET',owner=false}={}){
  const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}${suffix.includes('?')?'&':'?'}storeId=${store}`,{method,headers:{'x-backoffice-store-id':header,...(owner?{'x-owner':'true'}:{})}});
  return {status:response.status,body:await response.json()};
 },async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

test('native pending-center view requires exact selected store, independent live grant and module, with no writes',async()=>{
 let capabilities=['pending.read'],moduleActive=true,licenseActive=true,withdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:licenseActive,licenseStatus:'ACTIVE',modules:[{moduleKey:'PENDING_CENTER',active:moduleActive}]})},
  store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?{id:'store'}:null},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(sql.includes('FROM "StoreChatTask" t'));assert.ok(sql.includes('m."companyId"=t."companyId" AND m."storeId"=t."storeId"'));
   assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(withdraw)capabilities=[];
   const row={id:'task',storeId:'store',storeName:'Synthetic store',messageId:'message',title:'Synthetic task',body:'Fixture body',status:'OPEN',createdAt:'2026-11-18T01:00:00.000Z',senderName:'Synthetic staff'};
   return values.includes('COMPLETED')?[]:[row];
  }
 };
 const modules=await moduleRuntime(db);
 const source=await readFile(new URL('../src/routes/pending-center.js',import.meta.url),'utf8');
 const router=new Function('crypto','express','prisma','isPlatformSuperAdmin','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(crypto,express,db,modules.isPlatformSuperAdmin,requireStaffGrant,staffError);
 const server=await serverFor(db,'/api/pending-center',router,modules.requireCompanyModule('PENDING_CENTER'));
 try{
  const result=await server.request('/chat-tasks');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.rows[0].id,'task');assert.equal(result.body.summary.open,1);
  const before=reads;
  for(const options of [{store:''},{store:'sibling'},{store:'foreign',header:'foreign'},{header:''},{method:'POST'}])assert.equal((await server.request('/chat-tasks',options)).status,403,JSON.stringify(options));
  assert.equal((await server.request('/chat-tasks/task',{method:'PATCH'})).status,403);assert.equal(reads,before);
  assert.equal((await server.request('/chat-tasks?status=BAD')).status,400);assert.equal(reads,before);
  capabilities=['employees.read'];assert.equal((await server.request('/chat-tasks')).status,403);capabilities=['pending.read'];
  moduleActive=false;assert.equal((await server.request('/chat-tasks')).status,403);moduleActive=true;licenseActive=false;assert.equal((await server.request('/chat-tasks')).status,403);licenseActive=true;
  const completed=await server.request('/chat-tasks?status=COMPLETED');assert.equal(completed.status,200);assert.deepEqual(completed.body.rows,[]);
  withdraw=true;const revoked=await server.request('/chat-tasks');assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'rows'),false);assert.equal(Object.hasOwn(revoked.body,'summary'),false);withdraw=false;
  const after=reads;assert.equal((await server.request('/chat-tasks')).status,403);assert.equal(reads,after);
  const owner=await server.request('/chat-tasks',{owner:true});assert.equal(owner.status,200);assert.equal(owner.body.rows[0].id,'task');
 }finally{await server.close()}
});

test('both native promotion views bind mappings and sales to the granted store, skip DDL and withhold revoked results',async()=>{
 let capabilities=['promotions.read'],moduleActive=true,override=null,withdraw=false,revokeModule=false,reads=0,ownerMode=false,ownerSchemaReads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active:moduleActive}]})},
  $transaction:forbidden,$executeRaw:forbidden,
  $executeRawUnsafe:async()=>{assert.equal(ownerMode,true,'delegated promotion read attempted DDL');ownerSchemaReads++;return 0},
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return override===null?[]:[{active:override}];
   reads++;assert.ok(values.includes('company'));assert.equal(values.includes('foreign'),false);
   const analysis=sql.includes('COUNT(DISTINCT sl."saleId")');
   if(!ownerMode){
    assert.ok(values.includes('store'));
    assert.match(sql,/WHERE pr\."companyId"=\?/);
    assert.match(sql,/ps\."storeId"=\?/);
    if(analysis){assert.match(sql,/s\."storeId"=\?/);assert.ok(sql.includes('EXISTS(SELECT 1 FROM "PriceCatalogPromotionStore"'));}
    else assert.ok(sql.includes('s."id"=ps."storeId" AND s."companyId"=pr."companyId"'));
   }
   if(withdraw)capabilities=[];if(revokeModule)override=false;
   return analysis?[{id:'promotion',productName:'Synthetic product',promotionType:'LEAFLET',salesCount:2,soldQuantity:'3',salesAmount:'6.40',discountAmount:'1.10',returnedQuantity:'1',returnedAmount:'2.10'}]:[{id:'promotion',name:'Synthetic offer',productId:'product',productName:'Synthetic product',promotionType:'LEAFLET',offerPrice:2.1,stores:[{id:ownerMode?'other-store':'store',name:'Synthetic store'}]}];
  }
 };
 const source=await readFile(new URL('../src/routes/price-catalog-promotion-guard.js',import.meta.url),'utf8');
 const router=new Function('crypto','Router','z','prisma','parsePromotionDate','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;').replace(/^export /gm,''))(crypto,express.Router,z,db,parsePromotionDate,requireStaffGrant,staffError);
 const modules=await moduleRuntime(db);
 const server=await serverFor(db,'/api/price-catalog',router,modules.requireCompanyModule('INVENTORY'));
 try{
  for(const suffix of ['/promotions/scoped','/promotions/analysis']){
   capabilities=['promotions.read'];override=null;moduleActive=true;
   const result=await server.request(suffix);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.items[0].id,'promotion');
   if(suffix.endsWith('/analysis'))assert.deepEqual(result.body.totals,{salesCount:2,soldQuantity:3,salesAmount:6.4,discountAmount:1.1,returnedQuantity:1,returnedAmount:2.1});
   else assert.deepEqual(result.body.items[0].stores,[{id:'store',name:'Synthetic store'}]);
   assert.equal(ownerSchemaReads,0);
   const before=reads;
   for(const options of [{store:''},{store:'sibling'},{store:'foreign',header:'foreign'},{header:''},{method:'POST'},{method:'PATCH'},{method:'DELETE'}])assert.equal((await server.request(suffix,options)).status,403,JSON.stringify(options));
   assert.equal((await server.request('/promotions')).status,403);assert.equal((await server.request('/promotions/promotion/scoped',{method:'PATCH'})).status,403);assert.equal(reads,before);
   capabilities=['products.read'];assert.equal((await server.request(suffix)).status,403);capabilities=['promotions.read'];
   moduleActive=false;assert.equal((await server.request(suffix)).status,403);moduleActive=true;
   override=false;assert.equal((await server.request(suffix)).status,403);override=true;assert.equal((await server.request(suffix)).status,200);override=null;
   revokeModule=true;const moduleRevoked=await server.request(suffix);assert.equal(moduleRevoked.status,403);assert.equal(Object.hasOwn(moduleRevoked.body,'items'),false);assert.equal(Object.hasOwn(moduleRevoked.body,'totals'),false);revokeModule=false;override=null;
   withdraw=true;const withdrawn=await server.request(suffix);assert.equal(withdrawn.status,403);assert.equal(Object.hasOwn(withdrawn.body,'items'),false);assert.equal(Object.hasOwn(withdrawn.body,'totals'),false);withdraw=false;
   const after=reads;assert.equal((await server.request(suffix)).status,403);assert.equal(reads,after);
  }
  ownerMode=true;const owner=await server.request('/promotions/scoped',{owner:true});assert.equal(owner.status,200,JSON.stringify(owner.body));assert.ok(ownerSchemaReads>0);assert.equal(owner.body.items[0].stores[0].id,'other-store');assert.equal(Object.hasOwn(owner.body,'storeId'),false);
 }finally{await server.close()}
});
