import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const routePath=new URL("../src/routes/management-categories.js",import.meta.url);
const installerPath=new URL("../../client/src/components/commerce/installManagementCategoriesSuite.js",import.meta.url);
const operatorInstallerPath=new URL("../../client/src/components/commerce/installOperatorManagementSuite.js",import.meta.url);
const panelPath=new URL("../../client/src/components/commerce/ManagementCategoriesPanel.jsx",import.meta.url);
const cssPath=new URL("../../client/src/components/commerce/management-categories.css",import.meta.url);
const indexPath=new URL("../src/index.js",import.meta.url);
const entryPath=new URL("../../client/src/entry.jsx",import.meta.url);
const route=fs.readFileSync(routePath,"utf8");
const installer=fs.readFileSync(installerPath,"utf8");
const operatorInstaller=fs.readFileSync(operatorInstallerPath,"utf8");
const panel=fs.readFileSync(panelPath,"utf8");
const css=fs.readFileSync(cssPath,"utf8");
const index=fs.readFileSync(indexPath,"utf8");
const entry=fs.readFileSync(entryPath,"utf8");

test("management categories backend and installer parse",()=>{
  for(const path of [routePath,installerPath,operatorInstallerPath]){
    const r=spawnSync(process.execPath,["--check",path.pathname],{encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});

test("management schema is additive and company scoped",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "ProductSubcategory"/);
  assert.match(route,/ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId"/);
  assert.match(route,/"companyId" TEXT NOT NULL/);
  assert.match(route,/ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ/);
  assert.match(route,/ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ/);
});

test("subcategory transfer moves the real products too",()=>{
  assert.match(route,/subcategories\/:id\/transfer/);
  assert.match(route,/UPDATE "ProductSubcategory" SET "categoryId"/);
  assert.match(route,/UPDATE "Product" SET "categoryId"=.*"subcategoryId"/s);
});

test("product popup uses real sources and server pagination",()=>{
  assert.match(route,/router\.get\("\/products"/);
  assert.match(route,/PurchaseDocumentLine/);
  assert.match(route,/Supplier/);
  assert.match(route,/StoreProduct/);
  assert.match(route,/pageSize=Math\.min\(200/);
  assert.match(route,/LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
});

test("screen includes all screenshot interactions",()=>{
  for(const text of ["Κατηγορίες ειδών","Διόρθωση Κατηγορίας","Διόρθωση υποκατηγορίας ειδών","Μεταφορά υποκατηγορίας","Προβολή ειδών","Κλείσιμο","Ανανέωση","Νέα εγγραφή","Excel / CSV","Ομαδική διόρθωση","Τμήματα ΦΠΑ","Κατηγορίες εξόδων","Εταιρείες","Modifiers","Κατηγορίες πελατών","Επαγγέλματα","Τράπεζες","Τρόποι αποστολής","PoS τερματικά"])
    assert.ok(panel.includes(text),text);
  assert.match(panel,/ArrowLeftRight/);
  assert.match(panel,/Barcode/);
  assert.match(panel,/Edit3/);
  assert.match(panel,/Trash2/);
});

test("management launcher reuses the existing guarded commerce observer",()=>{
  assert.doesNotMatch(installer,/new MutationObserver/);
  assert.match(operatorInstaller,/installManagementCategoriesSuite\(api\)/);
  assert.equal((entry.match(/new MutationObserver/g)||[]).length,1);
});

test("management API is mounted behind inventory access",()=>{
  assert.match(index,/managementCategoriesRoutes/);
  assert.match(index,/\/api\/management",auth,requireCompanyModule\("INVENTORY"\),managementCategoriesRoutes/);
});

test("management follows MyWorkStation navy teal visual baseline",()=>{
  assert.match(css,/#123b5d/);
  assert.match(css,/#0f766e/);
  assert.match(css,/management-catalog-active/);
  assert.doesNotMatch(css,/#ff9800|#f59e0b/i);
});
