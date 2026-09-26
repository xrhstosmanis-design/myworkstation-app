import assert from "node:assert/strict";
import test from "node:test";
import {loadPayrollWorkspace} from "../../client/src/components/platform/workforce-v2-payroll-load.js";

test("a failed cash overview does not hide an existing payroll period",async()=>{
  const period={id:"lab-period",status:"DRAFT"};
  const result=await loadPayrollWorkspace(async url=>{
    if(url.endsWith("/periods"))return [period];
    throw new Error("Δεν βρέθηκε ενεργό κατάστημα.");
  },"/api/platform/lab/payroll","lab-store");
  assert.deepEqual(result.rows,[period]);
  assert.equal(result.overview,null);
  assert.match(result.overviewError,/Δεν βρέθηκε ενεργό κατάστημα/);
});

test("cash sessions are read from the store-scoped payroll route",async()=>{
  const called=[];
  const result=await loadPayrollWorkspace(async url=>{called.push(url);return url.endsWith("/periods")?[]:{openSessions:[{id:"lab-shift"}]}},"/api/platform/lab/payroll","lab-store");
  assert.deepEqual(called,["/api/platform/lab/payroll/periods","/api/platform/lab/payroll/open-cash-sessions"]);
  assert.equal(result.overview.openSessions[0].id,"lab-shift");
});

test("a failed payroll period request remains a blocking error",async()=>{
  await assert.rejects(loadPayrollWorkspace(async()=>{throw new Error("period failure")},"/api/platform/lab/payroll","lab-store"),/period failure/);
});
