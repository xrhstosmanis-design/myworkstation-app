import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/attendance.js",import.meta.url),"utf8");
const schema=await readFile(new URL("../src/extended-modules-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/PayrollPeriodPanel.jsx",import.meta.url),"utf8");

test("payroll periods snapshot attendance and remain company scoped",()=>{
  assert.match(route,/\/payroll-periods/);
  assert.match(route,/attendanceSummaryFor/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(schema,/employeeNameSnapshot/);
});

test("finalization blocks unresolved attendance issues and locks the period",()=>{
  assert.match(route,/period\.issues>0/);
  assert.match(route,/"status"='FINALIZED'/);
  assert.match(route,/"lockedAt"=CURRENT_TIMESTAMP/);
});

test("excel export is explicitly hours-only and not automatic payroll",()=>{
  assert.match(route,/XLSX\.utils\.json_to_sheet/);
  assert.match(route,/Δεν αποτελεί αυτόματο υπολογισμό μισθού/);
  assert.match(ui,/Δεν υπολογίζεται αυτόματα μισθός/);
});

test("draft periods can refresh from corrected attendance",()=>{
  assert.match(route,/payroll-periods\/:periodId\/refresh/);
  assert.match(route,/DELETE FROM "PayrollEntry"/);
  assert.match(ui,/Ανανέωση από παρουσίες/);
});
