import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const catalog=await readFile(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/CommercialLicensePanel.jsx",import.meta.url),"utf8");
const publicRoute=await readFile(new URL("../src/routes/kat-online-ordering-modifiers.js",import.meta.url),"utf8");
const legacyPublicRoute=await readFile(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");

test("Online Store remains an optional commercially ready module",()=>{
  assert.match(catalog,/key:"ONLINE_ORDERING"[\s\S]*?commercialReady:true/);
  for(const plan of ["TRIAL","PILOT","BASIC","PRO","ENTERPRISE"]){const line=catalog.match(new RegExp(`${plan}:\\[([^\\]]*)\\]`))?.[1]||"";assert.doesNotMatch(line,/ONLINE_ORDERING/)}
});

test("commercial terms persist structured module pricing without billing",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "ModuleCommercialTerms"/);
  assert.match(bootstrap,/"monthlyPrice" DECIMAL\(14,2\)/);
  assert.match(route,/INSERT INTO "ModuleCommercialTerms"/);
  assert.match(route,/monthlyPrice:z\.coerce\.number\(\)\.min\(0\)/);
  assert.match(route,/COMMERCIAL_LICENSE_UPDATED/);
  assert.doesNotMatch(route,/chargeCustomer|capturePayment|createInvoice/);
});

test("license UI manages price, setup fee, billing cycle and entitlement dates",()=>{
  for(const label of ["Μηνιαία τιμή","Κόστος εγκατάστασης","Μηνιαία","Ετήσια","Εφάπαξ","Έναρξη","Λήξη","δεν πραγματοποιούν αυτόματη χρέωση"])assert.match(ui,new RegExp(label));
  assert.match(ui,/Συμφωνημένο μηνιαίο σύνολο/);
});

test("every public online route fails closed for the company license and store override",()=>{
  for(const source of [publicRoute,legacyPublicRoute]){
    assert.match(source,/companyModuleState\(store\.companyId\)/);
    assert.match(source,/state\?\.licenseAllowed/);
    assert.match(source,/"StorePaidModule"/);
    assert.match(source,/effectiveModuleEnabled\(state\.activeModules\.includes\("ONLINE_ORDERING"\)/);
    assert.match(source,/Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει/);
  }
});
