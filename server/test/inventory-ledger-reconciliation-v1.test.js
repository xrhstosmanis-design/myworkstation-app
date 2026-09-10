import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/inventory-product-ledger.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/commerce/inventoryContextCorrections.js",import.meta.url),"utf8");

test("inventory reconciliation compares current stock with the complete tenant-scoped ledger",()=>{
  assert.match(route,/storePaidModuleState\(storeId,"LOSS_DETECTION"\)/);
  assert.match(route,/isPlatformSuperAdmin\(req\.user\)/);
  assert.match(route,/reconciliationAccess\.allowed\?prisma\.\$queryRaw/);
  assert.match(route,/COALESCE\(SUM\(sm\."quantity"\),0\) AS "ledgerStock"/);
  assert.match(route,/st\."companyId"=\$\{companyId\}/);
  assert.match(route,/p\."companyId"=\$\{companyId\}/);
  assert.match(route,/difference=currentStock-ledgerStock/);
});

test("duplicate movement candidates are read-only findings",()=>{
  assert.match(route,/HAVING COUNT\(\*\)>1/);
  assert.doesNotMatch(route,/DELETE FROM "StockMovement"/);
  assert.match(route,/duplicateCandidates/);
});

test("movement dialog shows a clear reconciliation result",()=>{
  for(const label of ["ΣΥΜΦΩΝΙΑ STOCK","ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ","Τρέχον:","Καταγεγραμμένες κινήσεις:","Διαφορά:","Πιθανές διπλές:"])assert.match(client,new RegExp(label));
  assert.match(client,/Διαθέσιμο στο επί πληρωμή module «Έλεγχος Απωλειών»/);
});
