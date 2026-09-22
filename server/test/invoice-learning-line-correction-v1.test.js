import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lab=fs.readFileSync(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");

test("Invoice Learning exposes a safe user correction flow for a draft line",()=>{
  assert.match(lab,/Διόρθωση ποσότητας \/ συσκευασίας/);
  assert.match(lab,/Διόρθωση γραμμής τιμολογίου/);
  assert.match(lab,/Ποσότητα τιμολογίου/);
  assert.match(lab,/Αποθήκευση μονάδας, μετατροπής και έκπτωσης ως κανόνα προμηθευτή/);
  assert.match(lab,/Καμία κίνηση stock ή λογιστικής δεν δημιουργείται/);
});

test("converted lines keep their stock quantity instead of being recovered again",()=>{
  assert.match(lab,/applyInvoiceLearningResultWithConversion/);
  assert.match(lab,/if\(!source\?\.packageConversionApplied\)return/);
  assert.match(lab,/draft\.quantity=source\.quantity/);
});

test("invoice and stock units offer popup suggestions while allowing custom text",()=>{
  assert.match(lab,/invoice-learning-unit-options/);
  assert.match(lab,/\['ΤΜΧ','ΚΟΥ','ΚΟΥΤΑ','ΚΙΒ','ΚΒ','ΣΥΣΚ'/);
  assert.match(lab,/element\.setAttribute\('list',unitList\.id\)/);
  assert.match(lab,/fields\.invoiceUnit=unitInput\('Μονάδα τιμολογίου'/);
  assert.match(lab,/fields\.stockUnit=unitInput\('Μονάδα stock'/);
});
