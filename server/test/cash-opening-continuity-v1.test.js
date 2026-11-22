import test from "node:test";
import assert from "node:assert/strict";
import {periodCashTotals,shiftOpeningContinuity} from "../src/routes/cash-control.js";
import {readFile} from "node:fs/promises";

const cash=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const report=await readFile(new URL("../src/routes/pilot-report.js",import.meta.url),"utf8");
const cashUi=await readFile(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");
const reportUi=await readFile(new URL("../../client/src/components/cloud/PilotDailyReport.jsx",import.meta.url),"utf8");

test("opening stores the previous handover expectation and the declared variance",()=>{
  assert.match(cash,/"expectedOpeningOperational" NUMERIC\(14,2\) DEFAULT 0/);
  assert.match(cash,/"openingVariance" NUMERIC\(14,2\) DEFAULT 0/);
  assert.match(cash,/ALTER COLUMN "expectedOpeningOperational" DROP NOT NULL, ALTER COLUMN "openingVariance" DROP NOT NULL/);
  assert.match(cash,/SELECT s\."nextOpeningTotal",s\."closingSafe"[^\n]*"terminalPos"=\$\{terminalPos\}[^\n]*"status"='CLOSED'/);
  const opening={drawer:5,custody:2,coins:1,safe:12};
  assert.deepEqual(shiftOpeningContinuity({nextOpeningTotal:6,closingSafe:11},opening,opening),{
    missingCount:false,expectedOpening:6,openingVariance:2,previousSafe:11,safeDelta:1
  });
  assert.deepEqual(shiftOpeningContinuity(undefined,opening,opening),{
    missingCount:false,expectedOpening:8,openingVariance:0,previousSafe:12,safeDelta:0
  });
  assert.match(cash,/\$\{expectedOpening\},\$\{openingVariance\}/);
});

test("after an uncounted close the next opening requires declared amounts and carries no baseline",()=>{
 const next={drawer:5,custody:2,coins:0,safe:0},previous={closeReconciliationStatus:"AWAITING_COUNT",closingSafe:15,nextOpeningTotal:50};
 assert.deepEqual(shiftOpeningContinuity(previous,next,next),{
   missingCount:false,expectedOpening:null,openingVariance:null,previousSafe:null,safeDelta:null
 });
 for(const value of [undefined,null,"", " ",false,[]]){
   assert.equal(shiftOpeningContinuity(previous,{...next,safe:value},next).missingCount,true);
 }
 assert.equal(shiftOpeningContinuity(previous,{...next,safe:"0"},next).missingCount,false);
 assert.match(cash,/if\(missingCount\)return res.status\(400\)/);
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

test("period totals retain ledger sales, and leave cash close and EFTPOS totals unknown with a pending count",()=>{
 const rule={posEftposEnabled:true},counted={cashSales:12,cardSales:23,expenses:4,eftposTotal:22,effectiveVariance:1,cardVariance:1};
 assert.deepEqual(periodCashTotals([counted],rule),{
   cashSales:12,cardSales:23,expenses:4,eftposTotal:22,variance:1,cardVariance:1,shortage:0,surplus:1,duplicateCandidates:0,awaitingCount:0
 });
 assert.deepEqual(periodCashTotals([counted,{...counted,closeReconciliationStatus:"AWAITING_COUNT"}],rule),{
   cashSales:24,cardSales:46,expenses:8,eftposTotal:null,variance:null,cardVariance:null,shortage:null,surplus:null,duplicateCandidates:0,awaitingCount:1
 });
});
