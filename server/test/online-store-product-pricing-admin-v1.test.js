import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {onlineUnitPrice} from "../src/kat-online-ordering-bootstrap.js";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const manager=await readFile(new URL("../../client/src/components/platform/OnlineStoreManager.jsx",import.meta.url),"utf8");

test("online catalog administration is Super Admin-only, tenant scoped and module gated",()=>{
  assert.match(route,/Platform Super Admin/);
  assert.match(route,/moduleKey:"ONLINE_ORDERING",active:true/);
  assert.match(route,/p\."companyId"=\$\{req\.params\.companyId\}/);
  assert.match(route,/sp\."storeId"=\$\{store\.id\}/);
  assert.match(route,/Κάποιο προϊόν δεν ανήκει στα ενεργά προϊόντα αυτού του καταστήματος/);
});

test("online selection changes visibility without changing POS prices",()=>{
  assert.match(route,/UPDATE "OnlineProductVisibility" SET "visible"=false/);
  assert.match(route,/INSERT INTO "OnlineProductVisibility"/);
  assert.doesNotMatch(route,/UPDATE "StoreProduct" SET "salePrice"/);
  assert.doesNotMatch(route,/UPDATE "Product" SET "salePrice"/);
  assert.match(route,/ONLINE_STORE_PRODUCTS_UPDATED/);
  assert.match(route,/ONLINE_STORE_SETTINGS_UPDATED/);
});

test("online pricing supports fixed and percentage surcharge",()=>{
  assert.equal(onlineUnitPrice(4.8,{surchargeType:"FIXED",surchargeValue:0.5}),5.3);
  assert.equal(onlineUnitPrice(4.8,{surchargeType:"PERCENT",surchargeValue:10}),5.28);
});

test("Super Admin UI exposes catalog filters, visibility and public URL",()=>{
  assert.match(app,/OnlineStoreManager/);
  assert.match(app,/Online Store/);
  assert.match(manager,/Όλες οι κατηγορίες/);
  assert.match(manager,/Επιλογή φίλτρου/);
  assert.match(manager,/Η τιμή POS δεν αλλάζει/);
  assert.match(manager,/\/online\/\$\{settings\.publicSlug\}/);
});
