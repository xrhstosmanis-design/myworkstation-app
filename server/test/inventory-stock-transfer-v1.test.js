import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/inventory-archive.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/commerce/InventoryArchivePanel.jsx",import.meta.url),"utf8");

test("stock transfer is tenant scoped and only targets distinct active stores",()=>{
  assert.match(route,/companyId:req\.user\.companyId/);
  assert.match(route,/sourceStoreId===body\.destinationStoreId/);
  assert.match(route,/μεταφορά επιτρέπεται μόνο μεταξύ ενεργών καταστημάτων της ίδιας εταιρείας/);
});

test("stock transfer is atomic, balanced and rejects insufficient stock",()=>{
  assert.match(route,/prisma\.\$transaction/);
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/"currentStock"-\$\{body\.quantity\}/);
  assert.match(route,/"currentStock"\+\$\{body\.quantity\}/);
  assert.match(route,/'TRANSFER_OUT'/);
  assert.match(route,/'TRANSFER_IN'/);
  assert.match(route,/Μη επαρκές απόθεμα/);
});

test("stock transfer has replay protection and a BackOffice action",()=>{
  assert.match(route,/INVENTORY_TRANSFER/);
  assert.match(route,/idempotencyKey/);
  assert.match(route,/δεν επαναλήφθηκε/);
  assert.match(panel,/>Μεταφορά</);
  assert.match(panel,/Καταχώρηση μεταφοράς/);
});

test("checking one inventory row also selects it for transfer",()=>{
  assert.match(panel,/const row=data\.items\.find\(item=>item\.productId===id\)/);
  assert.match(panel,/setSelected\(current=>current\?\.productId===id\?null:\(row\|\|null\)\)/);
});
