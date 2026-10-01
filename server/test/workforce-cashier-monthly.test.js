import test from 'node:test';
import assert from 'node:assert/strict';
import {cashierMonthRange,summarizeMonthlyShifts,monthlyCashierPerformance} from '../src/workforce-cashier-monthly.js';
test('Athens calendar months include DST transitions and leap/year boundaries',()=>{
 const cases=[['2026-01','2025-12-31T22:00:00.000Z','2026-01-31T22:00:00.000Z'],['2026-07','2026-06-30T21:00:00.000Z','2026-07-31T21:00:00.000Z'],['2026-03','2026-02-28T22:00:00.000Z','2026-03-31T21:00:00.000Z'],['2026-10','2026-09-30T21:00:00.000Z','2026-10-31T22:00:00.000Z'],['2024-02','2024-01-31T22:00:00.000Z','2024-02-29T22:00:00.000Z'],['2026-12','2026-11-30T22:00:00.000Z','2026-12-31T22:00:00.000Z']];
 for(const [month,start,end] of cases){const range=cashierMonthRange(month);assert.equal(range.from.toISOString(),start);assert.equal(range.to.toISOString(),end);assert.equal(range.endExclusive,true)}
});
test('invalid months never reach database queries',async()=>{
 for(const value of ['2026-00','2026-13','26-01','2026-1','1999-12','2101-01','2026-01-extra',null,[]])assert.throws(()=>cashierMonthRange(value),{status:400});
 await assert.rejects(monthlyCashierPerformance({}, {companyId:'a',storeId:'s',employee:{id:'e'},month:'bad'}),{status:400});
});
test('open shifts include ledger sales but never cached closure variance',()=>{
 const summary=summarizeMonthlyShifts([{status:'OPEN',cashSales:'1.20',cardSales:'2.30',variance:-999,cardVariance:999,transactionCount:3,reversedCount:1},{status:'CLOSED',closedInPeriod:true,openedInPeriod:false,cashSales:'0.10',cardSales:0,variance:'-0.5',cardVariance:0,openingVariance:100,transactionCount:1}]);
 assert.equal(summary.totalSales,3.60);assert.equal(summary.variance,-0.5);assert.equal(summary.openingVariance,0);assert.equal(summary.openShifts,1);assert.equal(summary.closedShifts,1);assert.equal(summary.transactions,4);assert.equal(summary.reversed,1);
});
test('monthly query scopes every source to store/company, ledger occurrence and explicit identity',async()=>{
 const calls=[];let attendanceWhere;
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});return sql.includes('StoreOperatorCredential')?[{id:'operator'}]:sql.includes('CashShiftSession')?[{id:'shift',status:'OPEN',cashSales:'5',cardSales:'2',transactionCount:2,variance:100}]:[]},workforceAttendanceSession:{findMany:async args=>{attendanceWhere=args.where;return []}}};
 const data=await monthlyCashierPerformance(db,{companyId:'company',storeId:'store',employee:{id:'employee'},month:'2026-10'});
 assert.deepEqual(calls[0].values,['company','store','employee']);assert.ok(calls.every(c=>c.values.includes('company')&&c.values.includes('store')));assert.match(calls[1].sql,/t\."companyId"=s\."companyId" AND t\."storeId"=s\."storeId"/);assert.match(calls[1].sql,/t\."occurredAt">=\? AND t\."occurredAt"<\?/);assert.match(calls[1].sql,/s\."openedBy"=ANY/);assert.match(calls[1].sql,/SUM\(t\."amount"\).*"reversedAt" IS NULL/);assert.match(calls[2].sql,/a\."storeId"=\?/);
 assert.equal(attendanceWhere.storeId,'store');assert.equal(attendanceWhere.companyId,'company');assert.equal(attendanceWhere.employeeId,'employee');assert.equal(attendanceWhere.startedAt.lt.toISOString(),'2026-10-31T22:00:00.000Z');assert.equal(data.cashier.totalSales,7);assert.equal(data.cashier.variance,0);assert.equal(data.cashier.recentShifts[0].variance,null);
});
test('unlinked employee does not acquire another employee cashier rows',async()=>{
 let count=0;const db={$queryRaw:async()=>{count++;return []},workforceAttendanceSession:{findMany:async()=>[]}};
 const data=await monthlyCashierPerformance(db,{companyId:'c',storeId:'s',employee:{id:'e'},month:'2026-01'});assert.equal(count,1);assert.equal(data.cashier.linked,false);assert.equal(data.cashier.shifts,0);
});
test('source caps produce explicit partial warnings',async()=>{
 const db={$queryRaw:async strings=>strings.join('').includes('StoreOperatorCredential')?[{id:'o'}]:Array.from({length:251},(_,i)=>({id:String(i),status:'OPEN'})),workforceAttendanceSession:{findMany:async()=>Array.from({length:501},()=>({status:'OPEN'}))}};
 const data=await monthlyCashierPerformance(db,{companyId:'c',storeId:'s',employee:{id:'e'},month:'2026-01'});assert.equal(data.warnings.length,3);assert.equal(data.cashier.shifts,250);assert.equal(data.attendance.sessions,500);assert.equal(data.posActions.total,250);
});
