import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/owner-product-actions.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/commerce/inventoryProductActionsV2.js",import.meta.url),"utf8");
const audit=fs.readFileSync(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");

test("manual supplier return is tenant scoped and decrements stock once",()=>{
  assert.match(route,/router\.post\("\/:productId\/supplier-return"/);
  assert.match(route,/Supplier" WHERE "companyId"=\$\{company\}/);
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/movementType","quantity"[\s\S]*'SUPPLIER_RETURN'/);
  assert.match(route,/MANUAL_SUPPLIER_RETURN/);
  assert.match(route,/manual-supplier-return:/);
  assert.match(route,/Η επιστροφή δεν μπορεί να ξεπερνά το διαθέσιμο stock/);
});

test("inventory card collects supplier quantity and reason",()=>{
  assert.match(client,/Επιστροφή σε προμηθευτή/);
  assert.match(client,/\/api\/commerce\/suppliers/);
  assert.match(client,/data-supplier/);
  assert.match(client,/data-reason/);
  assert.match(client,/supplier-return/);
  assert.match(audit,/STOCK_SUPPLIER_RETURN="Επιστροφή σε προμηθευτή"/);
});
