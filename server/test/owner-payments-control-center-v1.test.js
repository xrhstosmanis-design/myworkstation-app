import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-payments.js",import.meta.url),"utf8");
const installer=await readFile(new URL("../../client/src/components/commerce/installOwnerPaymentsSuite.js",import.meta.url),"utf8");
const css=await readFile(new URL("../../client/src/components/commerce/owner-payments-suite.css",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("owner payments report is restricted and reads real commercial sources",()=>{
  assert.match(route,/ownerRoles=new Set\(\["OWNER","ADMIN","MANAGER"\]\)/);
  assert.match(route,/StoreTransaction/);
  assert.match(route,/PurchaseDocument/);
  assert.match(route,/FROM "Sale"/);
  assert.match(route,/missingAttachments/);
  assert.match(route,/reversedCount/);
  assert.match(route,/percentOfSales/);
  assert.match(route,/changePercent/);
});

test("owner payments UI exposes kiosk-style criteria and full audit views",()=>{
  assert.match(installer,/Κριτήρια αναζήτησης/);
  assert.match(installer,/data-op-from/);
  assert.match(installer,/data-op-to/);
  assert.match(installer,/Όλα τα καταστήματα/);
  assert.match(installer,/Όλοι οι προμηθευτές/);
  assert.match(installer,/Τρέχον έτος/);
  assert.match(installer,/Τρέχων μήνας/);
  assert.match(installer,/Σήμερα/);
  assert.match(installer,/Excel \/ CSV/);
  assert.match(installer,/Αναλυτικές κινήσεις/);
  assert.match(installer,/Έλεγχοι \/ Alerts/);
  assert.match(installer,/data-op-photo/);
  assert.match(installer,/Χειριστής/);
  assert.match(installer,/Αφαιρέθηκε/);
});

test("owner view does not invent accounting debt",()=>{
  assert.match(installer,/Η διαφορά δεν αποτελεί λογιστική οφειλή/);
  assert.doesNotMatch(installer,/Απλήρωτα|Ληξιπρόθεσμα/);
});

test("suite is mounted in client and server entry points",()=>{
  assert.match(entry,/installOwnerPaymentsSuite/);
  assert.match(entry,/owner-payments-suite\.css/);
  assert.match(server,/ownerPaymentsRoutes/);
  assert.match(server,/\/api\/owner-payments/);
  assert.match(css,/owner-payments-active/);
});
