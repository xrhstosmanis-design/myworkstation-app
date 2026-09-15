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
