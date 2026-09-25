import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const cash=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const analytics=await readFile(new URL("../../client/src/components/commerce/AdvancedSalesAnalytics.jsx",import.meta.url),"utf8");
const sales=await readFile(new URL("../../client/src/components/commerce/installKioskReportsSalesV4.js",import.meta.url),"utf8");

test("Gate 7 reporting overview is BackOffice-only and spans every terminal",()=>{
  const route=cash.slice(cash.indexOf('router.get("/stores/:storeId/reporting-overview"'),cash.indexOf('router.get("/stores/:storeId/daily-summary"'));
  assert.match(route,/STORE_OPERATOR/);
  assert.match(route,/OWNER/);
  assert.match(route,/ADMIN/);
  assert.match(route,/MANAGER/);
  assert.match(route,/WHERE s\."companyId"=\$\{req\.user\.companyId\} AND s\."storeId"=\$\{store\.id\}/);
  assert.doesNotMatch(route,/s\."terminalPos"=/);
  assert.match(route,/"transactionCount"/);
  assert.match(route,/recentTransactions/);
});

test("Gate 7 report timestamps are rendered in the Athens timezone",()=>{
  assert.match(analytics,/timeZone:"Europe\/Athens"/);
  assert.match(sales,/timeZone:"Europe\/Athens"/);
});

test("Gate 7 analytics presents detailed Greek product and operator sections",()=>{
  assert.match(analytics,/Αναλυτικά προϊόντα/);
  assert.match(analytics,/Αναλυτικά ανά χειριστή/);
  assert.match(analytics,/Ποσότητα/);
  assert.match(analytics,/Εκπτώσεις/);
  assert.match(analytics,/Περιθώριο/);
  assert.doesNotMatch(analytics,/>Margin</);
  assert.match(analytics,/report\?\$\{q\}/);
});
