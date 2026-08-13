import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guard = await readFile(new URL("../../client/src/return-items-only-bootstrap.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../client/index.html", import.meta.url), "utf8");

test("Store POS exposes item-level returns only", () => {
  assert.match(guard, /Ολόκληρη συναλλαγή/);
  assert.match(guard, /Συγκεκριμένα προϊόντα/);
  assert.match(guard, /items\.click\(\)/);
  assert.match(guard, /full\?\.remove\(\)/);
  assert.match(guard, /ITEMS_ONLY/);
  assert.match(html, /return-items-only-bootstrap\.js/);
});
