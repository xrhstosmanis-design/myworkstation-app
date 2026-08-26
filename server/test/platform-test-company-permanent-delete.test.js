import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const storePos=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const commercialPos=await readFile(new URL("../../client/src/components/commerce/CommercialPosApp.jsx",import.meta.url),"utf8");

test("permanent company deletion stays behind the platform super-admin router guard",()=>{
  assert.match(route,/isSuperAdmin===true\|\|req\.user\?\.platformRole==="SUPER_ADMIN"/);
  assert.match(route,/router\.delete\("\/companies\/:companyId"/);
});

test("only the exact KAT TEST company is allowlisted",()=>{
  assert.match(route,/new Set\(\["KAT TEST"\]\)/);
  assert.match(route,/deletableTestCompanyNames\.has\(company\.name\)/);
  assert.doesNotMatch(route,/"Κυλικείο ΚΑΤ"/);
});

test("server requires both exact confirmations and records an audit",()=>{
  assert.match(route,/confirmationName!==company\.name/);
  assert.match(route,/confirmationPhrase!==permanentDeletePhrase/);
  assert.match(route,/TEST_COMPANY_PERMANENTLY_DELETED/);
  assert.match(route,/tx\.company\.delete/);
});

test("platform UI exposes destructive flow only for KAT TEST",()=>{
  assert.match(ui,/company\.name==="KAT TEST"/);
  assert.match(ui,/Οριστική διαγραφή KAT TEST/);
  assert.match(ui,/DELETE KAT TEST/);
  assert.match(ui,/method:"DELETE"/);
});

test("deleted KAT TEST is not exposed by the production platform or POS chrome",()=>{
  assert.doesNotMatch(entry,/KatTestQuickAccess/);
  assert.doesNotMatch(entry,/window\.location\.(?:assign|replace)\("\/platform-admin\/kat-test"\)/);
  assert.doesNotMatch(commercialPos,/window\.location\.assign\("\/platform-admin\/kat-test"\)/);
  assert.doesNotMatch(storePos,/KAT TEST \/ PILOT/);
  assert.match(storePos,/ΠΙΛΟΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ/);
});
