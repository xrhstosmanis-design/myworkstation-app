import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const center=await readFile(new URL("../../client/src/components/platform/AiCommandCenter.jsx",import.meta.url),"utf8");
const platformRoutes=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("AI Command Center is an additive Super Admin screen",()=>{
  assert.match(app,/AI Command Center/);
  assert.match(app,/showAiCommandCenter/);
  assert.match(center,/data-ai-command-center="phase-7"/);
});

test("phase 2 reuses existing read-only checks and existing centers",()=>{
  assert.match(center,/Μία πηγή δεδομένων/);
  assert.match(center,/cash-control\/daily/);
  assert.match(center,/supplier-settlements\/review/);
  assert.match(center,/bank-ledger\/review/);
  for(const callback of ["onOpenChecks","onOpenCash","onOpenPayments","onOpenBank","onOpenEvents"]){
    assert.match(center,new RegExp(callback));
  }
});

test("future AI modules are labelled as later phases instead of simulated results",()=>{
  assert.match(center,/ΡΩΤΑ ΤΟ MYWORKSTATION/i);
  assert.match(center,/Φάση 7 · ενεργό/);
  assert.match(center,/Digital Twin/);
  assert.doesNotMatch(center,/setInterval|WebSocket|EventSource/);
});

test("phase 3 asks through the guarded read-only Platform endpoint",()=>{
  assert.match(center,/\/api\/platform\/ai-command-center\/ask/);
  assert.match(platformRoutes,/router\.post\("\/ai-command-center\/ask"/);
  assert.match(platformRoutes,/Δεν μπορείς να αλλάξεις δεδομένα ή να εκτελέσεις ενέργειες/);
  assert.match(platformRoutes,/aiCommandQuestionSchema\.parse/);
  assert.match(center,/question\.trim\(\)\|\|\"Ποια σημεία χρειάζονται έλεγχο σήμερα;/);
  assert.doesNotMatch(center,/disabled=\{askState\.loading\|\|question\.trim\(\)\.length/);
  assert.match(center,/companies:\{active:summary\.activeCompanies,inactive:summary\.inactiveCompanies/);
  assert.match(center,/problems:\{total:problemSummary\.total,cash:problemSummary\.cashIssues/);
});

test("phase 4 derives every store status from existing read-only checks",()=>{
  assert.match(center,/const storeStatuses=useMemo/);
  assert.match(center,/problems\.cash\?\.stores/);
  assert.match(center,/paymentsByStore/);
  assert.match(center,/bankByStore/);
  assert.match(center,/ΠΡΟΒΛΗΜΑ/);
  assert.match(center,/Χωρίς σημερινό κλείσιμο/);
  assert.match(center,/store\.open/);
});

test("phase 5 ranks up to five daily priorities from the existing snapshot",()=>{
  assert.match(center,/const dailyPriorities=useMemo/);
  assert.match(center,/\.slice\(0,5\)/);
  assert.match(center,/AI ΗΜΕΡΗΣΙΑ ΑΝΑΛΥΣΗ · ΦΑΣΗ 5/);
  assert.match(center,/καμία αυτόματη ενέργεια ή μεταβολή/);
  assert.match(center,/Πηγή: σημερινή επισκόπηση, Ταμεία, Πληρωμές και Τράπεζα/);
  assert.doesNotMatch(center,/daily-analysis.*method:"POST"/s);
});

test("phase 6 reads the existing Invoice Learning workspace without invoice writes",()=>{
  assert.match(center,/request\("\/api\/platform\/invoice-learning\/workspace"\)/);
  assert.match(center,/const invoiceDetective=useMemo/);
  assert.match(center,/INVOICE & SUPPLIER DETECTIVE · ΦΑΣΗ 6/);
  for(const label of ["Πρόχειρα","Γραμμές ελέγχου","Διαφορές συνόλου","Εκπτώσεις ελέγχου","Πιθανά διπλά","Μεταβολές τιμής"])assert.match(center,new RegExp(label));
  assert.match(center,/onOpenInvoices/);
  assert.match(app,/\/platform-admin\/invoice-learning-lab/);
  assert.match(center,/δεν γίνεται OCR, διόρθωση, πληρωμή, οριστικοποίηση ή κίνηση stock/);
  assert.doesNotMatch(center,/invoice-learning\/workspace",\{method:"(?:POST|PUT|DELETE)"/);
});

test("phase 7 explains existing cash and payment checks without financial writes",()=>{
  assert.match(center,/const cashPaymentIntel=useMemo/);
  assert.match(center,/AI ΤΑΜΕΙΩΝ &amp; ΠΛΗΡΩΜΩΝ · ΦΑΣΗ 7/);
  for(const label of ["Έλλειμμα μετρητών","Πλεόνασμα","Διαφορά POS–EFTPOS","Χωρίς αποδεικτικό","Πιθανά διπλά","Αποκλίσεις πληρωμών \/ τράπεζας"])assert.match(center,new RegExp(label));
  assert.match(center,/δεν εγκρίνεται, δεν διορθώνεται, δεν συμψηφίζεται και δεν δημιουργείται πληρωμή ή χρέωση/);
  for(const callback of ["onOpenCash","onOpenPayments","onOpenBank"])assert.match(center,new RegExp(callback));
  for(const endpoint of ["cash-control/daily","supplier-settlements/review","bank-ledger/review"]){
    assert.doesNotMatch(center,new RegExp(`request\\([^)]*${endpoint}[^)]*method:\"(?:POST|PUT|PATCH|DELETE)\"`));
  }
});
