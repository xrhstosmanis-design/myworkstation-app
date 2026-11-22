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
  const writer=route.slice(route.indexOf('router.patch("/stores/:storeId/employee-permissions'),route.indexOf("export default router"));
  assert.match(writer,/\$transaction[\s\S]*requireStaffAction\(tx/);
  assert.match(writer,/c\."companyId"[\s\S]*c\."storeId"[\s\S]*c\."role"='EMPLOYEE'/);
  assert.match(writer,/e\."userId" IS DISTINCT FROM/);
  assert.match(writer,/FOR UPDATE OF c,e/);
  assert.match(writer,/before!==expected/);
  assert.match(writer,/jsonb_set\("permissions"/);
  assert.match(writer,/'OPERATOR_PERMISSION_UPDATED'/);
  assert.doesNotMatch(writer,/"pinHash"|"powerUser"|"backofficeAccess"/);
});
