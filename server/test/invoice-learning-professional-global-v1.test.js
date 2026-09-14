import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const lab=fs.readFileSync(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
const workspace=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-workspace.js",import.meta.url),"utf8");

test("Invoice Learning uses the professional invoice review layout",()=>{
  assert.match(lab,/Οικονομικός έλεγχος τιμολογίου/);
  assert.match(lab,/Αρχική αξία/);
  assert.match(lab,/Σύνολο με ΦΠΑ/);
  assert.match(lab,/Επιβεβαίωση & Κεντρική Εκμάθηση/);
  assert.match(lab,/Νέο είδος/);
  assert.match(lab,/Διαγραφή Όλων/);
});

test("confirmed learning is persisted centrally before success is reported",()=>{
  assert.match(lab,/async function saveCentral/);
  assert.match(lab,/await saveCentral\(\)/);
  assert.match(lab,/SUPER_ADMIN_LINE_CORRECTION/);
  assert.match(lab,/θα εφαρμόζεται στα νέα τιμολόγια όλων των καταστημάτων/);
  assert.match(workspace,/const SCOPE="PLATFORM_GLOBAL"/);
  assert.match(workspace,/InvoiceSupplierReadingProfile/);
  assert.match(workspace,/central:true/);
});

test("learning remains isolated from stock and accounting",()=>{
  assert.match(lab,/Δεν ενημερώνεται απόθεμα ή λογιστική/);
  assert.doesNotMatch(lab,/prisma db push/);
});
