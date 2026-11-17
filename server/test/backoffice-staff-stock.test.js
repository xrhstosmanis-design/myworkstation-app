import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {greeceRangeDate} from '../../shared/greece-time.mjs';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

test('native stock movements enforce scoped independent grants, read-only loss entitlement and current revocation',async()=>{
 let capabilities=['products.read','stock.read'],inventory=true,loss=false,override=null,withdraw=false,productExists=true,disableLossDuringRead=false,reads=0,reconciliations=0;
 const forbidden=()=>assert.fail('delegated stock read attempted schema bootstrap or a mutation');
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active:inventory},{moduleKey:'LOSS_DETECTION',active:loss}]})},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return sql.includes("'LOSS_DETECTION'")&&override!==null?[{active:override}]:[];
   reads++;assert.ok(values.includes('store'));assert.ok(values.includes('product')||values.includes('missing'));assert.equal(values.includes('foreign'),false);
   if(sql.includes('FROM "Product" p JOIN "StoreProduct" sp')){
    assert.ok(sql.includes('p."companyId"=? AND st."companyId"=?'));assert.ok(sql.includes('p."id"=? AND sp."storeId"=?'));
    return productExists&&values.includes('product')?[{id:'product',name:'Synthetic product',sku:'sku',currentStock:8}]:[];
   }
   if(withdraw)capabilities=['products.read'];if(disableLossDuringRead)override=false;
   if(sql.includes('AS "ledgerStock"')){reconciliations++;assert.ok(values.includes('company'));return [{movementCount:2,ledgerStock:8}];}
   if(sql.includes('HAVING COUNT(*)>1')){reconciliations++;assert.ok(values.includes('company'));return [];}
   if(sql.includes('FROM "StockMovement" sm LEFT'))return [{id:'movement',createdAt:new Date('2026-11-17T08:00Z'),movementType:'ADJUSTMENT',quantity:2,unitCost:1,salePrice:null}];
   return [];
  }
 };
 const moduleSource=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
 const modules=new Function('prisma','ownerRestrictedModuleKeys',moduleSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {companyModuleState,effectiveModuleEnabled,isPlatformSuperAdmin,requireCompanyModule};')(db,ownerRestrictedModuleKeys);
 const guardSource=await readFile(new URL('../src/middleware/owner-product-access.js',import.meta.url),'utf8');
 const guard=new Function('staffProductBridge',guardSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn requireOwnerProductAccess;')((_req,res)=>res.status(403).json({error:'not delegated'}));
 const source=await readFile(new URL('../src/routes/inventory-product-ledger.js',import.meta.url),'utf8');
 const router=new Function('Router','prisma','greeceRangeDate','companyModuleState','effectiveModuleEnabled','isPlatformSuperAdmin','requireCompanyModule','storePaidModuleState','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(express.Router,db,greeceRangeDate,modules.companyModuleState,modules.effectiveModuleEnabled,modules.isPlatformSuperAdmin,modules.requireCompanyModule,forbidden,requireStaffGrant,staffError);
 const app=express();app.use(async(req,res,next)=>{req.user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}});app.use('/api/inventory-ledger',guard,router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
 const request=async({store='store',header='store',product='product',method='GET',dates='&from=2026-11-01&to=2026-11-17',suffix='movements'}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/inventory-ledger/${product}/${suffix}?storeId=${store}${dates}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()};};
 try{
  const result=await request();assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.product.currentStock,8);assert.equal(result.body.movements[0].inQty,2);assert.equal(result.body.reconciliation,null);assert.equal(result.body.reconciliationAccess.allowed,false);assert.equal(reconciliations,0);
  const before=reads;for(const input of [{store:'sibling'},{store:'foreign',header:'foreign'},{store:''},{method:'POST'},{suffix:'stock-adjustment'},{suffix:'movements/delete'}])assert.equal((await request(input)).status,403,JSON.stringify(input));assert.equal(reads,before);
  capabilities=['products.read'];assert.equal((await request()).status,403);capabilities=['products.read','stock.read'];inventory=false;assert.equal((await request()).status,403);inventory=true;
  assert.equal((await request({dates:'&from=2026-11-18&to=2026-11-01'})).status,400);
  productExists=false;const missing=await request({product:'missing'});assert.equal(missing.status,404);assert.equal(Object.hasOwn(missing.body,'movements'),false);productExists=true;
  loss=true;const entitled=await request();assert.equal(entitled.status,200);assert.equal(entitled.body.reconciliationAccess.allowed,true);assert.equal(entitled.body.reconciliation.status,'AGREEMENT');assert.equal(reconciliations,2);
  override=false;const disabled=await request();assert.equal(disabled.body.reconciliationAccess.allowed,false);assert.equal(reconciliations,2);
  override=true;loss=false;assert.equal((await request()).body.reconciliationAccess.allowed,true);assert.equal(reconciliations,4);
  disableLossDuringRead=true;const entitlementRevoked=await request();assert.equal(entitlementRevoked.status,409);assert.equal(entitlementRevoked.body.code,'STAFF_SOURCE_CHANGED');assert.equal(Object.hasOwn(entitlementRevoked.body,'movements'),false);disableLossDuringRead=false;
  withdraw=true;const revoked=await request();assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'movements'),false);withdraw=false;const after=reads;assert.equal((await request()).status,403);assert.equal(reads,after);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
