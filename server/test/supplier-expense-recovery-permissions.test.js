import test from 'node:test';
import assert from 'node:assert/strict';
import {staffCapabilities,staffPermissionSections,staffRequestCapability,validStaffCapabilities,changeStaffCapability} from '../../shared/backoffice-staff.mjs';

test('recovery is an explicit grant requiring payment read and has no settlement approval authority',()=>{
 const key='payments.supplier-recovery';
 assert.equal(staffCapabilities.filter(c=>c===key).length,1);
 assert.equal(validStaffCapabilities([key]),false);
 assert.equal(validStaffCapabilities(['payments.read',key]),true);
 assert.deepEqual(staffPermissionSections.flatMap(s=>s.actions).find(a=>a.key===key).requires,['payments.read']);
 assert.ok(!changeStaffCapability([], 'approvals.read',true).includes(key));
 assert.deepEqual(changeStaffCapability([],key,true).sort(),['payments.read',key].sort());
 assert.ok(!changeStaffCapability(['payments.read',key],'payments.read',false).includes(key));
});
test('only three scoped recovery operations map to the dedicated capability',()=>{
 const root='/api/transactions/stores/store/invoice-recovery';
 for(const [method,path] of [['GET',root],['GET',root+'/payment/supplier'],['POST',root+'/payment/supplier']])assert.equal(staffRequestCapability(method,path),'payments.supplier-recovery');
 for(const [method,path] of [['POST',root],['DELETE',root+'/payment/supplier'],['POST',root+'/payment/original'],['POST',root+'/payment/assistant'],['POST',root+'/payment/confirm'],['POST',root+'/payment/supplier/extra']])assert.notEqual(staffRequestCapability(method,path),'payments.supplier-recovery');
});
test('central approval, reassociation and allocation paths retain their previous authority',()=>{
 assert.equal(staffRequestCapability('GET','/api/transactions/other-expenses/review'),'approvals.read');
 assert.notEqual(staffRequestCapability('POST','/api/transactions/other-expenses/review/supplier-advance'),'payments.supplier-recovery');
 assert.notEqual(staffRequestCapability('POST','/api/transactions/stores/store/supplier-advances/settlement/allocate'),'payments.supplier-recovery');
});
