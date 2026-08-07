import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {calculateAttendanceSummary} from "../src/routes/attendance.js";

const route=await readFile(new URL("../src/routes/attendance.js",import.meta.url),"utf8");
const storeUi=await readFile(new URL("../../client/src/components/store/StoreAttendancePanel.jsx",import.meta.url),"utf8");
const adminUi=await readFile(new URL("../../client/src/components/commerce/AttendanceManagementPanel.jsx",import.meta.url),"utf8");

test("attendance summary pairs real IN and OUT events",()=>{
  const employees=[{id:"e1",fullName:"Νίκη",storeId:"s1",storeName:"ΚΑΤ"}];
  const events=[{id:"a",employeeId:"e1",eventType:"IN",occurredAt:"2026-08-01T06:00:00Z"},{id:"b",employeeId:"e1",eventType:"OUT",occurredAt:"2026-08-01T14:30:00Z"}];
  const result=calculateAttendanceSummary(employees,events,"2026-08-01T00:00:00Z","2026-09-01T00:00:00Z")[0];
  assert.equal(result.workedMinutes,510);assert.equal(result.shifts,1);assert.equal(result.issues.length,0);
});

test("attendance summary flags incomplete or invalid sequences",()=>{
  const employees=[{id:"e1",fullName:"Νίκη",storeId:"s1",storeName:"ΚΑΤ"}];
  const events=[{id:"a",employeeId:"e1",eventType:"OUT",occurredAt:"2026-08-01T06:00:00Z"},{id:"b",employeeId:"e1",eventType:"IN",occurredAt:"2026-08-01T07:00:00Z"}];
  const result=calculateAttendanceSummary(employees,events,"2026-08-01T00:00:00Z","2026-09-01T00:00:00Z")[0];
  assert.equal(result.openEntry,true);assert.deepEqual(result.issues.map(item=>item.type),["UNPAIRED_OUT","OPEN_ENTRY"]);
});

test("monthly totals clamp a cross-boundary shift to the selected period",()=>{
  const employees=[{id:"e1",fullName:"Νίκη",storeId:"s1",storeName:"ΚΑΤ"}];
  const events=[{id:"a",employeeId:"e1",eventType:"IN",occurredAt:"2026-07-31T22:00:00Z"},{id:"b",employeeId:"e1",eventType:"OUT",occurredAt:"2026-08-01T02:00:00Z"}];
  const result=calculateAttendanceSummary(employees,events,"2026-08-01T00:00:00Z","2026-09-01T00:00:00Z")[0];
  assert.equal(result.workedMinutes,120);
});

test("corrections preserve the original attendance audit event",()=>{
  assert.match(route,/"voidedAt"=CURRENT_TIMESTAMP/);assert.match(route,/"supersedesEventId"/);assert.doesNotMatch(route,/DELETE FROM "AttendanceEvent"/);
});

test("store mode is self-service and backoffice exposes monthly controls",()=>{
  assert.match(storeUi,/Έναρξη εργασίας/);assert.match(storeUi,/Λήξη εργασίας/);assert.match(route,/req\.user\.employeeId/);
  assert.match(adminUi,/Μηνιαία σύνολα εργαζομένων/);assert.match(adminUi,/Αποθήκευση με audit/);
});
