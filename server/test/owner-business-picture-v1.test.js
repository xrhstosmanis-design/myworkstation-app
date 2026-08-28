import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-payments.js",import.meta.url),"utf8");
const panel=await readFile(new URL("../../client/src/components/cloud/OwnerBusinessPicture.jsx",import.meta.url),"utf8");
const actions=await readFile(new URL("../../client/src/components/cloud/OwnerPaymentQuickActions.jsx",import.meta.url),"utf8");

test("owner business picture is restricted and calculated from real ledgers",()=>{
  assert.match(route,/router\.get\("\/business-picture"/);
  assert.match(route,/requireOwnerReport\(req\)/);
  assert.match(route,/FROM "SaleLine"/);
  assert.match(route,/FROM "PurchaseDocument"/);
  assert.match(route,/FROM "StoreTransaction"/);
  assert.match(route,/grossProfit/);
  assert.match(route,/netProfit/);
});

test("fourth-screen owner actions expose Eikona Epixeiriseis",()=>{
  assert.match(actions,/Εικόνα Επιχειρήσεις/);
  assert.match(actions,/OwnerBusinessPicture/);
  assert.match(panel,/owner-payments\/business-picture/);
});

test("business picture offers monthly summary daily drilldown and exports",()=>{
  assert.match(panel,/Έτος-Μήνας/);
  assert.match(panel,/daysByMonth/);
  assert.match(panel,/Πωλήσεις \(με ΦΠΑ\)/);
  assert.match(panel,/Αγορές \(χ\. ΦΠΑ\)/);
  assert.match(panel,/Ακαθ\. κέρδος/);
  assert.match(panel,/Καθ\. κέρδος/);
  assert.match(panel,/Excel \/ CSV/);
  assert.match(panel,/Εκτύπωση/);
});
