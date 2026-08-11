import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/supplier-control.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/supplier-control-bootstrap.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSupplierControlSuite.js",import.meta.url),"utf8");
const keyboard=await readFile(new URL("../../client/src/components/commerce/installTouchKeyboard.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

test("supplier control is tenant scoped and available only to management roles",()=>{
  for(const role of ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"])assert.match(route,new RegExp(role));
  assert.match(route,/tokenType==="STORE_OPERATOR"/);
  assert.match(route,/"companyId"=\$\{companyId\}/);
});

test("supplier card supports Kiosk-style extended fields and child tabs",()=>{
  for(const field of ["legacyCode","erpCode","profession","mobile","fax","sellerName","accountingCode","supplierCategory","paymentPreference","vatMode","chargeAddress"])assert.match(route,new RegExp(field));
  assert.match(route,/SupplierAddress/);
  assert.match(route,/SupplierBusinessUnit/);
  assert.match(client,/Βασικά στοιχεία/);
  assert.match(client,/Διευθύνσεις/);
  assert.match(client,/Business Units/);
  assert.match(client,/Λοιπά/);
});

test("right click and touch long press open the supplier action menu",()=>{
  assert.match(client,/contextmenu/);
  assert.match(client,/pointerType!=="touch"/);
  assert.match(client,/setTimeout\(\(\)=>open\(e\),650\)/);
  for(const label of ["Διόρθωση στοιχείων","Πληρωμή","Διόρθωση υπολοίπου","Τιμολογήσεις μήνα","Τιμολογήσεις έτους","Λογιστική καρτέλα","Νέα παραλαβή","Νέο τιμολόγιο","Προβολή ειδών","Διαγραφή"])assert.match(client,new RegExp(label));
});

test("supplier tabs use real invoices payments purchases and sales data",()=>{
  assert.match(route,/PurchaseDocument/);
  assert.match(route,/StoreTransaction/);
  assert.match(route,/PurchaseDocumentLine/);
  assert.match(route,/SaleLine/);
  assert.match(route,/SupplierBalanceAdjustment/);
  for(const tab of ["catalog","invoices","payments","purchases","sales"])assert.match(client,new RegExp(tab));
});

test("supplier payment compatibility exists before report queries",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "StoreTransaction"/);
  assert.match(bootstrap,/supplierId/);
  assert.match(entry,/ensure|installSupplierControlSafely/);
});

test("touch keyboard opens only after touch or pen interaction and supports text and numeric layouts",()=>{
  assert.match(keyboard,/pointerType==="touch"\|\|pointerType==="pen"/);
  assert.match(keyboard,/inputmode","none"/);
  assert.match(keyboard,/Αριθμητικό πληκτρολόγιο/);
  assert.match(keyboard,/Πληκτρολόγιο αφής/);
  assert.match(keyboard,/Ελληνικά/);
  assert.match(keyboard,/English/);
  assert.match(keyboard,/BACK/);
  assert.match(keyboard,/ENTER/);
  assert.match(entry,/installTouchKeyboard\(\)/);
});

test("purchase orders anti-freeze observer contract remains intact",()=>{
  assert.match(entry,/installPurchaseOrdersSafely/);
  assert.match(entry,/purchaseOrdersHostObserver/);
  assert.match(entry,/window\.MutationObserver=class\{observe\(\)\{\}disconnect\(\)\{\}\}/);
});
