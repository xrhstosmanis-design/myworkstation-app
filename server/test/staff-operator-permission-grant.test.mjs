import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffRequestCapability,validStaffCapabilities,staffProfiles} from '../../shared/backoffice-staff.mjs';

const capability='operator-profiles.manage-permissions';
const base='/api/operator-management/stores/store/employee-permissions';
const route=readFileSync(new URL('../src/routes/operator-permission-delegation.js',import.meta.url),'utf8');

test('operator permission delegation admits only the dedicated store list and single-employee change',()=>{
  assert.equal(validStaffCapabilities([capability]),true);
  assert.ok(!staffProfiles.MANAGER.capabilities.includes(capability));
  assert.equal(staffRequestCapability('GET',base),capability);
  assert.equal(staffRequestCapability('PATCH',base+'/employee'),capability);
  for(const [method,path] of [
    ['PATCH',base],['POST',base+'/employee'],['GET',base+'/employee'],
    ['PATCH','/api/operator-management/stores/store/operators/employee'],
    ['POST','/api/operator-management/stores/store/operators/employee/pin']
  ])assert.equal(staffRequestCapability(method,path),null);
});

test('delegated mutation rechecks the live grant and updates only one POS flag inside its audit transaction',()=>{
  const writer=route.slice(route.indexOf('router.patch("/stores/:storeId/employee-permissions'),route.indexOf("const accessChange"));
  const target=route.slice(route.indexOf("async function lockEmployeeOperator"),route.indexOf("router.get("));
  assert.match(writer,/\$transaction[\s\S]*requireStaffAction\(tx/);
  assert.match(target,/c\."companyId"[\s\S]*c\."storeId"[\s\S]*c\."role"='EMPLOYEE'/);
  assert.match(target,/e\."userId" IS DISTINCT FROM/);
  assert.match(target,/FOR UPDATE OF c,e/);
  assert.match(writer,/before!==expected/);
  assert.match(writer,/jsonb_set\("permissions"/);
  assert.match(writer,/'OPERATOR_PERMISSION_UPDATED'/);
  assert.doesNotMatch(writer,/"pinHash"|"powerUser"|"backofficeAccess"/);
});


test('the POS orders flag uses the same setting that the operator runtime reads',()=>{
  const catalog=readFileSync(new URL('../src/routes/store-pos-catalog.js',import.meta.url),'utf8');
  const owner=readFileSync(new URL('../../client/src/components/commerce/OperatorManagementPanel.jsx',import.meta.url),'utf8');
  const manager=readFileSync(new URL('../../client/src/components/backoffice/StaffOperatorPermissions.jsx',import.meta.url),'utf8');
  assert.match(catalog,/purchaseOrders:row.backofficeMenu\?\.orders===true/);
  assert.match(owner,/items=\{POS_MENU_PERMISSIONS\}/);
  assert.match(manager,/\[\.\.\.POS_PERMISSIONS,\.\.\.POS_MENU_PERMISSIONS\]/);
  assert.match(route,/profile\?\.backofficeMenu\?\.orders===true/);
  assert.match(route,/jsonb_set\("backofficeMenu",'\{orders\}'/);
  assert.match(route,/jsonb_build_object\('orders'/);
});

test('POS access changes need their own opt-in capability and cannot target the ordinary flag writer',()=>{
  const posAccess='operator-profiles.manage-pos-access';
  const path=base+'/employee/pos-access';
  assert.equal(validStaffCapabilities([posAccess]),false);
  assert.equal(validStaffCapabilities([capability,posAccess]),true);
  assert.ok(!staffProfiles.MANAGER.capabilities.includes(posAccess));
  assert.equal(staffRequestCapability('PATCH',path),posAccess);
  assert.equal(staffRequestCapability('GET',path),null);
  assert.equal(staffRequestCapability('PATCH',path+'/more'),null);
  const writer=route.slice(route.indexOf('const accessChange'));
  assert.match(writer,/requireStaffAction\(tx,req,storeId,delegatedPosAccess\)/);
  assert.match(writer,/lockEmployeeOperator[\s\S]*STAFF_OPERATOR_OPEN_SHIFT[\s\S]*UPDATE "StoreOperatorProfile"/);
  assert.match(writer,/"openedBy"=\$\{credential.id\} AND "status"='OPEN'/);
  assert.match(writer,/UPDATE "StoreOperatorSession" SET "revokedAt"=NOW\(\)/);
  assert.match(writer,/OPERATOR_POS_ACCESS_UPDATED/);
});

test('a concurrent POS shift open shares the credential lock and rereads access before inserting',()=>{
  const cash=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
  const open=cash.slice(cash.indexOf('const insertSession=db=>'),cash.indexOf('let safeChange='));
  assert.match(open,/prisma\.\$transaction[\s\S]*FROM "StoreOperatorCredential"[\s\S]*FOR UPDATE/);
  assert.match(open,/FOR UPDATE[\s\S]*COALESCE\(p\."posAccess",TRUE\)[\s\S]*"revokedAt" IS NULL[\s\S]*insertSession\(tx\)/);
});

test('new operator provisioning is independently scoped and grants no POS access',()=>{
  const right='operator-profiles.create-employee';
  const path='/api/operator-management/stores/store/employee-provisioning';
  assert.equal(staffRequestCapability('POST',path),right);
  assert.equal(staffRequestCapability('PATCH',path),null);
  assert.equal(validStaffCapabilities([right]),false);
  assert.equal(validStaffCapabilities([capability,right]),true);
  const handler=route.slice(route.indexOf('const delegatedProvisioning='));
  assert.match(handler,/\.strict\(\)/);
  assert.match(handler,/await bcrypt\.hash\(initialPin,12\)/);
  assert.match(handler,/\$transaction[\s\S]*requireStaffAction\(tx[\s\S]*pg_advisory_xact_lock/);
  assert.match(handler,/'EMPLOYEE',[^\n]*pinHash/);
  assert.match(handler,/\$\{employeeId\},FALSE,\$\{actorId\}/);
  assert.match(handler,/json\(\{companyId,storeId,employeeId\}\)/);
});

test('existing operator PIN reset is opt-in, scoped and audited without recording the secret',()=>{
  const right='operator-profiles.reset-pin';
  const path=base+'/employee/pin';
  assert.equal(staffRequestCapability('POST',path),right);
  assert.equal(staffRequestCapability('POST',path+'/random'),null);
  assert.equal(staffRequestCapability('GET',path),null);
  assert.equal(validStaffCapabilities([right]),false);
  assert.equal(validStaffCapabilities([capability,right]),true);
  assert.ok(!staffProfiles.MANAGER.capabilities.includes(right));
  const handler=route.slice(route.indexOf('const delegatedPinReset='),route.indexOf('const delegatedProvisioning='));
  assert.match(handler,/await bcrypt\.hash\(pin,12\)/);
  assert.match(handler,/\$transaction[\s\S]*requireStaffAction\(tx,req,storeId,delegatedPinReset\)[\s\S]*lockEmployeeOperator/);
  assert.match(handler,/UPDATE "StoreOperatorCredential"[\s\S]*UPDATE "StoreOperatorSession"[\s\S]*'OPERATOR_PIN_CHANGED'/);
  assert.match(handler,/JSON\.stringify\(\{employeeId\}\)/);
  assert.match(handler,/res\.json\(\{companyId,storeId,employeeId,changed:true\}\)/);
});

test('POS PIN login compares the verified hash under the credential lock',()=>{
  const login=readFileSync(new URL('../src/routes/store-operators.js',import.meta.url),'utf8');
  assert.match(login,/FOR UPDATE`[\s\S]*credential\.pinHash!==expectedPinHash[\s\S]*STORE_OPERATOR_PIN_CHANGED/);
  assert.match(login,/createOperatorSession\(req,operator,operator\.pinHash\)/);
});
