import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const serverPath=new URL("../src/routes/operator-management-v2.js",import.meta.url);
const installerPath=new URL("../../client/src/components/commerce/installOperatorManagementSuite.js",import.meta.url);
const panelPath=new URL("../../client/src/components/commerce/OperatorManagementPanel.jsx",import.meta.url);
const cssPath=new URL("../../client/src/components/commerce/operator-management.css",import.meta.url);
const homeCssPath=new URL("../../client/src/components/commerce/commerce-home-modern.css",import.meta.url);
const entryPath=new URL("../../client/src/entry.jsx",import.meta.url);
const indexPath=new URL("../src/index.js",import.meta.url);
const server=fs.readFileSync(serverPath,"utf8");
const installer=fs.readFileSync(installerPath,"utf8");
const panel=fs.readFileSync(panelPath,"utf8");
const css=fs.readFileSync(cssPath,"utf8");
const homeCss=fs.readFileSync(homeCssPath,"utf8");
const entry=fs.readFileSync(entryPath,"utf8");
const index=fs.readFileSync(indexPath,"utf8");

test("operator management backend and installer parse",()=>{
  for(const path of [serverPath,installerPath]){
    const r=spawnSync(process.execPath,["--check",path.pathname],{encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});

test("operator management persists real scoped data and audit",()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS "StoreOperatorProfile"/);
  assert.match(server,/"permissions" JSONB/);
  assert.match(server,/"backofficeMenu" JSONB/);
  assert.match(server,/"backofficeTabs" JSONB/);
  assert.match(server,/StoreOperatorAudit/);
  assert.match(server,/SUPER_ADMIN/);
  assert.match(server,/companyId:req\.user\.companyId/);
});

test("PIN is hashed and never stored as plaintext",()=>{
  assert.match(server,/bcrypt\.hash\(body\.pin,12\)/);
  assert.match(server,/"pinHash"/);
  assert.doesNotMatch(server,/"pin"\s+TEXT/i);
  assert.match(server,/crypto\.randomInt\(100000,1000000\)/);
});

test("trash action is safe soft deactivation",()=>{
  assert.match(server,/router\.delete\("\/stores\/:storeId\/operators\/:employeeId"/);
  assert.match(server,/SET "active"=FALSE/);
  assert.doesNotMatch(server,/prisma\.employee\.delete/);
  assert.doesNotMatch(server,/DELETE FROM "StoreOperatorCredential"/);
});

test("operator UI matches the screenshot workflow and bottom actions",()=>{
  for(const text of ["Χειριστές","Στοιχεία χειριστή","Δικαιώματα πρόσβασης","Λοιπά","Παραστατικά","Κλείσιμο","Νέα εγγραφή","Ανανέωση","Εκτύπωση PIN","Μόνο οι ενεργοί χειριστές","Αλλαγή κωδικού πρόσβασης","Καταχώρηση"])
    assert.ok(panel.includes(text),text);
  assert.match(panel,/\/pin\/random/);
  assert.match(panel,/\/api\/operator-management\/stores\//);
  assert.match(panel,/Pencil/);
  assert.match(panel,/Trash2/);
  assert.match(panel,/LockKeyhole/);
});

test("operator suite uses the existing guarded commerce observer only",()=>{
  assert.match(entry,/installOperatorManagementSafely/);
  assert.match(entry,/purchaseOrdersHostObserver=new MutationObserver/);
  assert.match(entry,/installOperatorManagementSafely\(\).*purchaseOrdersHostObserver|purchaseOrdersHostObserver[\s\S]*installOperatorManagementSafely/);
  assert.equal((entry.match(/new MutationObserver/g)||[]).length,1);
  assert.doesNotMatch(installer,/new MutationObserver/);
});

test("server mounts operator management by target store module",()=>{
  assert.match(index,/\/api\/operator-management",auth,requireStoreModule\("STORE_MODE"\)/);
});

test("modern commerce home and operator screens use MyWorkStation navy teal baseline",()=>{
  assert.match(homeCss,/#123b5d/);
  assert.match(homeCss,/#0f766e/);
  assert.match(homeCss,/commerce-module-strip/);
  assert.match(homeCss,/commerce-status-grid/);
  assert.match(homeCss,/operator-management-active/);
  assert.match(css,/#123b5d/);
  assert.match(css,/#0f766e/);
});
