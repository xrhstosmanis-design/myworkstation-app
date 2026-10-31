import test from 'node:test';
import assert from 'node:assert/strict';
import {staffRequestCapability,changeStaffCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';
import {createStaffInput,updateStaffInput,staffLoginInput} from '../src/services/backoffice-staff-accounts.js';
import {enforceBackofficeStaff,staffAccount,liveStaff} from '../src/services/backoffice-staff-access.js';
const grant={storeId:'store-a',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']};
const account={username:'counter.1',fullName:'Isolated Counter',password:'isolated-test-password',pin:'624918',grants:[grant]};
test('product view, creation and opening stock are independent explicit rights with dependency closure',()=>{
  const all=changeStaffCapability([],'products.opening-stock',true);
  assert.deepEqual(new Set(all),new Set(['products.read','products.create','products.opening-stock']));
  assert.equal(validStaffCapabilities(all),true);
  assert.deepEqual(changeStaffCapability(all,'products.create',false),['products.read']);
  assert.deepEqual(changeStaffCapability(all,'products.read',false),[]);
  assert.equal(validStaffCapabilities(['products.create']),false);
  assert.equal(validStaffCapabilities(['products.read','products.opening-stock']),false);
  for(const profile of ['MANAGER','STOCKTAKER','AUDITOR'])assert.equal(createStaffInput.safeParse({...account,grants:[{...grant,profile,capabilities:all}]}).success,true);
  assert.equal(staffRequestCapability('GET','/api/inventory-archive'),'products.read');
  assert.equal(staffRequestCapability('GET','/api/owner-products/new-card/options'),'products.create');
  assert.equal(staffRequestCapability('POST','/api/owner-products/new-card'),'products.create');
  for(const [method,path] of [['PATCH','/api/owner-products/p/card'],['POST','/api/owner-products/p/stock-adjustment'],['POST','/api/inventory-archive/import'],['POST','/api/inventory-archive/stock-transfer'],['GET','/api/owner-products/catalog']])assert.equal(staffRequestCapability(method,path),null);
});
test('owner chooses explicit rights independently of profile without role elevation or implicit finalization',()=>{
  assert.equal(createStaffInput.parse({...account,username:'Counter.1'}).username,'counter.1');
  assert.equal(createStaffInput.safeParse({...account,grants:[{...grant,capabilities:['cash.read']}]}).success,true);
  assert.equal(createStaffInput.safeParse({...account,grants:[{...grant,profile:'AUDITOR',capabilities:['inventory.read','inventory.count']}]}).success,true);
  assert.equal(createStaffInput.safeParse({...account,grants:[{...grant,profile:'MANAGER',capabilities:[]}]}).success,true);
  for(const body of [{...account,role:'OWNER'},{...account,grants:[{...grant,capabilities:['inventory.count']}]},{...account,grants:[{...grant,capabilities:['cash.read','cash.read']}]},{...account,grants:[{...grant,capabilities:['inventory.finalize']}]},{...account,grants:[grant,grant]},{...account,pin:'123'},{...account,password:'short'}])assert.equal(createStaffInput.safeParse(body).success,false);
  assert.equal(updateStaffInput.safeParse({expectedRevision:0,active:true,grants:[]}).success,false);
});
test('personal login requires exactly one credential and refuses scope/session injection',()=>{
  assert.equal(staffLoginInput.safeParse({username:'counter.1',pin:'624918'}).success,true);
  for(const body of [{username:'counter.1'},{username:'counter.1',pin:'624918',password:'anything'},{username:'counter.1',pin:'624918',companyId:'other'}])assert.equal(staffLoginInput.safeParse(body).success,false);
});
test('delegated request admission is an exact default-deny allowlist',()=>{
  assert.equal(staffRequestCapability('GET','/api/backoffice-staff/me'),'SESSION');
  assert.equal(staffRequestCapability('GET','/api/backoffice-staff/inventory/stores/s/stocktakes/st'),'inventory.read');
  assert.equal(staffRequestCapability('POST','/api/inventory-v2/stocktakes/st/count'),'inventory.count');
  for(const [method,path] of [['POST','/api/inventory-v2/stocktakes/st/finalize'],['POST','/api/inventory-v2/stocktakes/st/products'],['POST','/api/inventory-v2/stocktakes'],['GET','/api/inventory-v2/stocktakes/st'],['POST','/api/backoffice-staff/admin/accounts'],['GET','/api/platform/companies'],['POST','/api/transactions/stores/s'],['POST','/api/backoffice-staff/cash/stores/s'],['POST','/api/auth/owner-companies/select'],['GET','/api/backoffice-staff/me/'],['GET','/api/backoffice-staff/cash/stores/s/archive']])assert.equal(staffRequestCapability(method,path),null,path);
});
test('ordinary owner, operator and existing employee auth never queries new staff tables',async()=>{
  const db={$queryRaw:()=>assert.fail('unrelated identity queried new staff schema')};
  for(const user of [{role:'OWNER',tokenType:'BACKOFFICE_USER'},{role:'EMPLOYEE',tokenType:'BACKOFFICE_USER'},{role:'EMPLOYEE',tokenType:'STORE_OPERATOR'}])assert.equal(await enforceBackofficeStaff(db,{user},{}),true);
});
test('schema absence preserves old account discovery but never admits a signed staff identity',async()=>{
  let queries=0;const db={$queryRaw:async()=>{queries++;return [{relation:null}]}};
  assert.equal(await staffAccount(db,{id:'ordinary-user'}),null);assert.equal(queries,1);
  await assert.rejects(liveStaff({$queryRaw:async()=>[]},{id:'staff',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',companyId:'a',sessionVersion:0}),{code:'STAFF_SESSION_INVALID'});
});

test('PIN-first creation accepts four digits without weakening optional password or existing longer PINs',()=>{
  const {password,...pinOnly}=account;
  for(const pin of ['0483','624918','123456789012']){
    assert.equal(createStaffInput.safeParse({...pinOnly,pin}).success,true);
    assert.equal(staffLoginInput.safeParse({username:account.username,pin}).success,true);
    assert.equal(updateStaffInput.safeParse({expectedRevision:1,active:true,grants:[],pin}).success,true);
  }
  for(const pin of ['123','1234567890123','12a4',' 1234','１２３４'])assert.equal(createStaffInput.safeParse({...pinOnly,pin}).success,false);
  assert.equal(createStaffInput.safeParse({...pinOnly,password:'short'}).success,false);
  assert.equal(createStaffInput.safeParse({...pinOnly,password:''}).success,false);
  assert.equal(createStaffInput.safeParse({...pinOnly,password}).success,true);
});
