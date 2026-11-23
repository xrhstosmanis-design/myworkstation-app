import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/pilot-report.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/cloud/PilotDailyReport.jsx",import.meta.url),"utf8");

test("daily cash report includes the employee-entered EFTPOS close",()=>{
  assert.match(route,/"eftposTotal","cardVariance"/);
  assert.match(route,/eftposTotal:eftposUnavailable\?null:closed\.reduce/);
  assert.match(route,/cardVarianceTotal:eftposUnavailable\?null:closed\.reduce/);
  assert.match(route,/companyId"=\$\{req\.user\.companyId\}/);
});

test("daily report displays and exports EFTPOS reconciliation",()=>{
  assert.match(client,/Κάρτες − EFTPOS/);
  assert.match(client,/Διαφορά καρτών–EFTPOS/);
  assert.match(client,/summary\.eftposTotal/);
  assert.match(client,/row\.cardVariance/);
});

test("pilot report labels uncounted sessions and renders unknown money as blank or a dash",()=>{
  assert.match(route,/closeReconciliationStatus==="AWAITING_COUNT"/);
  assert.match(route,/varianceTotal:awaitingCount\?null:/);
  assert.match(client,/value==null\?"—"/);
  assert.match(client,/Εκκρεμεί καταμέτρηση/);
});

test("pilot report preserves unavailable EFTPOS after a counted cash close",()=>{
  assert.match(route,/closeReconciliationStatus==="COUNTED"&&row\.eftposTotal==null/);
  assert.match(client,/summary\.cardVarianceTotal==null\?"":/);
});
