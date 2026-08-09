import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const preview=await readFile(new URL("../src/routes/owner-payments-import-preview.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installKioskPaymentsImport.js",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("Kiosk preview is read only and tenant scoped",()=>{
  assert.match(preview,/previewOnly:true/);
  assert.match(preview,/δεν αποθηκεύτηκε καμία κίνηση/);
  assert.match(preview,/companyId:req\.user\.companyId/);
  assert.match(preview,/id:body\.storeId/);
  assert.doesNotMatch(preview,/INSERT INTO/);
  assert.doesNotMatch(preview,/UPDATE /);
  assert.doesNotMatch(preview,/DELETE FROM/);
});

test("preview summarizes before final import",()=>{
  assert.match(preview,/supplierTotal/);
  assert.match(preview,/otherTotal/);
  assert.match(preview,/dateFrom/);
  assert.match(preview,/dateTo/);
  assert.match(preview,/sample:parsed\.rows\.slice\(0,12\)/);
});

test("client requires explicit confirmation after preview",()=>{
  assert.match(client,/owner-payments\/preview-kiosk/);
  assert.match(client,/Προεπισκόπηση Kiosk/);
  assert.match(client,/καμία εγγραφή δεν έχει αποθηκευτεί/);
  assert.match(client,/Οριστική εισαγωγή/);
  assert.match(client,/data-kiosk-confirm/);
  assert.match(client,/data-kiosk-cancel/);
});

test("preview route is mounted before importer",()=>{
  assert.match(server,/ownerPaymentsImportPreviewRoutes/);
  assert.match(server,/owner-payments-import-preview\.js/);
});
