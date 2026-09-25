import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {overlapDays,PAYROLLABLE_ATTENDANCE_STATUSES,paymentBalance,payrollClosingSummary,payrollGross,payrollableAttendanceWhere,payrollWorkDate,shiftDurationMinutes} from "../src/workforce-v2-payroll.js";

test("payroll includes closed and approved attendance plus legacy completed rows",()=>{
  assert.deepEqual(PAYROLLABLE_ATTENDANCE_STATUSES,["CLOSED","APPROVED","COMPLETED"]);
  assert.deepEqual(payrollableAttendanceWhere(),{in:["CLOSED","APPROVED","COMPLETED"]});
});

test("partial and final payroll payments update the exact remaining balance",()=>{
  assert.deepEqual(paymentBalance({grossAmount:100,paidAmount:20,newAmount:30}),{valid:true,paidAfter:50,balanceAfter:50});
  assert.deepEqual(paymentBalance({grossAmount:"100.00",paidAmount:"50.00",newAmount:"50.00"}),{valid:true,paidAfter:100,balanceAfter:0});
});

test("payroll payment rejects overpayment and invalid amounts",()=>{
  assert.deepEqual(paymentBalance({grossAmount:100,paidAmount:80,newAmount:20.01}),{valid:false,reason:"OVERPAYMENT",balance:20});
  assert.deepEqual(paymentBalance({grossAmount:100,paidAmount:0,newAmount:0}),{valid:false,reason:"INVALID_AMOUNT"});
});

test("daily payroll counts distinct Athens work dates, not attendance rows",()=>{
  const dates=new Set([payrollWorkDate("2026-09-25T20:30:00Z"),payrollWorkDate("2026-09-25T22:30:00Z"),payrollWorkDate("2026-09-26T08:00:00Z")]);
  assert.equal(dates.size,2);
  assert.equal(payrollGross({paymentType:"DAILY",dailyRate:45,workDays:dates.size}),90);
});

test("hourly and fixed payroll calculations remain stable",()=>{
  assert.equal(payrollGross({paymentType:"HOURLY",actualMinutes:510,hourlyRate:6}),51);
  assert.equal(payrollGross({paymentType:"FIXED_MONTHLY",fixedAmount:1200}),1200);
});

test("planned shifts handle ordinary and overnight schedules",()=>{
  assert.equal(shiftDurationMinutes("07:00","15:00"),480);
  assert.equal(shiftDurationMinutes("23:00","07:00"),480);
});

test("approved leave is clipped to the payroll period",()=>{
  assert.equal(overlapDays("2026-09-20","2026-09-28","2026-09-25","2026-10-01"),4);
  assert.equal(overlapDays("2026-08-01","2026-08-03","2026-09-25","2026-10-01"),0);
});

test("payroll closes only from an exact immutable reconciliation",()=>{
  const closed=payrollClosingSummary([{employeeId:"a",grossAmount:100},{employeeId:"b",grossAmount:50}],[{employeeId:"a",amount:40},{employeeId:"a",amount:60},{employeeId:"b",amount:50}]);
  assert.deepEqual({...closed,rows:undefined},{employeeCount:2,grossAmount:150,paidAmount:150,balanceAmount:0,openEmployeeCount:0,rows:undefined});
  const open=payrollClosingSummary([{employeeId:"a",grossAmount:100}],[{employeeId:"a",amount:80}]);
  assert.equal(open.balanceAmount,20);assert.equal(open.openEmployeeCount,1);
});

test("employee payments use the existing cash and bank ledgers with replay protection",()=>{
  const route=readFileSync(new URL("../src/routes/platform-workforce-v2-payroll.js",import.meta.url),"utf8");
  for(const token of ["CashShiftSession","StoreTransaction","BankLedgerEntry","sourceTransactionId","PENDING_PROOF","requestKey"])assert.match(route,new RegExp(token));
  assert.match(route,/\["CASH_SHIFT","BANK_TRANSFER","CORPORATE_CARD"\]/);
});
