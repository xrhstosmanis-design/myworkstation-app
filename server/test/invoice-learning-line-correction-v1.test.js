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
