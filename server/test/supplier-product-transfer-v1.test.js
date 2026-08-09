import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const route=await readFile(new URL("../src/routes/supplier-product-transfer.js",import.meta.url),"utf8");
const normalized=await readFile(new URL("../src/routes/supplier-control-normalized.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSupplierProductTransfer.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

test("supplier transfer modules parse as real JavaScript",()=>{
  for(const file of ["../src/routes/supplier-product-transfer.js","../src/routes/supplier-control-normalized.js"]){
    const path=fileURLToPath(new URL(file,import.meta.url));
    const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
    assert.equal(result.status,0,`${file}\n${result.stderr||result.stdout}`);
  }
});

test("supplier transfer has all three modes and management-only access",()=>{
  assert.match(route,/ITEMS_CODES/);
  assert.match(route,/"ITEMS"/);
  assert.match(route,/"CODES"/);
  for(const role of ["SUPER_ADMIN","OWNER","ADMIN","MANAGER"])assert.match(route,new RegExp(role));
  assert.match(route,/STORE_OPERATOR/);
});

test("supplier transfer never rewrites historical purchase documents",()=>{
  assert.doesNotMatch(route,/UPDATE\s+"PurchaseDocument"/i);
  assert.doesNotMatch(route,/DELETE\s+FROM\s+"PurchaseDocument"/i);
  assert.doesNotMatch(route,/UPDATE\s+"PurchaseDocumentLine"/i);
  assert.doesNotMatch(route,/DELETE\s+FROM\s+"PurchaseDocumentLine"/i);
  assert.match(route,/SupplierProductLink/);
  assert.match(route,/SupplierProductTransfer/);
  assert.match(route,/productIdsJson/);
});

test("candidate list is derived from real purchase history orders and current links",()=>{
  assert.match(route,/PurchaseDocumentLine/);
  assert.match(route,/PurchaseOrderLine/);
  assert.match(route,/SupplierProductLink/);
  assert.match(route,/ProductBarcode/);
});

test("transfer UI intercepts the existing items context action and supports touch source selection",()=>{
  assert.match(client,/\.sc-context \[data-action='items'\]/);
  assert.match(client,/stopImmediatePropagation/);
  assert.match(client,/pointerType==="touch"/);
  assert.match(client,/Μεταφορά ειδών ή\/και κωδικών/);
  assert.match(client,/Είδη \+ κωδικοί/);
  assert.match(client,/Μόνο είδη/);
  assert.match(client,/Μόνο κωδικοί/);
  assert.match(client,/Επιλογή όλων/);
});

test("transfer routes are mounted before supplier control generic routes",()=>{
  assert.match(normalized,/supplierProductTransferRoutes/);
  assert.ok(normalized.indexOf("router.use(supplierProductTransferRoutes)")<normalized.indexOf("router.use(supplierControlRoutes)"));
  assert.match(entry,/installSupplierProductTransfer\(\)/);
  assert.match(entry,/purchaseOrdersHostObserver/);
});
