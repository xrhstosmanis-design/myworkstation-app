import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerPosNewProductRoutes,posNewProductAllowed} from '../src/lib/pos-new-product-card.js';
import {lookupInventoryProductBarcode} from '../src/lib/inventory-product-barcode-lookup.js';
import {requireOwnerProductAccess} from '../src/middleware/owner-product-access.js';

test('new product authority is explicit, never inherited from generic POS admin actions',()=>{
 assert.equal(posNewProductAllowed({role:'MANAGER'}),false);
 assert.equal(posNewProductAllowed({role:'EMPLOYEE'}),false);
 assert.equal(posNewProductAllowed({role:'OWNER'}),true);
 assert.equal(posNewProductAllowed({platformRole:'SUPER_ADMIN'}),true);
 for(const profile of [undefined,{permissions:{}},{permissions:{newProduct:'true'}},{permissions:{newProduct:true},posAccess:false}])assert.equal(posNewProductAllowed({tokenType:'STORE_OPERATOR',role:'MANAGER'},profile),false);
 assert.equal(posNewProductAllowed({tokenType:'STORE_OPERATOR',role:'EMPLOYEE'},{posAccess:true,permissions:{newProduct:true}}),true);
 let denied;requireOwnerProductAccess({user:{role:'EMPLOYEE',tokenType:'STORE_OPERATOR'}},{status(code){denied=code;return this},json(){}},()=>assert.fail('owner API opened to operator'));assert.equal(denied,403);
});

test('actual registered POS routes recheck persisted permission, scope, both module gates and online authority',async()=>{
 const profile={employeeId:'employee',displayName:'Current operator',terminalPos:'POS-02',posAccess:true,permissions:{newProduct:true,onlineBarcode:false}};
 let user={id:'credential',operatorId:'credential',companyId:'company',storeId:'A',tokenType:'STORE_OPERATOR',role:'EMPLOYEE'},storeEnabled=true,inventoryEnabled=true,revokeDuringModule=false,lookups=0;
 const calls=[],db={store:{findFirst:async({where})=>where.id==='A'&&where.companyId==='company'?{id:'A'}:null},$queryRaw:async(strings,...values)=>{
  const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('StoreOperatorCredential'))return profile.active===false?[]:[structuredClone(profile)];
  for(const name of ['Supplier','ManagementProductCompany','ManagementVatDepartment','ProductCategory','ProductSubcategory'])if(sql.includes('FROM "'+name+'"')){assert.ok(values.includes('company'));return [{id:name,name:'Allowed option'}]}
  throw Error('Unexpected fixture query: '+sql);
 }};
 const gates=[],gate=(name,enabled)=>(req,res,next)=>{gates.push(name);if(!enabled())return res.status(403).json({code:'MODULE_DISABLED',moduleKey:name});if(revokeDuringModule&&name==='INVENTORY')profile.permissions.newProduct=false;next()};
 const app=express(),router=express.Router();app.use(express.json());app.use((req,res,next)=>{req.user=user;next()});
 registerPosNewProductRoutes(router,db,{storeModule:gate('STORE_MODE',()=>storeEnabled),inventoryModule:gate('INVENTORY',()=>inventoryEnabled),lookup:async()=>{lookups++;return {found:false,source:null,product:null}}});app.use(router);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening))}),origin='http://127.0.0.1:'+server.address().port;
 const request=async(path='/stores/A/new-product/options',options)=>{const response=await fetch(origin+path,options);return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')}};
 try{
  const good=await request();assert.equal(good.status,200);assert.equal(good.cache,'no-store');assert.equal(good.body.suppliers.length,1);assert.equal(good.body.taxonomy.categories.length,1);assert.deepEqual(gates.slice(-2),['STORE_MODE','INVENTORY']);
  assert.equal((await request('/stores/B/new-product/options')).status,403);
  assert.equal((await request('/stores/A/new-product',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId:'B'})})).status,403);
  profile.permissions.newProduct=false;assert.equal((await request()).status,403);profile.permissions.newProduct=true;
  profile.posAccess=false;assert.equal((await request()).status,403);profile.posAccess=true;
  profile.active=false;assert.equal((await request()).status,403);profile.active=true;
  storeEnabled=false;assert.equal((await request()).body.moduleKey,'STORE_MODE');storeEnabled=true;
  inventoryEnabled=false;assert.equal((await request()).body.moduleKey,'INVENTORY');inventoryEnabled=true;
  revokeDuringModule=true;assert.equal((await request()).status,403);revokeDuringModule=false;profile.permissions.newProduct=true;
  assert.equal((await request('/stores/A/new-product/barcode/520000000001')).status,403);assert.equal(lookups,0);
  profile.permissions.onlineBarcode=true;assert.equal((await request('/stores/A/new-product/barcode/520000000001')).status,200);assert.equal(lookups,1);
  user={id:'manager',role:'MANAGER',companyId:'company'};assert.equal((await request()).status,403);
  user={id:'owner',role:'OWNER',companyId:'foreign'};assert.equal((await request()).status,404);
  user={id:'owner',role:'OWNER',companyId:'company'};assert.equal((await request()).status,200);
  assert.equal(calls.some(row=>/INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE/.test(row.sql)),false);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('shared lookup preserves local duplicate priority, Master preview and explicit bounded external fallback',async()=>{
 let mode='local',external=0;
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FROM "Product"')){assert.equal(values[0],'company');return mode==='local'?[{id:'existing',name:'Existing',vatRate:'13'}]:[]}if(sql.includes('MasterProduct'))return mode==='master'?[{name:'Master',vatRate:'24'}]:[];throw Error(sql)}};
 const fetchProduct=async(url,options)=>{external++;assert.match(url,/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/520000000001\?/);assert.ok(options.signal);return {ok:true,json:async()=>({status:1,product:{product_name_el:'Preview',brands:'Brand'}})}};
 assert.equal((await lookupInventoryProductBarcode(db,'company','520000000001',{fetchProduct})).source,'MYWORKSTATION');assert.equal(external,0);
 mode='master';assert.equal((await lookupInventoryProductBarcode(db,'company','520000000001',{fetchProduct})).source,'MASTER_CATALOG');assert.equal(external,0);
 mode='external';const result=await lookupInventoryProductBarcode(db,'company','520000000001',{fetchProduct});assert.equal(result.product.name,'Preview');assert.equal(result.product.vatRate,null);assert.equal(external,1);assert.equal('salePrice' in result.product,false);
 await assert.rejects(()=>lookupInventoryProductBarcode(db,'company','not-a-barcode',{fetchProduct}));assert.equal(external,1);
});
