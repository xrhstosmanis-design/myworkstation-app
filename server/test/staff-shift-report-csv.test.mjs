import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStaffShiftReportCsv,formatShiftTimestamp} from '../../client/src/components/cloud/staff-shift-report-csv.mjs';
import {staffCapabilities,staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('the explicit export grant requires shift read access and adds no route authority',()=>{
  assert.ok(staffCapabilities.includes('shifts.export'));
  assert.equal(validStaffCapabilities(['shifts.export']),false);
  assert.equal(validStaffCapabilities(['shifts.read','shifts.export']),true);
  assert.equal(staffRequestCapability('GET','/api/cash-control/stores/store/reporting-overview'),'shifts.read');
});

test('shift CSV preserves Athens times, negative amounts, missing amounts and formula safety',()=>{
  const csv=buildStaffShiftReportCsv([{
    status:'OPEN',openedAt:'2026-11-22T08:00:00Z',openedByName:' =1+1',
    terminalPos:'A;"1"',cashSales:0,variance:-1.5,cardVariance:8,eftposTotal:9,
    transactionCount:2,internalNote:'DO NOT EXPORT'
  },{
    status:'CLOSED',closedAt:'2026-11-22T15:00:00Z',eftposTotal:9,cardVariance:0
  }]);
  const [header,open,closed]=csv.split('\r\n');
  assert.ok(header.startsWith('\uFEFF"Χειριστής"'));
  assert.ok(open.startsWith('"\' =1+1";"A;""1""";"";'));
  assert.ok(open.includes(formatShiftTimestamp('2026-11-22T08:00:00Z')));
  assert.match(open,/10:00/);
  assert.ok(open.endsWith(';"Ανοιχτή";0,00;;;;;;-1,50;;2'));
  assert.ok(closed.includes('17:00'));
  assert.ok(closed.endsWith(';;;9,00;;;;;0,00;0'));
  assert.ok(!csv.includes('DO NOT EXPORT'));
});
