import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStaffScheduleCsv,staffScheduleReportHeadings,staffScheduleReportRow} from '../../client/src/components/platform/staff-schedule-csv.mjs';
import {validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('schedule CSV requires a separate grant and exports the visible shift fields only',()=>{
  assert.equal(validStaffCapabilities(['schedule.export']),false);
  assert.equal(validStaffCapabilities(['schedule.read','schedule.export']),true);
  const csv=buildStaffScheduleCsv([{date:'2026-11-22',employee:{fullName:'=1',pinHash:'private'},
    shiftTemplate:{name:'Πρωί',startTime:'08:00',endTime:'16:00'},slot:1,notes:'private'}]);
  assert.ok(csv.includes('"2026-11-22";"\'=1";"Πρωί";"08:00";"16:00";"1"'));
  assert.ok(!csv.includes('private'));
});

test('schedule print requires its own grant and stays within the current scoped schedule',()=>{
  assert.equal(validStaffCapabilities(['schedule.print']),false);
  assert.equal(validStaffCapabilities(['schedule.read','schedule.print']),true);

  const view=readFileSync(new URL('../../client/src/components/platform/WorkforceV2ScheduleTab.jsx',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../../client/src/components/BackofficeStaffWorkspace.jsx',import.meta.url),'utf8');
  assert.ok(workspace.includes('canPrintSchedule={capabilities.includes("schedule.print")}'));
  assert.ok(view.includes('(!readOnly||canPrintSchedule)&&<button'));
  const handler=view.slice(view.indexOf('const printSchedule='),view.indexOf('const canEdit='));
  for(const guard of ['readOnly&&!canPrintSchedule','loadedScope!==scope','loadedRequest.current!==sendRequest','!assignments.length']){
    assert.ok(handler.includes(guard),guard);
  }
  assert.ok(handler.includes('assignments.map(staffScheduleReportRow)'));
  assert.equal(staffScheduleReportHeadings.length,6);
  assert.deepEqual(staffScheduleReportRow({
    date:'2026-11-22',employee:null,slot:2,internalNote:'private',
    shiftTemplate:{name:'Απόγευμα',startTime:'16:00',endTime:'00:00',employeePhone:'private'}
  }),['2026-11-22','Ακάλυπτο','Απόγευμα','16:00','00:00',2]);
});
