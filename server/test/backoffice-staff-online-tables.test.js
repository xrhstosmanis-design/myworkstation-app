import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import {z} from 'zod';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated view attempted a write, schema bootstrap or an unrelated helper');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function modulesFor(db){const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule,companyModuleState,effectiveModuleEnabled};')(db,ownerRestrictedModuleKeys);}
async function listen(db,path,router,guard){
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use(path,...(guard?[guard]:[]),router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message,code:error.code}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 return {async request(suffix,{header='store',method='GET'}={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('native table views require scoped modules and live grants without schema initialization, configuration or payment writes',async()=>{
 let capabilities=['table-service.read'],moduleActive=true,configActive=true,withdraw=false,withdrawConfig=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:true},{moduleKey:'TABLE_SERVICE',active:moduleActive}]})},
  store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active===true?{id:'store'}:null},
  companyModule:{findFirst:async({where})=>{assert.deepEqual(where,{companyId:'company',moduleKey:'TABLE_SERVICE',active:true});return moduleActive?{id:'module'}:null}},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "StoreTableServiceConfig"'))return [{enabled:configActive}];
   reads++;if(withdraw)capabilities=[];if(withdrawConfig)configActive=false;
   if(sql.includes('FROM "DiningArea"'))return [{id:'area',name:'Synthetic area',sortOrder:0}];
   if(sql.includes('FROM "DiningTable"'))return [{id:'table',areaId:'area',name:'Synthetic table',capacity:4}];
   if(sql.includes('FROM "StorePreparationBatch"'))return [{id:'batch',tableOrderId:'order',itemsJson:[{productId:'product',quantity:2}],status:'SENT',tableName:'Synthetic table'}];
   if(sql.includes('FROM "PosSaleActionAudit"'))return [];
   assert.ok(sql.includes('FROM "TableOrder" o'));assert.match(sql,/o\."companyId"=\? AND o\."storeId"=\?/);
   return [{id:'order',tableId:'table',tableName:'Synthetic table',status:'SENT',total:'4.20',cashParts:[{amountCents:100}],items:[{id:'line',name:'Synthetic item',quantity:'2',salePrice:'2.10',unitPrice:'2.10',lineTotal:'4.20'}]}];
  }
 };
 const source=await readFile(new URL('../src/routes/store-table-orders.js',import.meta.url),'utf8');
 const router=new Function('tableCashLabEnabled','resolveModifierInventoryPrices','lockActiveSaleProducts','maybeChangeSameProductStock','crypto','Router','z','prisma','ensurePreparationBatchTable','tableOrderPayloadHash','tableOrderReplay','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(()=>false,forbidden,forbidden,forbidden,crypto,express.Router,z,db,forbidden,forbidden,forbidden,requireStaffGrant,staffError);
 const modules=await modulesFor(db),app=await listen(db,'/api/store-pos',router,modules.requireCompanyModule('STORE_MODE'));
 try{
  for(const suffix of ['','/history?from=2026-11-01&to=2026-11-18','/preparation-queue']){
   const path='/stores/store/table-service'+suffix;capabilities=['table-service.read'];configActive=true;
   const result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');
   if(!suffix){assert.equal(result.body.canConfigure,false);assert.equal(result.body.orders[0].total,4.2);assert.equal(result.body.orders[0].items[0].quantity,2);assert.equal(result.body.orders[0].tablePaidCents,100);assert.equal(Object.hasOwn(result.body.orders[0],'cashParts'),false)}
   else if(suffix.startsWith('/history'))assert.equal(result.body.orders[0].items[0].unitPrice,2.1);
   else{assert.equal(result.body.rows[0].items[0].quantity,2);assert.equal(Object.hasOwn(result.body.rows[0],'itemsJson'),false)}
   const before=reads;for(const input of [{path:path.replace('/store/','/foreign/'),header:'foreign'},{path:path.replace('/store/','/foreign/')},{path,header:''},{path,method:'POST'},{path,method:'PATCH'},{path,method:'DELETE'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
   capabilities=['baking.read'];assert.equal((await app.request(path)).status,403);capabilities=['table-service.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;configActive=false;assert.equal((await app.request(path)).status,403);configActive=true;
   withdrawConfig=true;const disabled=await app.request(path);assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'orders'),false);assert.equal(Object.hasOwn(disabled.body,'rows'),false);withdrawConfig=false;configActive=true;
   withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'orders'),false);assert.equal(Object.hasOwn(revoked.body,'rows'),false);withdraw=false;
  }
 }finally{await app.close()}
});

test('native managed online orders keep selected-store financial evidence read-only and withhold withdrawn access',async()=>{
 let capabilities=['online-orders.read'],moduleActive=true,configActive=true,withdraw=false,withdrawConfig=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'ONLINE_ORDERING',active:moduleActive}]})},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "Store" s JOIN "OnlineOrderingConfig"')){assert.match(sql,/oc\."enabled"=TRUE/);assert.ok(values.includes('company'));return configActive?[{id:'store',companyId:'company',name:'Synthetic online store',active:true}]:[];}
   if(sql.includes('FROM "OnlineOrderingConfig"'))return [{enabled:configActive}];
   reads++;
   if(sql.includes('FROM "OnlineOrder" o WHERE')){
    assert.match(sql,/o\."companyId"=\?/);assert.match(sql,/o\."storeId"=\?/);assert.match(sql,/s\."companyId"=o\."companyId"/);assert.match(sql,/s\."storeId"=o\."storeId"/);
    if(withdraw)capabilities=[];if(withdrawConfig)configActive=false;
    return [{id:'order',idempotencyKey:'PRIVATE-ORDER-KEY',saleId:'sale',orderNumber:'S-001',fulfillmentType:'PICKUP',subtotal:'4.20',deliveryFee:'0',total:'4.20',items:[{productId:'product',productName:'Synthetic item',quantity:'2',onlineUnitPrice:'2.10',lineTotal:'4.20'}],sale:{id:'sale',total:'4.20',payments:[{method:'CARD',amount:'4.20'}]},shiftTransaction:{id:'transaction',amount:'4.20'}}];
   }
   if(sql.includes('FROM "StockMovement"')&&sql.includes('HAVING COUNT(*)>1'))return [];
   if(sql.includes('FROM "StockMovement"'))return [{id:'movement',idempotencyKey:'PRIVATE-MOVEMENT-KEY',sourceId:'order',productId:'product',movementType:'SALE',quantity:'-2'}];
   if(sql.includes('FROM "FiscalDocument"'))return [{saleId:'sale',count:1}];
   if(sql.includes('FROM "OnlineOrder"'))return [{saleId:'sale',count:1}];
   if(sql.includes('FROM "PaymentDeviceRouteAttempt" a LEFT JOIN'))return [{saleId:'sale',sessionId:'session',terminalPos:'MAIN'}];
   if(sql.includes('FROM "PaymentDeviceRouteAttempt"'))return [{id:'attempt',saleId:'sale',sessionId:'session',terminalPos:'MAIN',role:'STORE',amount:'4.20',status:'COMPLETED'}];
   if(sql.includes('FROM "StoreOperatorAudit"'))return [{saleId:'sale',inventoryWarnings:[]}];
   if(sql.includes('FROM "Product" p JOIN "StoreProduct"'))return [{id:'product'}];
   assert.fail('unexpected online read: '+sql.slice(0,100));
  }
 };
 const modules=await modulesFor(db),auth=(_req,_res,next)=>next();
 const source=await readFile(new URL('../src/routes/kat-online-ordering-modifiers.js',import.meta.url),'utf8');
 const env={Router:express.Router,crypto,bcrypt:{compare:forbidden},jwt:{sign:forbidden,verify:forbidden},z,prisma:db,auth,companyModuleState:modules.companyModuleState,effectiveModuleEnabled:modules.effectiveModuleEnabled,
  createRegistrationLimiter:()=>auth,memberDiscountPercent:()=>0,requireStaffGrant,staffError,ensureKatOnlineOrderingSchema:forbidden,ensureStoreBakingSchema:forbidden,
  registerOnlineMember:forbidden,normalizeMemberPhone:forbidden,assertCustomerDemoRuntimeClosed:()=>{},automaticOnlineAvailable:forbidden,readAutomaticStockCatalog:forbidden,lockActiveSaleProducts:forbidden,policyAvailable:forbidden,getOnlineOrderingConfig:forbidden,onlineSurchargeAmount:forbidden,onlineUnitPrice:forbidden};
 const router=new Function(...Object.keys(env),source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;').replace(/^export /gm,''))(...Object.values(env));
 const app=await listen(db,'/api/public/kat',router);
 try{
  const path='/backoffice-managed/stores/store/orders';const result=await app.request(path);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.store.id,'store');assert.equal(result.body.rows[0].total,4.2);assert.equal(result.body.rows[0].items[0].quantity,2);assert.equal(result.body.rows[0].sale.payments[0].amount,4.2);assert.equal(result.body.rows[0].stockMovements[0].quantity,-2);assert.equal(result.body.rows[0].integrity.ok,true);assert.equal(result.body.rows[0].directSharedStockQuantity,2);assert.equal(JSON.stringify(result.body).includes('PRIVATE-'),false);
  const before=reads;for(const input of [{path:path.replace('/store/','/foreign/'),header:'foreign'},{path:path.replace('/store/','/foreign/')},{path,header:''},{path,method:'POST'},{path,method:'PATCH'},{path:'/backoffice-managed/stores'},{path:'/backoffice/stores/store/orders'},{path:'/pos/stores/store/orders'}]){const {path:target,...options}=input;assert.equal((await app.request(target,options)).status,403,JSON.stringify(input))}assert.equal(reads,before);
  capabilities=['table-service.read'];assert.equal((await app.request(path)).status,403);capabilities=['online-orders.read'];moduleActive=false;assert.equal((await app.request(path)).status,403);moduleActive=true;configActive=false;assert.ok([403,404].includes((await app.request(path)).status));configActive=true;
  withdrawConfig=true;const disabled=await app.request(path);assert.ok([403,404].includes(disabled.status),JSON.stringify(disabled));assert.equal(Object.hasOwn(disabled.body,'rows'),false);withdrawConfig=false;configActive=true;
  withdraw=true;const revoked=await app.request(path);assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'rows'),false);withdraw=false;const after=reads;assert.equal((await app.request(path)).status,403);assert.equal(reads,after);
 }finally{await app.close()}
});

test('actual early table composition sends only exact authenticated delegated reads before generic POS bootstrap',async()=>{
 let capabilities=['table-service.read'],nativeReads=0,legacyReads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:true},{moduleKey:'TABLE_SERVICE',active:true}]})},
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return [];assert.fail('unexpected composition data query')},$executeRaw:forbidden,$executeRawUnsafe:forbidden};
 const modules=await modulesFor(db),source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 const marker='app.use("/api/store-pos",(req,res,next)=>{',start=source.indexOf(marker),end=source.indexOf('\n});',start)+5;
 assert.ok(start>=0&&end>start);assert.ok(start<source.indexOf('app.use("/api/store-pos",auth,requireCompanyModule("STORE_MODE"),storePosCatalogRoutes)'));assert.ok(start<source.indexOf('app.use("/api/store-pos",auth,requireCompanyModule("STORE_MODE"),posSaleActionsRoutes)'));
 const app=express();
 const auth=async(req,res,next)=>{req.user=req.get('x-owner')?{id:'owner',companyId:'company',role:'OWNER'}:staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}};
 const native=(req,res)=>{nativeReads++;assert.equal(req.staffGrant.capability,'table-service.read');res.json({native:true,path:req.path,storeId:req.user.storeId})};
 new Function('app','auth','requireCompanyModule','storeTableOrdersRoutes',source.slice(start,end))(app,auth,modules.requireCompanyModule,native);
 app.use('/api/store-pos',auth,(_req,res)=>{legacyReads++;res.json({legacy:true})});app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 const request=async(suffix,{method='GET',owner=false,header='store'}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/store-pos${suffix}`,{method,headers:{'x-backoffice-store-id':header,...(owner?{'x-owner':'true'}:{})}});return {status:response.status,body:await response.json()}};
 try{
  for(const suffix of ['','/history','/preparation-queue']){const result=await request('/stores/store/table-service'+suffix);assert.equal(result.status,200);assert.equal(result.body.native,true);assert.equal(result.body.storeId,'store')}
  assert.equal(nativeReads,3);assert.equal(legacyReads,0);
  for(const [suffix,options] of [['/stores/store/table-service',{method:'POST'}],['/stores/store/table-service/history',{method:'DELETE'}],['/stores/store/table-service/unknown',{}],['/stores/foreign/table-service',{header:'foreign'}],['/stores/store/table-service',{header:''}]])assert.equal((await request(suffix,options)).status,403);
  assert.equal(nativeReads,3);assert.equal(legacyReads,0);capabilities=['products.read'];assert.equal((await request('/stores/store/table-service')).status,403);assert.equal(nativeReads,3);
  const owner=await request('/stores/store/table-service',{owner:true});assert.equal(owner.status,200);assert.equal(owner.body.legacy,true);assert.equal(legacyReads,1);assert.equal(nativeReads,3);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
