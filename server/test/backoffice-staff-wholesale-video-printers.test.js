import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {assertWholesaleManager,wholesaleError} from '../src/lib/wholesale-pricing.js';
import {assertWholesaleEntitlement,createWholesaleEntitlementGuard} from '../src/lib/wholesale-entitlement.js';
import {createProductionPrinting} from '../src/services/production-printing.js';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated read attempted DDL, mutation, lifecycle initialization, pairing, provider or connector access');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function moduleRuntime(db){const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule,companyModuleState,isPlatformSuperAdmin};')(db,ownerRestrictedModuleKeys);}
async function listen(db,path,router,guard){
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=req.get('x-owner')?{id:'owner',companyId:'company',role:'OWNER'}:staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use(path,...(guard?[guard]:[]),router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message,code:error.code}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 return {async request(suffix,{header='store',method='GET',owner=false}={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}`,{method,headers:{'x-backoffice-store-id':header,...(owner?{'x-owner':'true'}:{})}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('native wholesale orders admit only scoped order reads with live commercial entitlement and redacted snapshots',async()=>{
 let capabilities=['wholesale.read'],moduleActive=true,commercialActive=true,withdraw=false,commercialWithdraw=false,reads=0;
 const order={id:'order',storeId:'store',customerId:'customer',actorId:'PRIVATE-ACTOR',clientOrderId:'PRIVATE-CLIENT-ID',quoteId:'PRIVATE-QUOTE-ID',channel:'BACKOFFICE',status:'SUBMITTED',revision:1,notes:'Synthetic note',netTotal:'10',vatTotal:'2.40',grossTotal:'12.40',createdAt:'2026-11-18T10:00:00Z',snapshot:{customerName:'Synthetic customer',currency:'EUR',storeId:'store',secret:'PRIVATE-SNAPSHOT',items:[{productId:'product',name:'Synthetic product',unit:'PIECE',quantity:2,netTotal:'10.00',vatTotal:'2.40',grossTotal:'12.40',secret:'PRIVATE-LINE'}],totals:{net:'10.00',vat:'2.40',gross:'12.40',secret:'PRIVATE-TOTAL'}}};
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'WHOLESALE_B2B',active:moduleActive}]})},$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $transaction:async(fn,options)=>{assert.deepEqual(options,{isolationLevel:'RepeatableRead'});return fn(db)},
  $queryRaw:async(strings,...args)=>{
   const sql=Array.isArray(strings)?strings.join('?'):strings.sql,values=Array.isArray(strings)?args:strings.values;
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   if(sql.includes('FROM "Company" co JOIN "CompanyModule"')){assert.ok(values.includes('company'));assert.ok(sql.includes("'WHOLESALE_B2B'"));return commercialActive?[{companyId:'company'}]:[];}
   if(sql.includes('clock_timestamp() AS "now"'))return [{now:new Date()}];
   assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "Store" s JOIN "Company"'))return [{id:'store'}];
   reads++;assert.ok(sql.includes('FROM "WholesaleOrderRequest"'));assert.match(sql,/"companyId"=\? AND "storeId"=\?/);if(withdraw)capabilities=[];if(commercialWithdraw)commercialActive=false;
   if(sql.includes('COUNT(*)'))return [{total:1}];
   if(values.includes('missing-order'))return [];
   return [{...order}];
  }
 };
 const source=await readFile(new URL('../src/routes/wholesale-b2b.js',import.meta.url),'utf8');
 const router=new Function('crypto','Router','z','Prisma','assertWholesaleManager','buildWholesaleQuote','wholesaleError','createWholesaleOrder','prisma','ensureWholesaleSchema','assertWholesaleEntitlement','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(crypto,express.Router,z,Prisma,assertWholesaleManager,forbidden,wholesaleError,forbidden,db,forbidden,assertWholesaleEntitlement,requireStaffGrant,staffError);
 const app=await listen(db,'/api/wholesale',router,createWholesaleEntitlementGuard({db}));
 try{
  for(const path of ['/orders?storeId=store','/orders/order?storeId=store']){
   capabilities=['wholesale.read'];commercialActive=true;const result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');const row=result.body.items?.[0]||result.body.order;assert.equal(row.companyId,'company');assert.equal(row.storeId,'store');assert.equal(row.grossTotal,'12.40');assert.equal(row.snapshot.items[0].name,'Synthetic product');assert.equal(JSON.stringify(result.body).includes('PRIVATE-'),false);
   const before=reads;for(const input of [{path:path.replace('storeId=store','storeId=foreign'),header:'foreign'},{path:path.replace('storeId=store','storeId=foreign')},{path:path.replace(/\?.*/, '')},{path,header:''},{path,method:'POST'},{path:'/customers'},{path:'/products?storeId=store'},{path:'/price-lists'},{path:'/quotes',method:'POST'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
   capabilities=['products.read'];assert.equal((await app.request(path)).status,403);capabilities=['wholesale.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;commercialActive=false;assert.equal((await app.request(path)).status,403);commercialActive=true;
   commercialWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'items'),false);assert.equal(Object.hasOwn(disabled.body,'order'),false);commercialWithdraw=false;commercialActive=true;
   withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'items'),false);assert.equal(Object.hasOwn(revoked.body,'order'),false);withdraw=false;
  }
  capabilities=['wholesale.read'];assert.equal((await app.request('/orders/missing-order?storeId=store')).status,404);
 }finally{await app.close()}
});

test('native video status read exposes only scoped status and camera identity without credentials or connector packages',async()=>{
 let capabilities=['video.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,overrideActive=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'VIDEO_EVENTS',active:moduleActive}]})},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active?{id:'store',name:'Synthetic store'}:null},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return overrideActive?[{active:true}]:[];
   reads++;assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);assert.doesNotMatch(sql,/"endpoint"|"username"|"streamReference"|"healthJson"|"passwordEnc"|"tokenHash"/);if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   if(sql.includes('FROM "StoreVideoConnection"'))return [{provider:'DAHUA',protocol:'ONVIF',active:true,connectionStatus:'CONNECTED',timeSyncStatus:'SYNCED',retentionDays:30}];
   if(sql.includes('FROM "StoreVideoCamera"'))return [{cameraKey:'camera',displayName:'Synthetic camera',zone:'ENTRANCE',active:true,sortOrder:1}];
   assert.ok(sql.includes('FROM "ConnectorDevice"'));return [{id:'connector',deviceName:'Synthetic connector',version:'1',status:'ONLINE',lastSeenAt:new Date()}];
  }
 };
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/routes/backoffice-video-admin.js',import.meta.url),'utf8');
 const router=new Function('Router','crypto','z','prisma','companyModuleState','ensureVideoEventsSchema','videoConnectorStatus','sendHikvisionPrecheck','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(express.Router,crypto,z,db,modules.companyModuleState,forbidden,forbidden,forbidden,requireStaffGrant,staffError);
 const app=await listen(db,'/api/video-admin',router);
 try{
  const path='/stores/store',result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.store.id,'store');assert.equal(result.body.connection.connectionStatus,'CONNECTED');assert.equal(result.body.cameras[0].displayName,'Synthetic camera');assert.equal(result.body.connector.status,'ONLINE');assert.notEqual(result.body.canConfigure,true);
  const before=reads;for(const input of [{path:'/stores/foreign',header:'foreign'},{path:'/stores/foreign'},{path,header:''},{path,method:'PUT'},{path:'/stores/store/cameras',method:'PUT'},{path:'/stores/store/pairing-code',method:'POST'},{path:'/stores/store/packages/hikvision-precheck'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
  capabilities=['printers.read'];assert.equal((await app.request(path)).status,403);capabilities=['video.read'];moduleActive=false;overrideActive=true;assert.equal((await app.request(path)).status,403);moduleActive=true;overrideActive=false;
  moduleWithdraw=true;overrideActive=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'cameras'),false);assert.equal(Object.hasOwn(disabled.body,'connection'),false);moduleWithdraw=false;moduleActive=true;overrideActive=false;
  withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'cameras'),false);assert.equal(Object.hasOwn(revoked.body,'connector'),false);withdraw=false;
 }finally{await app.close()}
});

test('native printer status uses the read-only service without settings, lifecycle, pairing or connector access',async()=>{
 let capabilities=['printers.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:moduleActive}]})},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active?{id:'store',name:'Synthetic store',companyId:'company'}:null},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);assert.doesNotMatch(sql,/StoreLifecycle|"ticket"|"tokenHash"|"pairHash"|"settings"|"claimId"|PreparationProductSettings/);if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   assert.ok(sql.includes('FROM "ProductionPrintJob"'));return [{id:'job',batchId:'batch',status:'QUEUED',createdAt:'2026-11-18T10:00:00Z',claimedAt:null}];
  }
 };
 const modules=await moduleRuntime(db),source=await readFile(new URL('../src/routes/production-printers.js',import.meta.url),'utf8');
 const router=new Function('Router','prisma','auth','companyModuleState','isPlatformSuperAdmin','requireCompanyModule','createProductionPrinting','readFile','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default createProductionPrinterRouter();','return createProductionPrinterRouter();').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../src/routes/production-printers.js',import.meta.url).href)))(express.Router,db,(_req,_res,next)=>next(),modules.companyModuleState,modules.isPlatformSuperAdmin,modules.requireCompanyModule,createProductionPrinting,forbidden,requireStaffGrant,staffError);
 const app=await listen(db,'/api/production-printers',router);
 try{
  const path='/stores/store',result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.jobs[0].status,'QUEUED');assert.equal(result.body.canConfigure,false);for(const key of ['settings','products','lifecycleGeneration','token','pairingCode'])assert.equal(Object.hasOwn(result.body,key),false,key);
  const before=reads;for(const input of [{path:'/stores/foreign',header:'foreign'},{path:'/stores/foreign'},{path,header:''},{path,method:'PUT'},{path:'/stores/store/pairing',method:'POST'},{path:'/stores/store/jobs/job/resolve',method:'POST'},{path:'/stores/store/connector'},{path:'/companies/company/stores/store'},{path:'/pair',method:'POST'},{path:'/device/next',method:'POST'},{path:'/device/result',method:'POST'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
  capabilities=['video.read'];assert.equal((await app.request(path)).status,403);capabilities=['printers.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;
  moduleWithdraw=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'jobs'),false);moduleWithdraw=false;moduleActive=true;
  withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'jobs'),false);withdraw=false;
 }finally{await app.close()}
});
