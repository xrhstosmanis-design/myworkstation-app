import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/owner-product-actions.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/commerce/inventoryProductActionsV2.js",import.meta.url),"utf8");
const audit=fs.readFileSync(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");

test("manual supplier return creates a tenant scoped dispatch draft without stock mutation",()=>{
  assert.match(route,/router\.post\("\/:productId\/supplier-return"/);
  assert.match(route,/Supplier" WHERE "companyId"=\$\{company\}/);
  assert.match(route,/INSERT INTO "DispatchNote"/);
  assert.match(route,/INSERT INTO "DispatchNoteLine"/);
  assert.match(route,/stockChanged:false/);
  assert.doesNotMatch(route,/MANUAL_SUPPLIER_RETURN/);
});

test("inventory card collects supplier quantity and reason",()=>{
  assert.match(client,/Δελτίο Αποστολής Επιστροφής/);
  assert.match(client,/\/api\/commerce\/suppliers/);
  assert.match(client,/data-supplier/);
  assert.match(client,/data-reason/);
  assert.match(client,/supplier-return/);
  assert.match(audit,/STOCK_SUPPLIER_RETURN="Επιστροφή σε προμηθευτή"/);
});

test("POS can prepare the same return dispatch note without changing stock",()=>{
  const provider=fs.readFileSync(new URL("../src/routes/provider-logistics.js",import.meta.url),"utf8");
  const pos=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
  assert.match(provider,/store-pos\/supplier-return-drafts/);
  assert.match(provider,/stockChanged:false/);
  assert.match(pos,/ΔΕΛΤΙΟ ΕΠΙΣΤΡΟΦΗΣ/);
  assert.match(pos,/Αποθήκευση πρόχειρου/);
  assert.match(pos,/δεν αλλάζει πριν από επιτυχημένη διαβίβαση/);
});
