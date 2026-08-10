import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const server="server/src/routes/kiosk-reports.js";
const client="client/src/components/commerce/installKioskReportsSuite.js";
const entry="client/src/entry.jsx";
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const syntax=file=>{const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)};

test("Kiosk reports server and client parse",()=>{syntax(server);syntax(client)});

test("reports are management-role and tenant scoped",()=>{
  const s=read(server);
  assert.match(s,/SUPER_ADMIN/);assert.match(s,/OWNER/);assert.match(s,/ADMIN/);assert.match(s,/MANAGER/);
  assert.match(s,/req\.user\.companyId/);
  assert.match(s,/s\.\"companyId\"=\$\{companyId\}/);
});

test("destructions always expose purchase price and purchase total from real cost sources",()=>{
  const s=read(server),c=read(client);
  assert.match(s,/movementType\"='WASTE'/);
  assert.match(s,/COALESCE\(sm\.\"unitCost\",lp\.\"unitCost\",p\.\"costPrice\",0\) AS \"purchasePrice\"/);
  assert.match(s,/ABS\(sm\.\"quantity\"\)\*COALESCE\(sm\.\"unitCost\",lp\.\"unitCost\",p\.\"costPrice\",0\) AS \"purchaseTotal\"/);
  assert.ok(c.includes("Τιμή αγοράς"));assert.ok(c.includes("Σύνολο αγοράς"));
  assert.match(c,/money\(r\.purchasePrice\)/);assert.match(c,/money\(r\.purchaseTotal\)/);assert.match(c,/money\(d\.totalPurchase\)/);
});

test("real report tabs use real ledgers and unavailable fiscal data is not invented",()=>{
  const s=read(server),c=read(client);
  for(const source of ["StockMovement","ProductPriceHistory","StocktakeLine","SaleLine","PurchaseDocument","AuthAudit"])assert.ok(s.includes(source),source);
  assert.ok(c.includes("Ζ Ταμειακής"));assert.ok(c.includes("Δεν υπάρχει ακόμη πραγματική πηγή"));
  assert.match(s,/fiscalZ:\{available:false/);
});

test("Kiosk report UI includes the photographed report families and bottom actions",()=>{
  const c=read(client);
  for(const label of ["Διαγραφές λίστας πώλησης","Αλλαγές τιμών","Απενεργοποιήσεις ειδών","Ζ Ταμειακής","Χρονολόγιο κινήσεων ειδών","Αναφορά τμημάτων","Παραστατικά","Απογραφές","Καταστροφές","Στιγμιότυπα αποθήκης","Στατιστικά αποθήκης","Στατιστικά πωλήσεων","LogIn"])assert.ok(c.includes(label),label);
  for(const label of ["Κλείσιμο","Ανανέωση","Excel / CSV","PDF / Εκτύπωση"])assert.ok(c.includes(label),label);
});

test("reports use global touch keyboard and existing guarded host observer",()=>{
  const c=read(client),e=read(entry);
  assert.doesNotMatch(c,/new MutationObserver/);
  assert.match(e,/installKioskReportsSuite/);assert.match(e,/installReportsSafely/);assert.match(e,/purchaseOrdersHostObserver/);assert.match(e,/installTouchKeyboard\(\)/);
});
