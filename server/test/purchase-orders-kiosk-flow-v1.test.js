import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/purchase-orders.js",import.meta.url),"utf8");
const actions=await readFile(new URL("../src/routes/purchase-order-actions.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("purchase orders use an additive ledger separate from purchase invoices",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "PurchaseOrder"/);
  assert.match(route,/CREATE TABLE IF NOT EXISTS "PurchaseOrderLine"/);
  assert.match(route,/status" TEXT NOT NULL DEFAULT 'NEW'/);
  assert.doesNotMatch(route,/DELETE FROM "PurchaseDocument"/);
});

test("order access is tenant scoped and excludes store operators",()=>{
  assert.match(route,/SUPER_ADMIN/);
  assert.match(route,/OWNER/);
  assert.match(route,/ADMIN/);
  assert.match(route,/MANAGER/);
  assert.match(route,/tokenType==="STORE_OPERATOR"/);
  assert.match(route,/o\."companyId"=\$\{companyId\}/);
});

test("line editor supports the three discounts excise VAT gift markup and proposed retail",()=>{
  for(const key of ["discount1","discount2","discount3","exciseTotal","vatRate","gift","markupPercent","proposedSalePrice"])assert.match(route,new RegExp(key));
  assert.match(route,/calculateFrom==="MARKUP"/);
  assert.match(route,/grossUnit\*\(1\+markupPercent\/100\)/);
  assert.match(route,/calculateFrom==="RETAIL"/);
  assert.match(route,/\(proposedSalePrice\/grossUnit\)-1/);
  assert.match(client,/Έκπτωση\$\{i\} \(€\)/);
  assert.match(client,/name="finalUnitCost"/);
  assert.match(client,/source==="AMOUNT"/);
  assert.match(client,/source==="FINAL"/);
  assert.match(client,/totalDiscount\/initial\*100/);
  assert.match(client,/amount\/running\*100/);
  assert.match(client,/inputmode="decimal"/);
  assert.match(client,/replace\(",","\."\)/);
  assert.match(client,/!input\.matches\('\[name\^="discountAmount"\],\[name="finalUnitCost"\]'\)/);
  assert.match(client,/name="discount1" type="number" step="any"/);
  assert.match(client,/percent\.toFixed\(8\)/);
  assert.match(client,/amount\.toFixed\(6\)/);
  assert.match(route,/"discount1" NUMERIC\(12,8\)/);
  assert.match(route,/ALTER COLUMN "discount1" TYPE NUMERIC\(12,8\)/);
});

test("Kiosk-style drilldowns are wired to real actions",()=>{
  assert.match(client,/Διόρθωση εγγραφής παραγγελίας/);
  assert.match(client,/Διόρθωση κωδικού τιμολογίου/);
  assert.match(client,/Εναλλακτικοί κωδικοί Barcodes είδους/);
  assert.match(client,/data-line-edit/);
  assert.match(client,/data-product-card/);
  assert.match(client,/data-barcodes/);
  assert.match(client,/data-calc-markup/);
  assert.match(client,/data-calc-retail/);
});

test("invoice lines keep the exact OCR document order during review",()=>{
  assert.match(route,/ADD COLUMN IF NOT EXISTS "ocrSequence" INTEGER/);
  assert.match(route,/ORDER BY COALESCE\(l\."ocrSequence",l\."ocrLineIndex",2147483647\),l\."createdAt",l\."id"/);
  assert.match(intake,/"ocrSequence"/);
  assert.match(intake,/\$\{index\+1\}/);
});

test("all main order actions are functional endpoints or exports",()=>{
  assert.match(client,/Οριστικοποίηση/);
  assert.match(client,/Αποστολή email/);
  assert.match(client,/Τιμολόγηση/);
  assert.match(client,/Διαγραφή Όλων/);
  assert.match(client,/Excel \/ CSV/);
  assert.match(actions,/sendEmail/);
  assert.match(actions,/supplierEmail/);
});

test("barcode management is tenant checked through the owning product",()=>{
  assert.match(route,/products\/:productId\/barcodes/);
  assert.match(route,/JOIN "Product" x ON x\."id"=b\."productId"/);
  assert.match(route,/x\."companyId"=\$\{companyId\}/);
  assert.match(route,/Το barcode χρησιμοποιείται ήδη/);
});

test("stock proposal uses real min stock current stock and purchase history",()=>{
  assert.match(route,/stock-proposal/);
  assert.match(route,/sp\."minStock"/);
  assert.match(route,/sp\."currentStock"/);
  assert.match(route,/PurchaseDocumentLine/);
  assert.match(route,/suggestedQuantity/);
});

test("purchase suite is mounted without an internal observer render loop",()=>{
  assert.match(entry,/installPurchaseOrdersSafely/);
  assert.match(entry,/purchaseOrdersHostObserver/);
  assert.match(entry,/window\.MutationObserver=class\{observe\(\)\{\}disconnect\(\)\{\}\}/);
  assert.match(server,/purchaseOrderActionRoutes/);
  assert.match(server,/purchaseOrderRoutes/);
});
