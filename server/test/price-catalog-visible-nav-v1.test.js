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
const entry="client/src/entry.jsx";
const css="client/src/components/commerce/price-catalog-visible-nav.css";
const syntax=file=>{const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)};

test("structural price catalog navigation parses",()=>syntax(nav));

test("all four price catalog destinations are always represented",()=>{
  const n=read(nav);
  for(const label of ["Έλεγχος τιμών πώλησης","Προσφορές φυλλαδίου","Προσφορές και δώρα","Τιμές χονδρικής"])assert.ok(n.includes(label),label);
  for(const id of ["prices","leaflet","gifts","wholesale"])assert.ok(n.includes(`\"${id}\"`),id);
});

test("visible navigation drives the same real internal tabs",()=>{
  const n=read(nav);
  assert.match(n,/data-price-catalog-visible-tab/);
  assert.match(n,/data-pc-tab/);
  assert.match(n,/internal\.click\(\)/);
  assert.match(n,/price-catalog-suite:not\(\[hidden\]\)/);
});

test("navigation lives inside the top commerce panel and is independent of hidden suite layout",()=>{
  const n=read(nav);
  assert.match(n,/commerce-module-strip/);
  assert.match(n,/closest\("\.panel"\)/);
  assert.match(n,/insertAdjacentElement\("afterend",nav\)/);
  assert.doesNotMatch(n,/new MutationObserver/);
});

test("late CSS override and installer are wired after the global stylesheet",()=>{
  const e=read(entry),c=read(css);
  assert.match(e,/installPriceCatalogVisibleNav/);
  assert.match(e,/installPriceCatalogVisibleNav\(\)/);
  assert.ok(e.indexOf('import "./styles.css"')<e.indexOf('import "./components\/commerce\/price-catalog-visible-nav.css"'));
  assert.match(c,/price-catalog-visible-nav\[hidden\]/);
  assert.match(c,/grid-template-columns:repeat\(4/);
  assert.match(e,/installTouchKeyboard\(\)/);
});
