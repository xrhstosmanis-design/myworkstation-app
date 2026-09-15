import assert from "node:assert/strict";
import test from "node:test";
import {detectInvoiceDocumentType} from "../src/routes/platform-invoice-learning-ai.js";

test("Invoice Learning recognises Greek supplier credit/return headings",()=>{
  assert.equal(detectInvoiceDocumentType("Πιστ. Τιμ. Δελ. Παραλαβής Επιστροφή"),"CREDIT_NOTE");
  assert.equal(detectInvoiceDocumentType("ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ"),"CREDIT_NOTE");
  assert.equal(detectInvoiceDocumentType("ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ"),"INVOICE");
});

test("credit detection does not use amounts",()=>{
  assert.equal(detectInvoiceDocumentType("Σύνολο -9,06 €"),"INVOICE");
  assert.equal(detectInvoiceDocumentType("Credit Note / supplier return"),"CREDIT_NOTE");
});
