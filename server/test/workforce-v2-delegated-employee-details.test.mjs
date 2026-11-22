import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staffProfiles,staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

const base='/api/platform/store-modules/companies/company/stores/store/workforce-v2/employees';
const route=readFileSync(new URL('../src/routes/platform-workforce-v2-employees.js',import.meta.url),'utf8');

test('employee detail grant is opt-in and permits only its narrow PATCH',()=>{
  assert.ok(!staffProfiles.MANAGER.capabilities.includes('employees.edit'));
  assert.equal(validStaffCapabilities(['employees.edit']),false);
  assert.equal(validStaffCapabilities(['employees.read','employees.edit']),true);
  assert.equal(staffRequestCapability('PATCH',base+'/employee/details'),'employees.edit');
  for(const [method,path] of [['POST',base],['PUT',base+'/employee'],['PATCH',base+'/employee/status'],['POST',base+'/employee/work-card']]){
    assert.equal(staffRequestCapability(method,path),null);
  }
});

test('employee detail mutations recheck authority, store assignment and current revision in the audit transaction',()=>{
  const writer=route.slice(route.indexOf('router.patch("/:employeeId/details"'),route.indexOf('router.patch("/:employeeId/status"'));
  assert.match(writer,/\.strict\(\)/);
  assert.match(writer,/companyId:company\.id,baseStoreId:store\.id,active:true/);
  assert.match(writer,/none:\{active:true,storeId:\{not:store\.id\}\}/);
  assert.match(writer,/\$transaction[\s\S]*requireStaffAction\(tx/);
  assert.match(writer,/updateMany\([\s\S]*updatedAt:new Date\(body\.expectedUpdatedAt\)/);
  assert.match(writer,/await audit\(tx/);
  assert.doesNotMatch(writer,/pinHash|hourlyRate|roleIds|paymentType/);
});
