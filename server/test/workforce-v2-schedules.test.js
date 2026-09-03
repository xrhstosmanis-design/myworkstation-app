import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");

test("Workforce v2 schedule routes keep the protected lifecycle and assignment checks",()=>{
  const route=read("../src/routes/platform-workforce-v2-schedules.js");
  assert.match(route,/\["DRAFT","PREVIEWED"\]/);
  assert.match(route,/DOUBLE_SHIFT/);
  assert.match(route,/HOURS_EXCEEDED/);
  assert.match(route,/ROLE_MISMATCH/);
  assert.match(route,/WORKFORCE_SCHEDULE_SUPERSEDED/);
  assert.match(route,/router\.put\("\/:scheduleId\/assignments\/:assignmentId"/);
  assert.match(route,/router\.get\("\/:scheduleId\/validation"/);
  assert.match(route,/WORKFORCE_EXCEPTION_APPROVED/);
  assert.match(route,/Μόνο Super Admin ή Ιδιοκτήτης εγκρίνει εξαίρεση/);
  assert.doesNotMatch(route,/migration\/apply/);
});

test("Workforce v2 schedule UI exposes all requested operational views",()=>{
  const ui=read("../../client/src/components/platform/WorkforceV2ScheduleTab.jsx");
  assert.match(ui,/Αναλυτική ημέρας/);
  assert.match(ui,/Συνοπτική εβδομάδας/);
  assert.match(ui,/Αναλυτική εβδομάδας/);
  assert.match(ui,/Άδειες, ρεπό και απουσίες/);
  assert.match(ui,/Υποχρεωτική αιτιολογία έγκρισης εξαίρεσης/);
  assert.match(ui,/νέα έκδοση από το δημοσιευμένο πρόγραμμα/i);
  assert.match(ui,/Αιτιολογία και επιβεβαίωση/);
  assert.match(ui,/Audit Workforce/);
  assert.match(ui,/Ανανέωση Audit/);
  assert.doesNotMatch(ui,/window\.prompt/);
  assert.match(ui,/await load\(\{keepNotice:true\}\);setSelected\(result\.item\.id\)/);
});

test("Workforce audit route exposes the required recorded fields",()=>{
  const route=read("../src/routes/platform-workforce-v2.js");
  assert.match(route,/router\.get\("\/audit"/);
  assert.match(route,/actorName/);
  assert.match(route,/employeeName/);
  assert.match(route,/ruleCode/);
  assert.match(route,/reason/);
});

test("Workforce v2 attendance keeps card entries isolated, audited and protected",()=>{
  const route=read("../src/routes/platform-workforce-v2-attendance.js");
  const ui=read("../../client/src/components/platform/WorkforceV2AttendanceTab.jsx");
  assert.match(route,/WORKFORCE_CLOCK_IN/);
  assert.match(route,/WORKFORCE_CLOCK_OUT/);
  assert.match(route,/WORKFORCE_OVER_8_HOURS_APPROVED/);
  assert.match(route,/approve-over-8-hours/);
  assert.match(route,/scheduledMinutes/);
  assert.match(route,/varianceMinutes/);
  assert.match(route,/hourlyRate/);
  assert.match(route,/workedAmount/);
  assert.match(route,/validFrom/);
  assert.match(route,/Μόνο Super Admin ή Ιδιοκτήτης/);
  assert.match(route,/status:\"PUBLISHED\"/);
  assert.match(ui,/Παρουσίες και κάρτα εργασίας/);
  assert.match(ui,/Υποχρεωτική αιτιολογία/);
  assert.match(ui,/Ωρομίσθιο/);
  assert.match(ui,/Αξία πραγματικών ωρών/);
});

test("Workforce schedule server route passes Node syntax check",()=>{
  const path=fileURLToPath(new URL("../src/routes/platform-workforce-v2-schedules.js",import.meta.url));
  const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
});
