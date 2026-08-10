import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const nav="client/src/components/commerce/installPriceCatalogVisibleNav.js";
const controller="client/src/components/commerce/installPriceCatalogControllerV2.js";
const entry="client/src/entry.jsx";
const css="client/src/components/commerce/price-catalog-visible-nav.css";
const syntax=file=>{const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)};

test("structural price catalog navigation and controller parse",()=>{syntax(nav);syntax(controller)});

test("all four price catalog destinations are always represented",()=>{
  const n=read(nav);
  for(const label of ["Έλεγχος τιμών πώλησης","Προσφορές φυλλαδίου","Προσφορές και δώρα","Τιμές χονδρικής"])assert.ok(n.includes(label),label);
  for(const id of ["prices","leaflet","gifts","wholesale"])assert.ok(n.includes(`\"${id}\"`),id);
});

test("visible navigation delegates to the functional V2 controller instead of hidden internal clicks",()=>{
  const n=read(nav),c=read(controller);
  assert.match(n,/installPriceCatalogControllerV2/);
  assert.match(n,/installPriceCatalogControllerV2\(\)/);
  assert.doesNotMatch(n,/internal\.click\(\)/);
  assert.match(c,/data-price-catalog-visible-tab/);
  assert.match(c,/openLeaflet/);
  assert.match(c,/openGifts/);
  assert.match(c,/openWholesale/);
  assert.match(c,/restorePrices/);
});

test("navigation lives inside the top commerce panel and remains observer-free",()=>{
  const n=read(nav),c=read(controller);
  assert.match(n,/commerce-module-strip/);
  assert.match(n,/closest\("\.panel"\)/);
  assert.match(n,/insertAdjacentElement\("afterend",nav\)/);
  assert.doesNotMatch(n,/new MutationObserver/);
  assert.doesNotMatch(c,/new MutationObserver/);
});

test("Kiosk actions include the required lower toolbar and leaflet modal",()=>{
  const c=read(controller);
  for(const label of ["Κλείσιμο","Νέα εγγραφή","Διόρθωση","Εισαγωγή από αρχείο","Excel","Ανανέωση"])assert.ok(c.includes(label),label);
  assert.ok(c.includes('row?"Διόρθωση":"Νέα"'));
  assert.ok(c.includes("προσφορά για Φυλλάδιο"));
  for(const label of ["Είδος:","Κωδικός / Barcode:","Υποκατηγορία:","Τρέχουσα τιμή:","Νέα τιμή:","% έκπτωσης:","Ισχύει από:","Bonus πόντοι:","Ισχύει έως και:","Καταχώρηση"])assert.ok(c.includes(label),label);
  assert.match(c,/offerPrice\.addEventListener\("input",recalcDiscount\)/);
  assert.match(c,/discountPercent\.addEventListener\("input",recalcPrice\)/);
  assert.match(c,/input\.accept="\.csv,text\/csv"/);
});

test("late CSS override and installer remain wired after the global stylesheet",()=>{
  const e=read(entry),c=read(css);
  assert.match(e,/installPriceCatalogVisibleNav/);
  assert.match(e,/installPriceCatalogVisibleNav\(\)/);
  assert.ok(e.indexOf('import "./styles.css"')<e.indexOf('import "./components\/commerce\/price-catalog-visible-nav.css"'));
  assert.match(c,/price-catalog-visible-nav\[hidden\]/);
  assert.match(c,/grid-template-columns:repeat\(4/);
  assert.match(e,/installTouchKeyboard\(\)/);
});
