import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const cash=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const report=await readFile(new URL("../src/routes/pilot-report.js",import.meta.url),"utf8");
const cashUi=await readFile(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");
const reportUi=await readFile(new URL("../../client/src/components/cloud/PilotDailyReport.jsx",import.meta.url),"utf8");

test("opening stores the previous handover expectation and the declared variance",()=>{
  assert.match(cash,/"expectedOpeningOperational" NUMERIC\(14,2\) NOT NULL DEFAULT 0/);
  assert.match(cash,/"openingVariance" NUMERIC\(14,2\) NOT NULL DEFAULT 0/);
  assert.match(cash,/SELECT "nextOpeningTotal"(?:,"closingSafe")? FROM "CashShiftSession"[\s\S]*"terminalPos"=\$\{terminalPos\}[\s\S]*"status"='CLOSED'/);
  assert.match(cash,/expectedOpening=lastClosedRows\[0\]\?money\(lastClosedRows\[0\]\.nextOpeningTotal\):operational/);
  assert.match(cash,/openingVariance=operational-expectedOpening/);
  assert.match(cash,/\$\{expectedOpening\},\$\{openingVariance\}/);
});

test("BackOffice keeps opening continuity visible but cannot open a shift",()=>{
  assert.match(cashUi,/Οι βάρδιες ανοίγουν και κλείνουν αποκλειστικά από το POS \/ Store Mode/);
  assert.doesNotMatch(cashUi,/<form className="cash-form" onSubmit=\{openShift\}>/);
});

test("daily report includes opening continuity in screen and export",()=>{
  assert.match(report,/openingVarianceTotal:sessions\.reduce/);
  assert.match(reportUi,/Συνολική διαφορά έναρξης/);
  assert.match(reportUi,/Αναμενόμενη έναρξη/);
  assert.match(reportUi,/Δηλωμένη έναρξη/);
  assert.match(reportUi,/summary\.openingVarianceTotal/);
});
