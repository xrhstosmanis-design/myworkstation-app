import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("POS catalog exposes the functional product flags",async()=>{
  const route=await read("../src/routes/store-pos-catalog.js");
  assert.match(route,/p\."freeSalePrice"/);
  assert.match(route,/p\."negativeStockWarning"/);
});

test("free sale price opens price entry and negative stock warns immediately",async()=>{
  const panel=await read("../../client/src/components/store/StorePosPanel.jsx");
  assert.match(panel,/if\(product\.freeSalePrice\).*setPriceEdit\(nextRow\)/);
  assert.match(panel,/warnNegativeStock\(row,newQuantity\)/);
  assert.match(panel,/οδηγεί σε αρνητικό απόθεμα/);
});
