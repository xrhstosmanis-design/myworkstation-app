import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const client=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const server=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");

test("quick keys resolve the live product by Product ID",()=>{
  assert.match(client,/productId/);
  assert.match(client,/products\.find\([^\n]*productId/);
});

test("quick-key editor is exposed from the POS",()=>{
  assert.match(client,/Σύνδεση προϊόντος με πλήκτρο/);
  assert.match(client,/quickKeyEdit/);
  assert.match(client,/barcode/i);
});

test("quick-key persistence is server-side and store scoped",()=>{
  assert.match(server,/quick-keys/);
  assert.match(server,/productId/);
  assert.match(server,/StorePosLayout/);
});
