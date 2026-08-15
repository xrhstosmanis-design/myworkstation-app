import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const closeUi=fs.readFileSync(new URL("../../client/src/components/store/StoreShiftClosePanel.jsx",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ledger=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("live expected cash reuses existing shift and transaction overview totals",()=>{
  assert.match(closeUi,/\/api\/cash\/stores\/\$\{store\.id\}\/overview/);
  assert.match(closeUi,/\/api\/transactions\/stores\/\$\{store\.id\}\/overview/);
  assert.match(closeUi,/openingOperational\)\+n\(form\.cashSales\)-n\(form\.expenses\)/);
  assert.match(closeUi,/Αναμενόμενο λειτουργικό σύνολο/);
  assert.match(closeUi,/Έξοδα \/ πληρωμές ίδιας βάρδιας/);
});

test("live expected display stays aligned with authoritative close formula",()=>{
  assert.match(cash,/const expected=session\.openingOperational\+ledger\.cashSales\+ledger\.transferIn-ledger\.expenses/);
  assert.match(cash,/authoritativeShiftTotals/);
  assert.match(ledger,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
  assert.match(ledger,/row\.type===type&&row\.subtractFromShift/);
});

test("expected amounts remain behind the existing initialCash visibility permission",()=>{
  assert.match(closeUi,/pos\?\.access\?\.initialCash/);
  assert.match(closeUi,/showExpectedAmounts&&/);
});
