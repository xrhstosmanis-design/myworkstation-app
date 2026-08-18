import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guard = await readFile(new URL("../../client/src/return-items-only-bootstrap.js", import.meta.url), "utf8");
const modal = await readFile(new URL("../../client/src/components/store/StorePosStandardModals.jsx", import.meta.url), "utf8");
const html = await readFile(new URL("../../client/index.html", import.meta.url), "utf8");

test("Store POS exposes both full-transaction and item-level returns", () => {
  assert.match(guard, /Ολόκληρη συναλλαγή/);
  assert.match(guard, /Συγκεκριμένα προϊόντα/);
  assert.match(guard, /FULL_AND_ITEMS/);
  assert.doesNotMatch(guard, /full\?\.remove\(\)/);
  assert.match(modal, /returnMode===?"TRANSACTION"/);
  assert.match(modal, /returnMode===?"ITEMS"/);
  assert.match(modal, /sale\.lines/);
  assert.match(modal, /sales\/\$\{sale\.id\}\/reverse/);
  assert.match(modal, /sales\/\$\{sale\.id\}\/return-items/);
  assert.match(html, /return-items-only-bootstrap\.js/);
});
