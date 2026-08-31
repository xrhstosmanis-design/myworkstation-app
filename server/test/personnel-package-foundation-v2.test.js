import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  AI_STAFF_SCHEDULER,
  PERSONNEL_AI,
  PERSONNEL_BASIC,
  PERSONNEL_PACKAGE_KEYS,
  PERSONNEL_PAYROLL,
  PERSONNEL_PRO,
  resolvePersonnelPackageStates
} from "../src/personnel-packages.js";

const NOW=new Date("2026-08-31T12:00:00.000Z");

test("AI package includes PRO and BASIC while payroll remains independent",()=>{
  const {states}=resolvePersonnelPackageStates([{moduleKey:PERSONNEL_AI,active:true,monthlyPrice:"29.90"}],NOW);
  assert.equal(states[PERSONNEL_AI].active,true);
  assert.equal(states[PERSONNEL_PRO].active,false);
  assert.equal(states[PERSONNEL_PRO].effectiveActive,true);
  assert.equal(states[PERSONNEL_PRO].inheritedFrom,PERSONNEL_AI);
  assert.equal(states[PERSONNEL_BASIC].effectiveActive,true);
  assert.equal(states[PERSONNEL_PAYROLL].effectiveActive,false);
});

test("legacy AI entitlement remains compatible with the new hierarchy",()=>{
  const {states,legacy}=resolvePersonnelPackageStates([{moduleKey:AI_STAFF_SCHEDULER,active:true,monthlyPrice:15}],NOW);
  assert.equal(legacy.active,true);
  assert.equal(states[PERSONNEL_AI].effectiveActive,true);
  assert.equal(states[PERSONNEL_PRO].effectiveActive,true);
  assert.equal(states[PERSONNEL_BASIC].effectiveActive,true);
});

test("future and expired rows do not grant access",()=>{
  const rows=[
    {moduleKey:PERSONNEL_PRO,active:true,startsAt:"2026-09-01T00:00:00.000Z"},
    {moduleKey:PERSONNEL_PAYROLL,active:true,endsAt:"2026-08-30T23:59:59.000Z"}
  ];
  const {states}=resolvePersonnelPackageStates(rows,NOW);
  assert.equal(states[PERSONNEL_PRO].effectiveActive,false);
  assert.equal(states[PERSONNEL_BASIC].effectiveActive,false);
  assert.equal(states[PERSONNEL_PAYROLL].effectiveActive,false);
});

test("the four commercial personnel packages are explicit and stable",()=>{
  assert.deepEqual(PERSONNEL_PACKAGE_KEYS,[PERSONNEL_BASIC,PERSONNEL_PRO,PERSONNEL_AI,PERSONNEL_PAYROLL]);
});

test("Prisma schema contains the independent workforce v2 foundations",()=>{
  const schema=readFileSync(new URL("../prisma/schema.prisma",import.meta.url),"utf8");
  for(const model of [
    "WorkforceEmployee","WorkforceRole","WorkforceEmployeeStoreAccess","WorkforceShiftTemplate",
    "WorkforceSchedule","WorkforceScheduleAssignment","WorkforceLeaveRequest","WorkforceAbsence",
    "WorkforceTimeClockEntry","WorkforceAttendanceSession","WorkforceHourlyRate","WorkforcePayrollPeriod",
    "WorkforcePayrollLine","WorkforceEmployeePayment","WorkforcePayrollClosing","WorkforceAuditLog","WorkforceChatCommand"
  ])assert.match(schema,new RegExp(`model ${model} \\{`));
});
