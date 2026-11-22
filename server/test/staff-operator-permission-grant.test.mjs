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
