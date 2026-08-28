import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(
  new URL("../src/routes/inventory-v2-import.js", import.meta.url),
  "utf8",
);
test("inventory import accepts barcode or SKU only inside stocktake scope", () => {
  assert.match(source, /barcode/);
  assert.match(source, /sku/);
  assert.match(source, /sl\."stocktakeId"=\$\{st\.id\}/);
});
test("every imported count creates immutable audit evidence", () => {
  assert.match(source, /InventoryCountEvent/);
  assert.match(source, /IMPORT_COUNT/);
  assert.match(source, /IMPORT_RECOUNT/);
  assert.match(source, /FILE_IMPORT/);
});
test("inventory import cannot finalize or touch unrelated lines", () => {
  assert.doesNotMatch(source, /status"='FINALIZED/);
  assert.match(source, /WHERE "id"=\$\{line\.id\}/);
});
