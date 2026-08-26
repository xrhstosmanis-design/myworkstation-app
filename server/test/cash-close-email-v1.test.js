import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const mail=fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");

test("cash close persists successfully and leaves owner reporting to the Super Admin",()=>{
  const update=cash.indexOf('UPDATE "CashShiftSession"');
  const manual=cash.indexOf("MANUAL_SEND_REQUIRED");
  assert.ok(update>0&&manual>update);
  assert.doesNotMatch(cash,/await sendCashShiftClosedEmail/);
});

test("cash report includes opening, cash, EFTPOS and duplicate-sale review",()=>{
  assert.match(mail,/Math\.abs\(openingVariance\)>0\.009/);
  assert.match(mail,/Αναμενόμενη έναρξη/);
  assert.match(mail,/Δηλωμένη έναρξη/);
  assert.match(mail,/Διαφορά έναρξης/);
  assert.match(mail,/Διαφορά POS–EFTPOS/);
  assert.match(mail,/Διαφορά ταμείου/);
  assert.match(mail,/Έλεγχος διπλών συναλλαγών/);
  assert.match(mail,/escapeHtml/);
});

test("cash close never depends on email delivery",()=>{
  assert.match(cash,/emailNotification:\{status:"MANUAL_SEND_REQUIRED",recipients:\[\]\}/);
  assert.doesNotMatch(cash,/Cash close email failed/);
});
