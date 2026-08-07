import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/pilot-report.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/cloud/PilotDailyReport.jsx",import.meta.url),"utf8");

test("daily cash report includes the employee-entered EFTPOS close",()=>{
  assert.match(route,/"eftposTotal","cardVariance"/);
  assert.match(route,/eftposTotal:closed\.reduce/);
  assert.match(route,/cardVarianceTotal:closed\.reduce/);
  assert.match(route,/companyId"=\$\{req\.user\.companyId\}/);
});

test("daily report displays and exports EFTPOS reconciliation",()=>{
  assert.match(client,/Κάρτες − EFTPOS/);
  assert.match(client,/Διαφορά καρτών–EFTPOS/);
  assert.match(client,/summary\.eftposTotal/);
  assert.match(client,/row\.cardVariance/);
});
