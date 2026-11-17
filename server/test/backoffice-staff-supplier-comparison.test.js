import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {staffProfiles,staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';

const capability='supplier-price-comparison.read';
test('supplier comparison is independently delegated through the canonical read with live withdrawal and scoped admission',async()=>{
  assert.equal(validStaffCapabilities([capability]),true);
  for(const profile of Object.values(staffProfiles))assert.equal(profile.capabilities.includes(capability),false);
  assert.equal(staffRequestCapability('GET','/api/commerce/supplier-price-comparison'),capability);
  for(const [method,path] of [['POST','/api/commerce/supplier-price-comparison'],['GET','/api/commerce/supplier-price-comparison/export'],['GET','/api/commerce/suppliers']])assert.equal(staffRequestCapability(method,path),null);
  let capabilities=[capability],revokeWhileReading=false,active=true,reads=0;
  const principal={id:'reader',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
  const db={company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active}]})},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return values.includes('store')?[{profile:'AUDITOR',capabilities}]:[];
    return [];
  }};
  const source=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
  const start=source.indexOf('router.get("/supplier-price-comparison",');
  const end=source.indexOf('\nrouter.post("/suppliers",',start);
  assert.ok(start>=0&&end>start);
  let handler;
  const result=[{productId:'product',supplierId:'supplier',lastCost:1.2}];
  new Function('router','requireStoreModule','prisma','readSupplierComparison','requireStaffGrant','staffError',source.slice(start,end))(
    {get:(_path,_guard,callback)=>{handler=callback}},()=>null,db,async(_db,scope)=>{
      assert.deepEqual(scope,{companyId:'company',storeId:'store',month:undefined});
      reads++;
      if(revokeWhileReading)capabilities=[];
      return result;
    },requireStaffGrant,staffError,
  );
  const app=express();
  app.use(async(req,res,next)=>{
    req.user={...principal};
    try{await enforceBackofficeStaff(db,req,res);req.targetStore={id:'store',companyId:'company'};next()}catch(error){next(error)}
  });
  app.get('/api/commerce/supplier-price-comparison',handler);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code}));
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value))});
  const request=async(query='store',header='store',method='GET')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/commerce/supplier-price-comparison?storeId=${query}`,{method,headers:{'x-backoffice-store-id':header}});
    return {status:response.status,body:await response.json()};
  };
  try{
    assert.deepEqual(await request(),{status:200,body:result});
    for(const args of [['other'],['store','other'],['foreign','foreign'],['store','store','POST']]){
      const before=reads;
      assert.equal((await request(...args)).status,403);
      assert.equal(reads,before);
    }
    capabilities=['products.read'];
    assert.equal((await request()).status,403);
    capabilities=[capability];active=false;
    assert.equal((await request()).status,403);
    active=true;revokeWhileReading=true;
    const denied=await request();
    assert.equal(denied.status,403);
    assert.equal(denied.body.productId,undefined);
    let ownerBody;
    capabilities=[];revokeWhileReading=false;
    await handler({user:{role:'OWNER',companyId:'company'},targetStore:{id:'store',companyId:'company'}},{json:value=>{ownerBody=value}},error=>{throw error});
    assert.deepEqual(ownerBody,result);
  }finally{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
  }
});

test('low-value report independently requires its explicit right and selected-store module',async()=>{
  const right='low-value-products.read';
  assert.equal(validStaffCapabilities([right]),true);
  for(const profile of Object.values(staffProfiles))assert.equal(profile.capabilities.includes(right),false);
  for(const path of ['/api/commerce/low-value-products/access','/api/commerce/low-value-products']){
    assert.equal(staffRequestCapability('GET',path),right);
    assert.equal(staffRequestCapability('POST',path),null);
    assert.equal(staffRequestCapability('GET',path+'/export'),null);
  }
  const user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:0};
  let capabilities=[right],enabled=true,storeOverride=null;
  const checkedModules=[];
  const db={company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'LOW_VALUE_PRODUCTS',active:enabled}]})},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return values.includes('store')?[{profile:'MANAGER',capabilities}]:[];
    if(sql.includes('FROM "StorePaidModule"')){checkedModules.push(values[1]);return storeOverride?[storeOverride]:[]}
    return [];
  }};
  await requireStaffGrant(db,user,'store',right);
  assert.deepEqual(checkedModules,['LOW_VALUE_PRODUCTS']);
  enabled=false;
  await assert.rejects(requireStaffGrant(db,user,'store',right),{code:'MODULE_DISABLED'});
  storeOverride={active:true};
  await requireStaffGrant(db,user,'store',right);
  storeOverride={active:false};enabled=true;
  await assert.rejects(requireStaffGrant(db,user,'store',right),{code:'MODULE_DISABLED'});
  storeOverride=null;capabilities=['products.read'];
  await assert.rejects(requireStaffGrant(db,user,'store',right),{code:'STAFF_ACCESS_DENIED'});
  capabilities=[right];
  await assert.rejects(requireStaffGrant(db,user,'other',right),{code:'STAFF_ACCESS_DENIED'});
});

test('sales analytics requires its view dependencies, three modules and an explicit matching selected store',async()=>{
  const right='analytics.read',capabilities=[right,'shifts.read','sales.read'];
  assert.equal(validStaffCapabilities([right]),false);
  assert.equal(validStaffCapabilities(capabilities),true);
  assert.equal(staffRequestCapability('GET','/api/commerce/sales/advanced-report'),right);
  assert.equal(staffRequestCapability('POST','/api/commerce/sales/advanced-report'),null);
  let activeModules=['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL'];
  const checked=[];
  const db={company:{findUnique:async()=>({active:true,licenseStatus:'ACTIVE',modules:activeModules.map(moduleKey=>({moduleKey,active:true}))})},$queryRaw:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
    if(sql.includes('FROM "BackofficeStaffGrant" g'))return [{profile:'AUDITOR',capabilities}];
    if(sql.includes('FROM "StorePaidModule"'))checked.push(values[1]);
    return [];
  }};
  const user={id:'staff',companyId:'company',role:'EMPLOYEE',staffAccess:true,tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:0};
  const request=query=>({user:{...user},originalUrl:'/api/commerce/sales/advanced-report',method:'GET',query,get:()=> 'store'});
  const response={setHeader(){}};
  const req=request({storeId:'store'});
  await enforceBackofficeStaff(db,req,response);
  assert.equal(req.staffGrant.capability,right);
  assert.deepEqual(checked,['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL']);
  for(const query of [{},{storeId:''},{storeId:'other'},{storeId:['store','other']}])await assert.rejects(enforceBackofficeStaff(db,request(query),response),{code:'STAFF_ACCESS_DENIED'});
  for(const missing of ['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL']){
    activeModules=['SALES_ANALYTICS','STORE_MODE','CASH_CONTROL'].filter(moduleKey=>moduleKey!==missing);
    await assert.rejects(enforceBackofficeStaff(db,request({storeId:'store'}),response),{code:'MODULE_DISABLED'});
  }
});
