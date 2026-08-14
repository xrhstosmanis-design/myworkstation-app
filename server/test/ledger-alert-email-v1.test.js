import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const mail=fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("percentages keep the scoped backend alert but are not an entry control in the active-shift view",()=>{
  assert.match(route,/type:z\.enum\(\[[^\]]*"PERCENTAGES"[^\]]*\]\)/);
  assert.match(route,/type:z\.enum\(\[[^\]]*"TRANSFER_AMOUNT"[^\]]*\]\)/);
  assert.match(route,/body\.type==="PERCENTAGES"\?await notifyLedgerAlert/);
  assert.match(route,/companyId,role:"OWNER"/);
  assert.match(route,/store\.responsibleEmail/);
  assert.doesNotMatch(ui,/id:"PERCENTAGES",label:"Ποσοστά"/);
  assert.match(ui,/Κινήσεις ενεργής βάρδιας/);
});

test("every reversal is persisted before its email is attempted",()=>{
  const update=route.indexOf('UPDATE "StoreTransaction"');
  const notification=route.indexOf('kind:"REVERSAL"');
  assert.ok(update>0&&notification>update);
  assert.match(route,/return \{status:"FAILED",recipients\}/);
  assert.match(mail,/Αιτιολογία αντιλογισμού/);
  assert.match(mail,/Ημερομηνία \/ ώρα/);
  assert.match(mail,/Χρήστης/);
});

test("ordinary entries and transfer movements do not send alerts",()=>{
  assert.doesNotMatch(route,/TRANSFER_AMOUNT[\s\S]*notifyLedgerAlert\(\{[^}]*kind:"TRANSFER_AMOUNT"/);
  assert.doesNotMatch(route,/CASH_TRANSFER[\s\S]*notifyLedgerAlert/);
  assert.match(route,/const emailNotification=body\.type==="PERCENTAGES"/);
});
