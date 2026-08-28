import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");

test("cash close recalculates sales and deductible expenses from its complete tenant ledger",()=>{
  assert.match(cash,/async function authoritativeShiftTotals/);
  assert.match(cash,/"companyId"=\$\{companyId\} AND "storeId"=\$\{storeId\} AND "sessionId"=\$\{sessionId\}/);
  assert.match(cash,/"subtractFromShift"=true AND "reversedAt" IS NULL/);
  assert.match(cash,/const ledger=await authoritativeShiftTotals/);
  assert.match(cash,/"cashSales"=\$\{ledger\.cashSales\},"cardSales"=\$\{ledger\.cardSales\}/);
  assert.match(cash,/"expenses"=\$\{ledger\.expenses\}/);
});

test("BackOffice does not duplicate the authoritative POS close form",()=>{
  assert.doesNotMatch(client,/<form className="cash-form" onSubmit=\{closeShift\}>/);
  assert.match(client,/Οι βάρδιες ανοίγουν και κλείνουν αποκλειστικά από το POS/);
});
