import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-shifts.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installOwnerShiftControlCenter.js",import.meta.url),"utf8");
const css=await readFile(new URL("../../client/src/components/commerce/owner-shift-control-center.css",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("owner shift management allows platform Super Admin and uses real shift sources",()=>{
  assert.match(route,/"SUPER_ADMIN","OWNER","ADMIN","MANAGER"/);
  assert.match(route,/CashShiftSession/);
  assert.match(route,/StoreTransaction/);
  assert.match(route,/FROM "Sale"/);
  assert.match(route,/JOIN "SaleLine"/);
  assert.match(route,/FROM "Payment"/);
  assert.match(route,/companyId=req\.user\.companyId/);
});

test("main shift table exposes A A and clickable Difference",()=>{
  assert.match(client,/Α\/Α/);
  assert.match(client,/data-osc-detail/);
  assert.match(client,/data-osc-difference/);
  assert.match(client,/Παρέδωσα/);
  assert.match(client,/EFTPOS/);
  assert.match(client,/Βάρδιες & Διαφορές/);
});

test("A A opens full shift while Difference opens variance tab directly",()=>{
  assert.match(client,/openDetail\(root,b\.dataset\.oscDetail,"ledger"\)/);
  assert.match(client,/openDetail\(root,b\.dataset\.oscDifference,"difference"\)/);
  assert.match(client,/Ημερολόγιο κινήσεων/);
  assert.match(client,/ανά κατηγορία/);
  assert.match(client,/ανά Τμήμα ΦΠΑ/);
  assert.match(client,/Συγκεντρωτικά/);
  assert.match(client,/Ανάλυση χρηματικού/);
  assert.match(client,/"difference","Διαφορά"/);
});

test("difference drilldown explains real cash formula and contributing events",()=>{
  assert.match(route,/Διαφορά = Πραγματικό λειτουργικό κλείσιμο − Αναμενόμενο λειτουργικό κλείσιμο/);
  assert.match(route,/openingVariance/);
  assert.match(route,/cardVariance/);
  assert.match(route,/deductedSupplierPayments/);
  assert.match(route,/deductedOtherExpenses/);
  assert.match(route,/duplicateReview/);
  assert.match(route,/REVERSAL/);
  assert.match(client,/Συνέχεια ελέγχου διαφοράς/);
  assert.match(client,/Μόνο οι κινήσεις με ρητή «Αφαίρεση από τη βάρδια»/);
});

test("VAT view remains empty until a real fiscal source exists",()=>{
  assert.match(route,/vatFiscal:false/);
  assert.match(route,/πραγματική φορολογική πηγή\/Connector/);
  assert.match(client,/Δεν εμφανίζονται εικονικές τιμές ΦΠΑ/);
});

test("owner shift suite is wired into client server and visual baseline",()=>{
  assert.match(entry,/installOwnerShiftControlCenter/);
  assert.match(entry,/owner-shift-control-center\.css/);
  assert.match(server,/ownerShiftsRoutes/);
  assert.match(server,/\/api\/owner-shifts/);
  assert.match(css,/owner-shifts-active/);
  assert.match(css,/#133f62/);
  assert.match(css,/#2079c7/);
});
