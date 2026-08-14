import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-payments.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installOwnerPaymentsSuite.js",import.meta.url),"utf8");

test("BackOffice treats linked AI Reader PurchaseDocument as valid payment evidence",()=>{
  assert.match(route,/application\/vnd\.myworkstation\.purchase-document/);
  assert.match(route,/attachmentMimeType/);
  assert.match(route,/purchaseDocumentId/);
  assert.match(route,/evidenceMode:linkedPurchaseDocument\?"DOCUMENT"/);
  assert.match(route,/COALESCE\(t\."attachmentMimeType",''\)<>\$\{purchaseDocumentMime\}/);
});

test("BackOffice exposes payment source and evidence without opening a fake photo",()=>{
  assert.match(ui,/row\.paymentSource==="CASH_SHIFT"\?"Από βάρδια":"Εξωτερική"/);
  assert.match(ui,/row\.evidenceMode==="DOCUMENT"/);
  assert.match(ui,/AI Reader/);
  assert.match(ui,/row\.evidenceMode==="LEGACY_PHOTO"/);
  assert.match(ui,/Χωρίς παραστατικό/);
  assert.match(ui,/data-op-photo/);
});

test("BackOffice alerts only explicitly undocumented payments",()=>{
  assert.match(ui,/active\.filter\(row=>row\.evidenceMode==="NO_DOCUMENT"\)/);
  assert.doesNotMatch(ui,/active\.filter\(row=>!row\.hasAttachment\)/);
});

test("BackOffice CSV preserves evidence and cash-source audit",()=>{
  assert.match(ui,/Πηγή πληρωμής/);
  assert.match(ui,/ΑΠΟ ΒΑΡΔΙΑ/);
  assert.match(ui,/ΕΞΩΤΕΡΙΚΗ/);
  assert.match(ui,/AI Reader \$\{row\.purchaseDocumentId\|\|""\}/);
});
