import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/pos-sale-actions.js",import.meta.url),"utf8");
const gate=await readFile(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");
const display=await readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8");

test("POS return uses the single central BackOffice returnItems permission gate",()=>{
  assert.match(gate,/returnItems:Boolean\(p\.returnItems\)/);
  assert.match(gate,/!access\.returnItems/);
  assert.match(gate,/permission:"returnItems"/);
  assert.match(gate,/action:"SALE_REVERSE"/);
  assert.doesNotMatch(route,/requireReturnPermission/);
  assert.doesNotMatch(route,/StoreOperatorCredential/);
});

test("POS reversal restores tracked BackOffice stock without depending on StockMovement schema",()=>{
  assert.match(route,/p\."trackStock"=TRUE RETURNING sp\."productId"/);
  assert.match(route,/restoredProductIds\.push/);
  assert.match(route,/stockRestoredProductIds:restoredProductIds/);
  assert.doesNotMatch(route,/INSERT INTO "StockMovement"/);
  assert.match(route,/POS_RETURN_COMPLETED/);
});

test("BackOffice sales journal includes POS reversal item and payment rows",()=>{
  assert.match(display,/s\."source" IN \('POS','EXCHANGE','POS_REVERSAL'\)/);
  assert.match(display,/productSummary/);
  assert.match(display,/paymentSummary/);
  assert.match(display,/originalSaleId/);
  assert.match(display,/reversalKind/);
});
