import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/pilot-report.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/cloud/PilotDailyReport.jsx",import.meta.url),"utf8");

test("daily report assigns a cross-midnight shift once, on its closing operational day",()=>{
  assert.match(route,/COALESCE\("closedAt","openedAt"\) AT TIME ZONE 'Europe\/Athens'/);
  assert.doesNotMatch(route,/\("openedAt" AT TIME ZONE 'Europe\/Athens'\)[\s\S]*OR \("closedAt"/);
});

test("daily transactions follow their scoped shift instead of their calendar timestamp",()=>{
  assert.match(route,/SELECT transaction\.\* FROM "StoreTransaction" transaction/);
  assert.match(route,/JOIN "CashShiftSession" shift ON shift\."id"=transaction\."sessionId"/);
  assert.match(route,/shift\."companyId"=transaction\."companyId" AND shift\."storeId"=transaction\."storeId"/);
  assert.match(route,/COALESCE\(shift\."closedAt",shift\."openedAt"\)/);
  assert.doesNotMatch(route,/\("occurredAt" AT TIME ZONE 'Europe\/Athens'\)::date/);
});

test("report separates recorded expenses from explicit cash-shift deductions",()=>{
  assert.match(route,/"subtractFromShift" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(route,/row\.type===type&&row\.subtractFromShift/);
  assert.match(route,/recordedExpensesTotal:supplierPayments\+otherExpenses/);
  assert.match(route,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
  assert.match(client,/Σύνολο καταγεγραμμένων πληρωμών \/ εξόδων/);
  assert.match(client,/Αφαιρέθηκαν από τη βάρδια/);
  assert.match(client,/Αφαιρέθηκαν από ταμείο/);
});
