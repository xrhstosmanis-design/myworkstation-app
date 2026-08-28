import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const closeUi=fs.readFileSync(new URL("../../client/src/components/store/StoreShiftClosePanel.jsx",import.meta.url),"utf8");
const accessRoute=fs.readFileSync(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");

test("blind shift close follows management parameters instead of initial-cash permission",()=>{
  assert.match(accessRoute,/showExpectedAmounts:shifts\.showShiftCashAtClose===true/);
  assert.doesNotMatch(closeUi,/pos\?\.access\?\.initialCash/);
  assert.match(closeUi,/closePolicy\.showExpectedAmounts/);
});

test("shortage warning appears only after authoritative close response",()=>{
  const closeCall=closeUi.indexOf('const closed=await api(`/api/cash/sessions/');
  const warning=closeUi.indexOf("ΠΡΟΣΟΧΗ — ΕΛΛΕΙΜΜΑ ΒΑΡΔΙΑΣ");
  assert.ok(closeCall>=0&&warning>closeCall);
  assert.match(closeUi,/variance<-.009&&closePolicy\.notifyShortage/);
  assert.match(closeUi,/στάλθηκε για έλεγχο στο BackOffice/);
});
