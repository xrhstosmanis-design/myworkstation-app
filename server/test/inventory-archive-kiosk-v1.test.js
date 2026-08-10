import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const archivePath=new URL("../src/routes/inventory-archive.js",import.meta.url);
const importPath=new URL("../src/routes/inventory-archive-import.js",import.meta.url);
const panelPath=new URL("../../client/src/components/commerce/InventoryArchivePanel.jsx",import.meta.url);
const cssPath=new URL("../../client/src/components/commerce/inventory-archive.css",import.meta.url);
const launcherPath=new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url);
const indexPath=new URL("../src/index.js",import.meta.url);
const archive=fs.readFileSync(archivePath,"utf8");
const importer=fs.readFileSync(importPath,"utf8");
const panel=fs.readFileSync(panelPath,"utf8");
const css=fs.readFileSync(cssPath,"utf8");
const launcher=fs.readFileSync(launcherPath,"utf8");
const index=fs.readFileSync(indexPath,"utf8");

test("inventory archive server routes parse",()=>{
  for(const path of [archivePath,importPath]){
    const r=spawnSync(process.execPath,["--check",path.pathname],{encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});

test("archive is tenant/store scoped and server paginated",()=>{
  assert.match(archive,/companyId=req\.user\.companyId/);
  assert.match(archive,/storeId=String\(req\.query\.storeId/);
  assert.match(archive,/Math\.min\(200/);
  assert.match(archive,/LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
  assert.doesNotMatch(archive,/LIMIT 10000/);
});

test("archive uses real inventory purchase and sales sources",()=>{
  for(const source of ["StoreProduct","ProductBarcode","PurchaseDocumentLine","PurchaseDocument","Supplier","SaleLine","Sale","MasterProduct"])
    assert.ok(archive.includes(`\"${source}\"`),source);
  assert.match(archive,/lastPurchasePrice/);
  assert.match(archive,/averagePurchasePrice/);
  assert.match(archive,/sales15Qty/);
  assert.match(archive,/retailStockValue/);
  assert.match(archive,/costStockValue/);
});

test("purchase cost priority keeps real stored fallback",()=>{
  assert.match(archive,/latest\|\|average\|\|stored/);
  assert.match(archive,/p\."costPrice"/);
  assert.match(archive,/CASE WHEN l\."unit"='PACKAGE'/);
});

test("inventory UI follows photographed archive workflow and bottom actions",()=>{
  for(const text of ["Αρχείο ειδών (Αποθήκη)","Κριτήρια αναζήτησης","Αποτελέσματα αναζήτησης","Margin","MARKUP","Λιανική","Αποθήκη","Τελ. αγορά","Βασικός προμηθευτής","Πωλήσεις 15ημ.","Κλείσιμο","Νέο είδος","Ομαδική διόρθωση","Παραγγελία","Εισαγωγή από Excel","Εκτύπωση","e‑Delivery"])
    assert.ok(panel.includes(text),text);
  assert.match(panel,/openEdit\(row\)/);
  assert.match(panel,/stock-adjustment/);
  assert.match(panel,/ProductDeliveryFields/);
});

test("Excel import is preview first and stock overwrite is explicit",()=>{
  assert.match(importer,/router\.post\("\/import-preview"/);
  assert.match(importer,/router\.post\("\/import"/);
  assert.match(importer,/applyStock:z\.boolean\(\)\.default\(false\)/);
  assert.match(panel,/Προεπισκόπηση χωρίς καταχώρηση/);
  assert.match(panel,/Τελική εισαγωγή/);
  assert.match(panel,/preview\.summary\.invalid/);
});

test("new archive reuses existing navigation without an observer",()=>{
  assert.match(launcher,/mode===?"inventory"|mode==="inventory"/);
  assert.match(launcher,/Αποθήκη/);
  assert.match(launcher,/data-purchase-orders-launch/);
  assert.doesNotMatch(panel,/MutationObserver/);
});

test("archive uses canonical MyWorkStation structural colors",()=>{
  assert.match(css,/#123b5d/);
  assert.match(css,/#0f766e/);
  assert.doesNotMatch(css,/#ffc76d|#ef9b20|#efb04f/i);
});

test("server mounts import before archive read route",()=>{
  const a=index.indexOf('app.use("/api/inventory-archive",auth,requireCompanyModule("INVENTORY"),inventoryArchiveImportRoutes)');
  const b=index.indexOf('app.use("/api/inventory-archive",auth,requireCompanyModule("INVENTORY"),inventoryArchiveRoutes)');
  assert.ok(a>0&&b>a);
});
