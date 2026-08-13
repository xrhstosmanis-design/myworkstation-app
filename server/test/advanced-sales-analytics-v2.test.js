import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-v1-legacy.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/AdvancedSalesAnalytics.jsx",import.meta.url),"utf8");

test("advanced analytics is tenant scoped and supports all-store or one-store reports",()=>{
  assert.match(route,/\/sales\/advanced-report/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/\$\{storeId\}::text IS NULL/);
  assert.match(route,/revenueChangePercent/);
});

test("advanced analytics returns the master plan dimensions",()=>{
  for(const field of ["daily","hours","categories","products","employees","stores","methods","statuses"])assert.match(route,new RegExp(field));
  assert.match(route,/SUM\("discount"\)/);
});

test("analytics UI keeps non fiscal warning and does not invent returns",()=>{
  assert.match(client,/ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΑΝΑΛΥΣΗ/);
  assert.match(client,/Κατηγορίες/);
  assert.match(client,/Εργαζόμενοι/);
  assert.match(client,/Ακυρώσεις και επιστροφές εμφανίζονται μόνο όταν υπάρχει πραγματική/);
});
