import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyInventorySnapshotPeriod,classifyMonthlyInventoryObservation} from '../src/services/monthly-inventory-snapshot-period.js';

test('monthly inventory due slots are first next-month07:00Athens across leap, DST and century rollover',()=>{
 for(const [month,due]of [['2026-01','2026-02-01T05:00:00.000Z'],['2028-02','2028-03-01T05:00:00.000Z'],['2026-03','2026-04-01T04:00:00.000Z'],['2026-09','2026-10-01T04:00:00.000Z'],['2026-10','2026-11-01T05:00:00.000Z'],['2099-12','2100-01-01T05:00:00.000Z']]){
  const p=monthlyInventorySnapshotPeriod(month);assert.equal(p.scheduledFor,due);assert.equal(p.scheduledLocalTime,p.issueToDayExclusive+' 07:00');assert.equal(p.issueMonth,month);assert.ok(Object.isFrozen(p));
 }
});
test('every supported issue month maps to the real next-month07:00Athens wall clock',()=>{
 const fmt=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 for(let y=2000;y<=2099;y++)for(let m=1;m<=12;m++){
  const issue=y+'-'+String(m).padStart(2,'0'),p=monthlyInventorySnapshotPeriod(issue),parts=Object.fromEntries(fmt.formatToParts(new Date(p.scheduledFor)).map(p=>[p.type,p.value]));
  assert.equal(`${parts.year}-${parts.month}-${parts.day}`,p.issueToDayExclusive);assert.equal(parts.hour,'07');assert.equal(parts.minute,'00');
 }
});
test('observation is injected, exact due is ON_TIME and one millisecond late stays honestly LATE',()=>{
 const due=monthlyInventorySnapshotPeriod('2026-10').scheduledFor;
 assert.equal(classifyMonthlyInventoryObservation('2026-10',due).timing,'ON_TIME');
 const late='2026-11-01T05:00:00.001Z',r=classifyMonthlyInventoryObservation('2026-10',late);assert.equal(r.timing,'LATE');assert.equal(r.delayMs,1);assert.equal(r.sourceObservedAt,late);assert.equal(r.scheduledFor,due);
 assert.throws(()=>classifyMonthlyInventoryObservation('2026-10','2026-11-01T04:59:59.999Z'),{code:'SNAPSHOT_BEFORE_DUE'});
});
test('malformed or normalized invalid dates and unsupported issue months are refused',()=>{
 for(const m of ['1999-12','2100-01','2026-00','2026-13','2026-1','2026-10 ','2026-10\n','2026-10\r',null,202610])assert.throws(()=>monthlyInventorySnapshotPeriod(m),{code:'SNAPSHOT_MONTH_INVALID'});
 for(const date of ['2026-02-30T05:00:00.000Z','2026-11-01T05:00:00Z','2026-11-01T07:00:00.000+02:00','Invalid',null])assert.throws(()=>classifyMonthlyInventoryObservation('2026-10',date),{code:'SNAPSHOT_OBSERVATION_INVALID'});
});
