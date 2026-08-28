import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const closeUi=fs.readFileSync(new URL("../../client/src/components/store/StoreShiftClosePanel.jsx",import.meta.url),"utf8");
const accessRoute=fs.readFileSync(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");
const cashRoute=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");

test("blind shift close follows management parameters instead of initial-cash permission",()=>{
  assert.match(accessRoute,/showExpectedAmounts:shifts\.showShiftCashAtClose===true/);
  assert.doesNotMatch(closeUi,/pos\?\.access\?\.initialCash/);
  assert.match(closeUi,/closePolicy\.showExpectedAmounts/);
});

test("shortage offers recount or an explicitly confirmed audited close",()=>{
  assert.match(cashRoute,/variance < -0\.009/);
  assert.match(cashRoute,/SHIFT_CLOSE_SHORTAGE_ATTEMPT/);
  assert.match(cashRoute,/SHIFT_RECOUNT_REQUIRED/);
  assert.match(cashRoute,/forceCloseWithShortage/);
  assert.match(cashRoute,/SHIFT_CLOSED_WITH_CONFIRMED_SHORTAGE/);
  assert.match(cashRoute,/declared:\{drawer:body\.drawer,custody:body\.custody,coins:body\.coins,safe:body\.safe,eftposTotal:body\.eftposTotal\}/);
  assert.match(cashRoute,/Θέλεις να ξαναμετρήσεις/);
  assert.match(closeUi,/ΝΑΙ — Ξαναμέτρηση/);
  assert.match(closeUi,/ΟΧΙ — Κλείσιμο με έλλειμμα/);
  assert.doesNotMatch(closeUi,/window\.confirm/);
  assert.match(closeUi,/forceCloseWithShortage:true/);
  assert.match(closeUi,/setCountConfirmed\(false\)/);
  assert.doesNotMatch(closeUi,/Η βάρδια έκλεισε και στάλθηκε για έλεγχο στο BackOffice/);
});
