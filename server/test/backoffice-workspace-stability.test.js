import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stockWrapper = await readFile(
  new URL("../../client/src/components/commerce/KioskStyleProductCenterWithStock.jsx", import.meta.url),
  "utf8",
);
const launcher = await readFile(
  new URL("../../client/src/components/commerce/CommerceLauncher.jsx", import.meta.url),
  "utf8",
);

test("catalog refresh keeps the BackOffice workspace mounted", () => {
  assert.doesNotMatch(stockWrapper, /<KioskStyleProductCenter key=\{reloadKey\}/);
  assert.match(stockWrapper, /<KioskStyleProductCenter api=\{api\} stores=\{stores\} onOpenFullProduct=\{onOpenFullProduct\}\/>/);
});

test("duplicate open events cannot reset an already open BackOffice", () => {
  assert.match(launcher, /if\(visibleRef\.current\)return;\s*\/\/ Set it synchronously[\s\S]*?visibleRef\.current=true;/);
  assert.match(launcher, /onClick=\{\(\)=>\{visibleRef\.current=false;setParametersOpen\(false\);setVisible\(false\)\}\}/);
});
