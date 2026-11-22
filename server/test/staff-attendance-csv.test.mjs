import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStaffAttendanceCsv} from '../../client/src/components/platform/staff-attendance-csv.mjs';
import {staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('attendance export requires the existing report grant and keeps its read route',()=>{
  assert.equal(validStaffCapabilities(['attendance.export']),false);
  assert.equal(validStaffCapabilities(['attendance.read','attendance.export']),true);
  assert.equal(staffRequestCapability('GET','/api/platform/store-modules/companies/c/stores/s/workforce-v2/attendance'),'attendance.read');
});

test('attendance CSV neutralizes cell formulas, uses Athens time and omits private or financial fields',()=>{
  const csv=buildStaffAttendanceCsv('2026-11-22',[{
    employee:{fullName:' =1+1',id:'private-employee-id'},
    assignment:{shiftTemplate:{name:'A;"1"',startTime:'10:00',endTime:'18:00'}},
    startedAt:'2026-11-22T08:00:00Z',endedAt:'2026-11-22T15:55:00Z',
    scheduledMinutes:480,workedMinutes:475,varianceMinutes:-5,status:'NEEDS_REVIEW',
    hourlyRate:98765,workedAmount:43210,issues:[{message:'private audit text'}]
  }]);
  const [header,row]=csv.split('\r\n');
  assert.ok(header.startsWith('\uFEFF"Ημερομηνία αναφοράς"'));
  assert.ok(row.startsWith('"2026-11-22";"\' =1+1";"A;""1"" · 10:00–18:00";'));
  assert.match(row,/10:00.*17:55.*;480;475;-5;"Χρειάζεται έλεγχο"$/);
  assert.doesNotMatch(csv,/private-|private audit|98765|43210/);
});
