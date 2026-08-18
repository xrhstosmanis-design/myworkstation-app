import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkout = await readFile(new URL("../src/routes/store-pos.js", import.meta.url), "utf8");
const reverse = await readFile(new URL("../src/routes/pos-sale-actions.js", import.meta.url), "utf8");

test("POS return Payment contract matches the live checkout contract", () => {
  const paymentInsert=/INSERT INTO "Payment" \("id","saleId","method","amount"\)/;
  assert.match(checkout,paymentInsert);
  assert.match(reverse,paymentInsert);
  assert.doesNotMatch(reverse,/INSERT INTO "Payment" \([^)]*terminalRef/);
});
