import test from 'node:test';
import assert from 'node:assert/strict';
import {printStaffAttendance} from '../../client/src/components/platform/staff-attendance-print.mjs';
import {staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('attendance print is opt-in and reuses the existing attendance read permission',()=>{
  assert.equal(validStaffCapabilities(['attendance.print']),false);
  assert.equal(validStaffCapabilities(['attendance.read','attendance.print']),true);
  assert.equal(staffRequestCapability('GET','/api/platform/store-modules/companies/c/stores/s/workforce-v2/attendance'),'attendance.read');
});

test('attendance print renders only the displayed fields as text and handles blocked popups',()=>{
  const node=tag=>({tag,children:[],append(...children){this.children.push(...children)}});
  const document={documentElement:node('html'),head:node('head'),body:node('body'),createElement:node};
  let printed=0;
  const popup={document,focus(){},print(){printed++},close(){},addEventListener(){}};
  const browser={open:()=>popup};
  const items=[{
    employee:{fullName:'<Χειριστής>',id:'private-employee'},
    startedAt:'2026-11-22T08:00:00Z',workedMinutes:480,varianceMinutes:-5,status:'NEEDS_REVIEW',
    hourlyRate:98765,notes:'private-audit'
  }];
  assert.equal(printStaffAttendance(browser,'<Κατάστημα>','2026-11-22',items),true);
  assert.equal(popup.opener,null);
  assert.equal(printed,1);
  assert.equal(document.title,'Αναφορά παρουσιών');
  assert.equal(document.body.children[1].textContent,'<Κατάστημα> · 2026-11-22');
  const row=document.body.children[2].children[1].children[0].children.map(cell=>cell.textContent);
  assert.equal(row[0],'<Χειριστής>');
  assert.match(row[2],/10:00/);
  assert.deepEqual(row.slice(4),['—','480','-5','Χρειάζεται έλεγχο']);
  assert.doesNotMatch(JSON.stringify(document.body),/private-|98765/);
  assert.equal(printStaffAttendance({open:()=>null},'Store','2026-11-22',items),false);
});
