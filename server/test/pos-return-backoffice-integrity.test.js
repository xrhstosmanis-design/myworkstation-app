import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/pos-sale-actions.js",import.meta.url),"utf8");
const display=await readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8");

test("POS return uses central BackOffice returnItems permission",()=>{
  assert.match(route,/permissions\.returnItems/);
  assert.match(route,/StoreOperatorProfile/);
  assert.match(route,/POS_RETURN_DENIED_PERMISSION/);
});

test("POS reversal restores tracked stock and writes StockMovement in same transaction",()=>{
  assert.match(route,/p\."trackStock"=TRUE RETURNING sp\."productId"/);
  assert.match(route,/INSERT INTO "StockMovement"/);
  assert.match(route,/'POS_REVERSAL'/);
  assert.match(route,/POS_RETURN_COMPLETED/);
});

test("BackOffice sales journal includes POS reversal item and payment rows",()=>{
  assert.match(display,/s\."source" IN \('POS','EXCHANGE','POS_REVERSAL'\)/);
  assert.match(display,/productSummary/);
  assert.match(display,/paymentSummary/);
  assert.match(display,/originalSaleId/);
  assert.match(display,/reversalKind/);
});
