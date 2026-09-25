import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lab=fs.readFileSync(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");

test("Invoice Learning exposes a safe user correction flow for a draft line",()=>{
  assert.match(lab,/Διόρθωση ποσότητας \/ συσκευασίας/);
  assert.match(lab,/Διόρθωση γραμμής τιμολογίου/);
  assert.match(lab,/Ποσότητα τιμολογίου/);
  assert.match(lab,/Αποθήκευση μονάδας και μετατροπής ως κανόνα προμηθευτή/);
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

test("manual line correction recalculates economics from corrected discounts",()=>{
  assert.match(lab,/const correctedNetUnit=pct\(line\.unitPrice,line\.discount1,line\.discount2,line\.discount3\)/);
  assert.match(lab,/line\.netValue=correctedNetUnit===null\?0:line\.quantity\*correctedNetUnit/);
  assert.doesNotMatch(lab,/line\.netValue=lineAmount\(line\);line\.netAmount=line\.netValue;line\.netUnitCost=net\(line\)/);
});
