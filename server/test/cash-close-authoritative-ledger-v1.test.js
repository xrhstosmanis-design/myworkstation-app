import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");

test("cash close recalculates sales, deductible expenses and owner cash transfers from its complete tenant ledger",()=>{
  assert.match(cash,/async function authoritativeShiftTotals/);
  assert.match(cash,/"companyId"=\$\{companyId\} AND "storeId"=\$\{storeId\} AND "sessionId"=\$\{sessionId\}/);
  assert.match(cash,/"subtractFromShift"=true AND "reversedAt" IS NULL/);
  assert.match(cash,/"type"='CASH_TRANSFER' AND "reversedAt" IS NULL/);
  assert.match(cash,/const ledger=await authoritativeShiftTotals/);
  assert.match(cash,/session\.openingOperational\+ledger\.cashTransfers\+ledger\.cashSales-ledger\.expenses/);
  assert.match(cash,/"cashSales"=\$\{ledger\.cashSales\},"cardSales"=\$\{ledger\.cardSales\}/);
  assert.match(cash,/"expenses"=\$\{ledger\.expenses\}/);
});

test("cashier enters EFTPOS and physical counts but cannot edit audited ledger totals",()=>{
  assert.match(client,/label="Πωλήσεις μετρητών"[\s\S]{0,180}readOnly/);
  assert.match(client,/label="Πωλήσεις καρτών"[\s\S]{0,180}readOnly/);
  assert.match(client,/label="Έξοδα \/ πληρωμές"[\s\S]{0,180}readOnly/);
  assert.doesNotMatch(client,/label="Σύνολο EFTPOS"[\s\S]{0,180}readOnly/);
});
