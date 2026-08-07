import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const platformSource=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const storeSource=fs.readFileSync(new URL("../../client/src/components/cloud/StoreCloudPage.jsx",import.meta.url),"utf8");
const styleSource=fs.readFileSync(new URL("../../client/src/styles.css",import.meta.url),"utf8");
const platformRoutes=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("Super Admin exposes an explicit full Backoffice entry for every selected store",()=>{
  assert.match(platformSource,/openCustomer\(storeCompany,store,"BACKOFFICE"\)/);
  assert.match(platformSource,/Πλήρες Backoffice/);
  assert.match(platformSource,/supportStore/);
  assert.match(platformRoutes,/destination:z\.enum\(\["ALL","BACKOFFICE","SHIFTS","CASH_CONTROL"\]\)/);
});

test("customer Backoffice unifies the active operational modules without duplicating routes",()=>{
  for(const label of ["Χειριστές","Πωλήσεις & Πληρωμές","Βάρδιες & Ταμεία","Προϊόντα & Απόθεμα","Συσκευές","Ιστορικό"]){
    assert.match(storeSource,new RegExp(label));
  }
  for(const anchor of ["backoffice-operators","backoffice-transactions","backoffice-cash","backoffice-catalog","backoffice-devices","backoffice-audit"]){
    assert.match(storeSource,new RegExp(anchor));
  }
  assert.match(storeSource,/OperatorAccessPanel/);
  assert.match(storeSource,/StoreTransactionsPanel/);
  assert.match(storeSource,/CashControlPanel/);
});

test("Backoffice navigation preserves the current visual system and responsive behavior",()=>{
  assert.match(styleSource,/\.backoffice-section-nav/);
  assert.match(styleSource,/backdrop-filter:blur/);
  assert.match(styleSource,/scroll-margin-top/);
});
