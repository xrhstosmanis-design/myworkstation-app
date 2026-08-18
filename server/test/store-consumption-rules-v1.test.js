import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [route,menu,audit,auditUi]=await Promise.all([
  readFile(new URL("../src/routes/store-pos-consumption.js",import.meta.url),"utf8"),
  readFile(new URL("../../client/src/components/store/StoreConsumptionMenu.jsx",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8"),
  readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8")
]);

test("consumption flow keeps the three business rules separate",()=>{
  assert.match(route,/z\.enum\(\["WASTE", "SELF_CONSUMPTION", "PRODUCT_DESTRUCTION"\]\)/);
  assert.match(route,/const countsTurnover = body\.kind === "WASTE"/);
  assert.match(route,/const saleValue = countsTurnover \? referenceValue : 0/);
  assert.match(route,/if \(countsTurnover\)[\s\S]*INSERT INTO "Payment"[\s\S]*'SALE_CASH'/);
  assert.match(route,/UPDATE "StoreProduct" SET "currentStock"=COALESCE\("currentStock",0\)-\$\{item\.quantity\}/);
});

test("product destruction requires a reason and never counts as turnover",()=>{
  assert.match(route,/value\.kind === "PRODUCT_DESTRUCTION"/);
  assert.match(route,/Η καταστροφή προϊόντων απαιτεί αιτιολογία/);
  assert.match(route,/countsTurnover, receipt: false/);
  assert.match(menu,/ΚΑΤΑΣΤΡΟΦΗ ΠΡΟΪΟΝΤΩΝ/);
  assert.match(menu,/Γράψε αιτιολογία για την καταστροφή προϊόντων/);
});

test("Store POS clearly explains all three actions",()=>{
  assert.match(menu,/ΦΥΡΑ[\s\S]*μετρά στον τζίρο μετρητών/);
  assert.match(menu,/ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ[\s\S]*δεν μετρά στον τζίρο/);
  assert.match(menu,/ΚΑΤΑΣΤΡΟΦΗ ΠΡΟΪΟΝΤΩΝ[\s\S]*δεν μετρά στον τζίρο/);
});

test("central audit shows non-turnover consumption and destruction without duplicating waste sale",()=>{
  assert.match(audit,/SELF_CONSUMPTION','PRODUCT_DESTRUCTION/);
  assert.doesNotMatch(audit,/actionType" IN \([^\n]*'WASTE'/);
  assert.match(audit,/POS_SELF_CONSUMPTION/);
  assert.match(audit,/POS_PRODUCT_DESTRUCTION/);
  assert.match(auditUi,/POS_SELF_CONSUMPTION:"Προσωπική κατανάλωση"/);
  assert.match(auditUi,/POS_PRODUCT_DESTRUCTION:"Καταστροφή προϊόντων"/);
});
