import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [route,modal]=await Promise.all([
  readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8"),
  readFile(new URL("../../client/src/components/store/StoreShiftTransactionsModal.jsx",import.meta.url),"utf8")
]);

test("recent shift sales include WASTE so waste is visible without creating a duplicate financial record",()=>{
  assert.match(route,/s\."source" IN \('POS','EXCHANGE','POS_REVERSAL','WASTE'\)/);
  assert.match(route,/row\.source==="WASTE"\?"WASTE":"SALE"/);
});

test("active shift modal labels waste distinctly and marks it as no receipt",()=>{
  assert.match(modal,/s\.source==="WASTE"\?"WASTE"/);
  assert.match(modal,/row\.kind==="WASTE"\?"ΦΥΡΑ":"Πώληση"/);
  assert.match(modal,/row\.kind==="WASTE"\?" · Χωρίς απόδειξη":""/);
});
