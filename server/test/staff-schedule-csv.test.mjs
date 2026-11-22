import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStaffScheduleCsv} from '../../client/src/components/platform/staff-schedule-csv.mjs';
import {validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('schedule CSV requires a separate grant and exports the visible shift fields only',()=>{
  assert.equal(validStaffCapabilities(['schedule.export']),false);
  assert.equal(validStaffCapabilities(['schedule.read','schedule.export']),true);
  const csv=buildStaffScheduleCsv([{date:'2026-11-22',employee:{fullName:'=1',pinHash:'private'},
    shiftTemplate:{name:'Πρωί',startTime:'08:00',endTime:'16:00'},slot:1,notes:'private'}]);
  assert.ok(csv.includes('"2026-11-22";"\'=1";"Πρωί";"08:00";"16:00";"1"'));
  assert.ok(!csv.includes('private'));
});
