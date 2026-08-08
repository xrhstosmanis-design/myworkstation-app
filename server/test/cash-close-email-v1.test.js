import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const mail=fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");

test("cash close sends a tenant owner report after the close is persisted",()=>{
  const update=cash.indexOf('UPDATE "CashShiftSession"');
  const send=cash.indexOf("await sendCashShiftClosedEmail");
  assert.ok(update>0&&send>update);
  assert.match(cash,/companyId:req\.user\.companyId,role:"OWNER"/);
  assert.match(cash,/emailNotification=\{status:"FAILED",recipients\}/);
  assert.match(cash,/res\.json\(\{\.\.\.closed,emailNotification\}\)/);
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

test("cash close remains successful even when notification delivery fails",()=>{
  assert.match(cash,/catch\(error\)[\s\S]*emailNotification=\{status:"FAILED"/);
  assert.match(ui,/Η βάρδια έκλεισε κανονικά, αλλά το email αναφοράς δεν στάλθηκε/);
});
