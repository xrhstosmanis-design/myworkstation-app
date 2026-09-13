import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-advanced-online-search.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/InternetProductSearchPanel.jsx",import.meta.url),"utf8");
const launcher=await readFile(new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url),"utf8");
const platform=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("internet market search is owner/module gated and tenant scoped",()=>{
  assert.match(route,/OWNER_ONLY/);
  assert.match(route,/advancedOnlineSearchEntitlement\(companyId\)/);
  assert.match(route,/p\."companyId"=\$\{companyId\}/);
  assert.match(route,/"companyId"=\$\{companyId\}/);
});

test("internet market search records history and applies a price only after explicit locked approval",()=>{
  assert.match(route,/INSERT INTO "InternetProductSearch"/);
  assert.match(route,/status" TEXT NOT NULL DEFAULT 'PENDING'/);
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/decision==="APPROVE"/);
  assert.match(route,/UPDATE "StoreProduct" sp SET "salePrice"/);
  assert.match(route,/InternetPriceProposalAudit/);
  assert.match(ui,/δεν αλλάζουν τον κατάλογο/);
});

test("owner UI exposes catalog linking market prices offers margin and history",()=>{
  assert.match(launcher,/ADVANCED_ONLINE_PRODUCT_SEARCH/);
  assert.match(launcher,/Αναζήτηση προϊόντων στο Internet/);
  for(const text of ["Σύνδεση με δικό μας προϊόν","Δική μας αγορά","Δική μας πώληση","Margin","Φθηνότερη δημόσια τιμή","Πρόσφατες αναζητήσεις"])assert.match(ui,new RegExp(text));
  assert.match(index,/commerce\/internet-product-search/);
});

test("Super Admin gets a central company-scoped view and purchase suggestions",()=>{
  assert.match(index,/platform\/internet-product-search/);
  assert.match(platform,/Αναζήτηση Internet/);
  assert.match(platform,/basePath="\/api\/platform\/internet-product-search"/);
  for(const text of ["Πρόταση παραγγελίας","βασικό κόστος αγοράς","Προσθήκη στην πρόταση παραγγελίας"])assert.match(ui,new RegExp(text,"i"));
});

test("market bootstrap and provider failures cannot surface as a generic internal error",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "InternetProductSearch"/);
  assert.match(route,/catch\(error\)\{return \{configured:true,rows:\[\],reason:/);
  assert.match(route,/GOOGLE_CSE_API_KEY/);
  assert.match(ui,/Ο πάροχος Internet δεν απάντησε σωστά/);
});
