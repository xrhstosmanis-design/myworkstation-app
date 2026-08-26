import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-product-actions.js",import.meta.url),"utf8");
const access=await readFile(new URL("../src/middleware/owner-product-access.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/KioskStyleProductCenterWithStock.jsx",import.meta.url),"utf8");

test("audience discounts are store and product scoped with variable percentages",()=>{
  assert.match(route,/StoreProductAudienceDiscount/);
  assert.match(route,/UNIQUE\("storeId","productId","audience"\)/);
  assert.match(route,/discountPercent:z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/);
  assert.match(route,/z\.enum\(\["DOCTOR","NURSE","STAFF","CUSTOMER"\]\)/);
});

test("only Owner or Super Admin can configure the bulk discount",()=>{
  assert.match(access,/role==="SUPER_ADMIN"\|\|role==="OWNER"\|\|platformRole==="SUPER_ADMIN"/);
  assert.match(route,/bulk-audience-discount/);
  assert.match(route,/StoreProductAudienceDiscountAudit/);
  assert.match(route,/productIds.*actorId/s);
});

test("inventory UI supports selected or visible products store audience and percentage",()=>{
  assert.match(ui,/Ομαδικές εκπτώσεις δικαιούχων/);
  assert.match(ui,/ΣΤΑ ΕΠΙΛΕΓΜΕΝΑ/);
  assert.match(ui,/ΣΕ ΟΛΑ ΤΑ ΕΜΦΑΝΙΖΟΜΕΝΑ/);
  for(const label of ["Ιατροί","Νοσηλευτές / Νοσοκόμοι","Προσωπικό","Πελάτες"])assert.match(ui,new RegExp(label));
  assert.match(ui,/0% απενεργοποιεί τον κανόνα/);
});
