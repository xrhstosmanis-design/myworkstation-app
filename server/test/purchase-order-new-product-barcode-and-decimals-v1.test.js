import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(
  new URL(
    "../../client/src/components/commerce/installPurchaseOrdersSuite.js",
    import.meta.url,
  ),
  "utf8",
);
const resolution = await readFile(
  new URL("../src/routes/purchase-order-ocr-resolution.js", import.meta.url),
  "utf8",
);

test("new invoice products offer provided, internal, or pending barcode", () => {
  assert.match(client, /Barcode νέου είδους/);
  assert.match(client, /Έχω barcode είδους/);
  assert.match(client, /Δημιουργία εσωτερικού MyWorkStation/);
  assert.match(client, /Χωρίς barcode προς το παρόν/);
  assert.match(client, /ocr-lines\/\$\{l\.id\}\/create-product/);
  assert.match(resolution, /barcodeMode:z\.enum\(\["PROVIDED","GENERATED","NONE"\]\)/);
  assert.match(resolution, /generateInternalBarcode/);
  assert.match(resolution, /const ean13=/);
});

test("decimal amount editor keeps comma input while the user is typing", () => {
  assert.match(client, /const num=value=>[\s\S]*replace\(",","\."\)/);
  assert.match(
    client,
    /!input\.matches\([\s\S]*\[name\^="discountAmount"\][\s\S]*\[name="finalUnitCost"\]/,
  );
  assert.match(client, /discount1:num\(f\.get\("discount1"\)\)/);
  assert.match(client, /unitCost:num\(f\.get\("unitCost"\)\)/);
});
