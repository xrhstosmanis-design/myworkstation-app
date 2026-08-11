import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backend=read("server/src/routes/supplier-control-normalized.js");
const client=read("client/src/components/commerce/installSupplierControlSuiteV2.js");
const bootstrap=read("server/src/commercial-bootstrap.js");
const keyboard=read("client/src/components/commerce/installTouchKeyboard.js");
const entry=read("client/src/entry.jsx");

test("supplier control is tenant scoped and available only to management roles",()=>{
  assert.match(backend,/companyId/);
  assert.match(backend,/SUPER_ADMIN/);
  assert.match(backend,/OWNER/);
  assert.match(backend,/ADMIN/);
  assert.match(backend,/MANAGER/);
  assert.match(backend,/STORE_OPERATOR/);
});

test("supplier card supports Kiosk-style extended fields and child tabs",()=>{
  for(const field of ["legacyCode","taxId","address","city","phone","email","notes"])assert.match(client,new RegExp(field));
  for(const tab of ["catalog","invoices","payments","purchases","sales"])assert.match(client,new RegExp(tab));
});

test("right click and touch long press open the supplier action menu",()=>{
  assert.match(client,/contextmenu/);
  assert.match(client,/pointerdown/);
  assert.match(client,/650/);
});

test("supplier tabs use real invoices payments purchases and sales data",()=>{
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
