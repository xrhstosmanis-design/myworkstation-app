import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("external owner payments are excluded from active shift movements",()=>{
  assert.match(ui,/row\.paymentSource!=="EXTERNAL"/);
  assert.doesNotMatch(ui,/row\.paymentSource==="EXTERNAL"\?"Εξωτερική"/);
});
