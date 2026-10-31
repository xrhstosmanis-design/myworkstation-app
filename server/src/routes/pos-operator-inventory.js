import {randomUUID} from "node:crypto";
import {Router} from 'express';
import {prisma} from '../prisma.js';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import smartEntry,{createOwnerProductSmartEntryRouter} from './owner-product-smart-entry.js';
import compositions,{createOwnerProductCompositionsRouter} from './owner-product-compositions.js';
import {createOwnerProductActionsRouter} from './owner-product-actions.js';
import {createOwnerProductsRouter} from './owner-products.js';
import {createInventoryArchiveRouter} from './inventory-archive.js';
import {createInventoryArchiveImportRouter,readWorkbook,prepareArchiveRows} from './inventory-archive-import.js';
import {ensureProductCompanySchema} from './management-product-companies.js';
import {ensureVatDepartmentSchema} from './management-vat-departments.js';
import {authorizePosInventory,inventoryAction,assertInventoryPayload,inventoryObjectIds,assertInventoryObjects,inventoryStockSnapshot,assertInventoryStockUnchanged,inventoryLifecycle,inventoryDenied} from '../services/pos-inventory-access.js';

// Nested canonical services share this one atomic transaction. A response is
// buffered until commit; an HTTP error from any original handler rolls it back.
export function inventoryTransactionDb(tx){
 let facade;
 facade=new Proxy(tx,{get(target,key){
  if(key==='$transaction')return async callback=>{
   if(typeof callback!=='function')throw new Error('Inventory requires an interactive transaction');
   return callback(facade);
  };
  const value=Reflect.get(target,key,target);
  return typeof value==='function'?value.bind(target):value;
 }});
 return facade;
}
export function invokeInventoryRouter(router,req){
 return new Promise((resolve,reject)=>{
  let status=200;const headers={};
  const response={locals:{},status(code){status=code;return this},setHeader(key,value){headers[key]=value;return this},set(key,value){if(typeof key==='object')Object.assign(headers,key);else headers[key]=value;return this},getHeader:key=>headers[key],json(data){
   const result={status,headers,data};
   if(status>=400)reject(Object.assign(new Error(data?.error||'Αποτυχία Αποθήκης.'),{inventoryResponse:result,status,code:data?.code}));
   else resolve(result);return this;
  }};
  router.handle(req,response,error=>reject(error||inventoryDenied()));
 });
}
async function modules(db,scope){
 const state=await companyModuleState(scope.companyId,{db});
 if(!state?.licenseAllowed)throw inventoryDenied('Η άδεια δεν είναι ενεργή.','LICENSE_INACTIVE');
 for(const key of ['STORE_MODE','INVENTORY']){
  const rows=await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${scope.storeId} AND "moduleKey"=${key} FOR SHARE`;
  if(!effectiveModuleEnabled(state.activeModules.includes(key),rows[0]?{...rows[0],configured:true}:{configured:false}))throw inventoryDenied('Το module δεν είναι ενεργό για το κατάστημα.','MODULE_DISABLED');
 }
}
export function createPosOperatorInventoryRouter({db=prisma,prepare=async()=>{
 await smartEntry.prepare();await compositions.prepare();
 await ensureProductCompanySchema();await ensureVatDepartmentSchema();
}}={}){
 const router=Router();
 router.use('/stores/:storeId/inventory',async(req,res,next)=>{
  try{
   const storeId=req.params.storeId,action=inventoryAction(req.method,req.path);
   // No schema preparation or transaction before the actual operator's live grant.
   const initial=await authorizePosInventory(db,req.user,storeId,{lock:false});
   assertInventoryPayload(initial,action,req.query,req.body);
   await modules(db,initial);
   await prepare();
   const result=await db.$transaction(async raw=>{
    const tx=inventoryTransactionDb(raw),scope=await authorizePosInventory(tx,req.user,storeId);
    await modules(tx,scope);
    assertInventoryPayload(scope,action,req.query,req.body);
    const lifecycle=await inventoryLifecycle(tx,scope,action.write,req.get('X-Inventory-Generation'));
    if(lifecycle.maintenance||lifecycle.retired)throw inventoryDenied('Το κατάστημα βρίσκεται σε συντήρηση.','STORE_LIFECYCLE_MAINTENANCE',409);
    await assertInventoryObjects(tx,scope,inventoryObjectIds(action,req.body),{lock:Boolean(action.write)});
    if(['import','import-preview'].includes(action.kind)){
     const rawRows=readWorkbook(req.body?.dataUrl);
     // Source-specific catalog migrations are central administration workflows.
     if(rawRows.sourceProfile)throw inventoryDenied('Η εισαγωγή ειδικού καταλόγου γίνεται από την κεντρική διαχείριση.');
     const rows=await prepareArchiveRows(tx,scope.companyId,rawRows,storeId);
     if(rows.some(row=>Number(row.stock??0)!==0))throw inventoryDenied('Η εισαγωγή από POS δεν επιτρέπεται να περιέχει απόθεμα.','POS_INVENTORY_STOCK_DENIED');
     await assertInventoryObjects(tx,scope,[...new Set(rows.map(row=>row.productId).filter(Boolean))],{lock:Boolean(action.write)});
    }
    let response;
    if(action.kind==='access')response={status:200,data:{ok:true}};
    else if(action.kind==='suppliers')response={status:200,data:await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${scope.companyId} AND "active"=true ORDER BY "name"`};
    else{
     const before=action.write?await inventoryStockSnapshot(tx,scope):null;
     const delegated=Router();
     const factories=action.family==='archive'?[createInventoryArchiveRouter]:action.family==='import'?[createInventoryArchiveImportRouter]:[createOwnerProductSmartEntryRouter,createOwnerProductCompositionsRouter,createOwnerProductActionsRouter,createOwnerProductsRouter];
     for(const factory of factories)delegated.use(factory({db:tx,scope}));
     // A shallow request retains the real identity, headers and Express helpers.
     const child=Object.create(req);
     child.url=action.path+(req.url.includes('?')?'?'+req.url.split('?').slice(1).join('?'):'');
     child.originalUrl=req.originalUrl;child.baseUrl=req.baseUrl;child.params={};
     child.query={...req.query,storeId};child.body=req.body;
     response=await invokeInventoryRouter(delegated,child);
     if(action.write)await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${randomUUID()},${scope.companyId},${storeId},${scope.actorId},${scope.actorId},'POS_INVENTORY_ACTION',${JSON.stringify({action:action.kind,productIds:inventoryObjectIds(action,req.body),requestId:req.body?.requestId||null,terminalPos:scope.terminalPos,actorName:scope.actorName,employeeId:scope.employeeId})}::jsonb)`;
     if(before)assertInventoryStockUnchanged(before,await inventoryStockSnapshot(tx,scope));
    }
    return {...response,data:{data:response.data,scope:{actorId:scope.actorId,storeId},capabilities:scope.capabilities,lifecycle}};
   },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:120000});
   res.set('Cache-Control','no-store');res.status(result.status).json(result.data);
  }catch(error){
   if(error.inventoryResponse)return res.status(error.inventoryResponse.status).json(error.inventoryResponse.data);
   if(error.code==='P2034'||error.code==='40001'||error.meta?.code==='40001')return res.status(409).json({error:'Τα στοιχεία άλλαξαν ταυτόχρονα. Κάνε ανανέωση και προσπάθησε ξανά.',code:'POS_INVENTORY_CONCURRENT_CHANGE'});
   next(error);
  }
 });
 return router;
}
export default createPosOperatorInventoryRouter();
