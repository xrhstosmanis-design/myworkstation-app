import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(
  new URL("../src/routes/inventory-v2-audit.js", import.meta.url),
  "utf8",
);
test("full inventory audit includes header summary lines and immutable events", () => {
  assert.match(source, /header:/);
  assert.match(source, /summary:/);
  assert.match(source, /InventoryCountEvent/);
  assert.match(source, /events:\s*grouped\.get/);
});
test("audit calculates quantity and value differences", () => {
  assert.match(source, /differenceValue/);
  assert.match(source, /totalDifferenceValue/);
  assert.match(source, /unitCost/);
});
test("audit export is tenant scoped CSV", () => {
  assert.match(source, /st\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(source, /audit\.csv/);
  assert.match(source, /text\/csv/);
});
test("finalized inventory exposes a paid evidence-only loss investigation", () => {
  assert.match(source, /stocktakes\/:stocktakeId\/investigation/);
  assert.match(source, /LOSS_DETECTION/);
  assert.match(source, /storePaidModuleState/);
  assert.match(source, /PurchaseDocumentLine/);
  assert.match(source, /POSSIBLE_DUPLICATE_SALE/);
  assert.match(source, /δεν αποδεικνύουν υπαιτιότητα εργαζομένου/);
  assert.match(source, /readOnly:\s*true/);
});
