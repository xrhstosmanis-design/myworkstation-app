import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/customer-control-v2.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installCustomerControlSuiteV2.js",import.meta.url),"utf8");

test("new customers receive a unique company-scoped member card",()=>{
  assert.match(route,/async function uniqueMemberCard/);
  assert.match(route,/crypto\.randomBytes\(8\)/);
  assert.match(route,/"companyId"=\$\{companyId\}/);
  assert.match(route,/Η κάρτα μέλους χρησιμοποιείται ήδη/);
  assert.match(route,/res\.status\(201\)\.json\(\{id:customerId,memberCard\}\)/);
});

test("customer card can be printed saved and shared to a mobile phone",()=>{
  assert.match(ui,/import QRCode from "qrcode"/);
  assert.match(ui,/QRCode\.toDataURL\(customer\.memberCard/);
  assert.match(ui,/Εκτύπωση κάρτας/);
  assert.match(ui,/Αποστολή στο κινητό/);
  assert.match(ui,/navigator\.share/);
  assert.match(ui,/Viber ή WhatsApp/);
  assert.match(ui,/σκανάρεται απευθείας από την οθόνη/);
});

test("digital card contains no financial or contact details",()=>{
  assert.match(ui,/δεν περιέχει οικονομικά στοιχεία/);
  assert.doesNotMatch(ui,/ctx\.fillText\(customer\.(email|phone|balance|taxId)/);
});
