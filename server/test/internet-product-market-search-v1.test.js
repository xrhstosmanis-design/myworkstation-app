import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-advanced-online-search.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/InternetProductSearchPanel.jsx",import.meta.url),"utf8");
const launcher=await readFile(new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url),"utf8");

test("internet market search is owner/module gated and tenant scoped",()=>{
  assert.match(route,/OWNER_ONLY/);
  assert.match(route,/advancedOnlineSearchEntitlement\(req\.user\.companyId\)/);
  assert.match(route,/p\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
});

test("internet market search records history and never applies prices",()=>{
  assert.match(route,/INSERT INTO "InternetProductSearch"/);
  assert.doesNotMatch(route,/UPDATE "StoreProduct" SET "salePrice"/);
  assert.match(ui,/δεν αλλάζουν τον κατάλογο/);
});

test("owner UI exposes catalog linking market prices offers margin and history",()=>{
  assert.match(launcher,/ADVANCED_ONLINE_PRODUCT_SEARCH/);
  assert.match(launcher,/Αναζήτηση προϊόντων στο Internet/);
  for(const text of ["Σύνδεση με δικό μας προϊόν","Δική μας αγορά","Δική μας πώληση","Margin","Φθηνότερη δημόσια τιμή","Πρόσφατες αναζητήσεις"])assert.match(ui,new RegExp(text));
  assert.match(index,/commerce\/internet-product-search/);
});
