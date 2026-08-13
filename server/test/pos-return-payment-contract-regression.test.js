import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(new URL("../src/routes/store-pos.js", import.meta.url), "utf8");
const reverse = await readFile(new URL("../src/routes/pos-sale-actions.js", import.meta.url), "utf8");
const startup = await readFile(new URL("../scripts/ensure-pos-return-compat.js", import.meta.url), "utf8");
const render = await readFile(new URL("../../render.yaml", import.meta.url), "utf8");

test("POS return Payment contract is compatible with live checkout schema", () => {
  assert.match(checkout, /INSERT INTO "Payment" \("id","saleId","method","amount"\)/);
  assert.match(reverse, /INSERT INTO "Payment" \("id","saleId","method","amount","terminalRef"\)/);
  assert.match(startup, /ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalRef" TEXT/);
  assert.match(render, /node server\/scripts\/ensure-pos-return-compat\.js/);
});
