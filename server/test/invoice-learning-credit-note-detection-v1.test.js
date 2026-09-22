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

test("a sales invoice stays an invoice despite a previous balance or incidental return wording",()=>{
  assert.equal(detectInvoiceDocumentType("ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ - ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ ΠΡΟΗΓ. ΥΠΟΛΟΙΠΟ -0,02"),"INVOICE");
  assert.equal(detectInvoiceDocumentType("ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ επιστροφή κενών συσκευασιών"),"INVOICE");
  assert.equal(detectInvoiceDocumentType("ΔΕΛΤΙΟ ΕΠΙΣΤΡΟΦΗΣ"),"CREDIT_NOTE");
});
