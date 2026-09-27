import test from "node:test";
import assert from "node:assert/strict";
import {verifiedSetUnit} from "../src/lib/invoice-assistant-set-units.js";

test("printed set count is proposed from a clear 3X250ML name and remains reviewable",()=>{
  const line={supplierCode:"633 1004931",description:"ΧΙΟΣ ΛΕΜ 3X250ML",invoiceUnit:"ΣΕΤ",quantity:"2",stockUnitsPerInvoiceUnit:"1",confidence:"certain",reviewReason:""};
  const unverified=verifiedSetUnit(line,[{supplierCode:"667",piecesPerPackage:3}]);
  assert.equal(unverified.invoiceUnit,"PACKAGE");
  assert.equal(unverified.quantity,"2");
  assert.equal(unverified.stockUnitsPerInvoiceUnit,"3");
  assert.equal(unverified.confidence,"uncertain");
  assert.match(unverified.reviewReason,/Επιβεβαίωσε/);
  const verified=verifiedSetUnit(line,[{supplierCode:"633 1004931",piecesPerPackage:3}]);
  assert.equal(verified.stockUnitsPerInvoiceUnit,"3");
  assert.equal(Number(verified.quantity)*Number(verified.stockUnitsPerInvoiceUnit),6);
  assert.equal(verified.confidence,"certain");
  const unknown=verifiedSetUnit({...line,description:"ΧΙΟΣ ΛΕΜ 250ML"},[]);
  assert.equal(unknown.stockUnitsPerInvoiceUnit,"");
  assert.equal(unknown.confidence,"uncertain");
  const abbreviated=verifiedSetUnit({...line,supplierCode:"667 1004932",description:"ΧΙΟΣ ΧΥΜ ΠΟΡΤ 3X250"},[]);
  assert.equal(abbreviated.quantity,"2");
  assert.equal(abbreviated.stockUnitsPerInvoiceUnit,"3");
  assert.equal(abbreviated.confidence,"uncertain");
});
