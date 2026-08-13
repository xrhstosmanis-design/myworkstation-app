import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");
const operators=fs.readFileSync(new URL("../../client/src/components/commerce/OperatorManagementPanel.jsx",import.meta.url),"utf8");

test("POS reversal uses the central BackOffice returnItems permission",()=>{
  assert.match(route,/returnItems:Boolean\(p\.returnItems\)/);
  assert.match(route,/\/sales\\\/\[\^\/\]\+\\\/reverse\$\/\.test\(req\.path\)/);
  assert.match(route,/!access\.returnItems/);
  assert.match(route,/permission:"returnItems"/);
  assert.match(route,/action:"SALE_REVERSE"/);
  assert.match(route,/POS_PERMISSION_DENIED/);
  assert.match(route,/Επιστροφή ειδών/);
});

test("operator management exposes the same returnItems permission key",()=>{
  assert.match(operators,/\["returnItems","Επιστροφή ειδών \(PoS\)"\]/);
});
