import test from 'node:test';
import assert from 'node:assert/strict';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';
import {createStaffInput,updateStaffInput,staffLoginInput} from '../src/services/backoffice-staff-accounts.js';
import {enforceBackofficeStaff,staffAccount,liveStaff} from '../src/services/backoffice-staff-access.js';
const grant={storeId:'store-a',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']};
const account={username:'counter.1',fullName:'Isolated Counter',password:'isolated-test-password',pin:'624918',grants:[grant]};
test('staff profiles cannot elevate role, cross-profile capabilities or implicitly enable finalization',()=>{
  assert.equal(createStaffInput.parse({...account,username:'Counter.1'}).username,'counter.1');
  for(const body of [{...account,role:'OWNER'},{...account,grants:[{...grant,capabilities:['cash.read']}]},{...account,grants:[{...grant,capabilities:['inventory.count']}]},{...account,grants:[grant,grant]},{...account,pin:'1234'},{...account,password:'short'}])assert.equal(createStaffInput.safeParse(body).success,false);
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
