import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/lib/invoice-supplier-profile-runtime.js",import.meta.url),"utf8");

test("supplier stock conversion preserves invoice quantity and price",()=>{
  const block=source.slice(source.indexOf("function applySupplierStockConversion"),source.indexOf("function applyMappings"));
  assert.match(block,/quantity:invoiceQuantity/);
  assert.match(block,/unitCost:packageUnitPrice/);
  assert.match(block,/stockUnitsPerInvoiceUnit:factor/);
  assert.match(block,/stockQuantity=money4\(invoiceQuantity\*factor\)/);
  assert.doesNotMatch(block,/quantity:money4\(invoiceQuantity\*factor\)/);
  assert.doesNotMatch(block,/unitCost:money4\(packageUnitPrice\/factor\)/);
});

test("purchase review displays learned package economics per stock piece",async()=>{
  const client=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
  assert.match(client,/const stockUnitCost=line=>Number\(line\?\.unitCost\|\|0\)\/Math\.max\(1,Number\(line\?\.stockUnitsPerInvoiceUnit\|\|1\)\)/);
  assert.match(client,/title="Τιμή συσκευασίας:/);
  assert.match(client,/ανά τεμάχιο/);
});
