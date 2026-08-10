import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const controller="client/src/components/commerce/installPriceCatalogControllerV2.js";
const footer="client/src/components/commerce/installPriceCatalogPriceFooterHotfix.js";
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const syntax=file=>{const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});assert.equal(r.status,0,r.stderr||r.stdout)};

test("Price Catalog V2 controller and footer hotfix parse",()=>{syntax(controller);syntax(footer)});
test("four visible tabs are handled directly",()=>{const c=read(controller);for(const fn of ["restorePrices","openLeaflet","openGifts","openWholesale"])assert.ok(c.includes(fn));assert.match(c,/stopImmediatePropagation\(\)/)});
test("leaflet new entry follows Kiosk fields",()=>{const c=read(controller);assert.ok(c.includes('row?"Διόρθωση":"Νέα"'));assert.ok(c.includes("προσφορά για Φυλλάδιο"));for(const label of ["Είδος:","Κωδικός / Barcode:","Υποκατηγορία:","Τρέχουσα τιμή:","Νέα τιμή:","% έκπτωσης:","Ισχύει από:","Bonus πόντοι:","Ισχύει έως και:","Επιστροφή","Καταχώρηση"])assert.ok(c.includes(label),label)});
test("lower toolbar actions are real",()=>{const c=read(controller),f=read(footer);for(const label of ["Κλείσιμο","Νέα εγγραφή","Διόρθωση","Εισαγωγή από αρχείο","Excel","Ανανέωση"])assert.ok(c.includes(label),label);assert.match(c,/\/api\/price-catalog\/promotions/);assert.match(c,/\/api\/price-catalog\/wholesale/);assert.match(f,/exportVisiblePriceTable/);assert.match(f,/closePriceCatalog/)});
test("touch-compatible inputs remain plain text and number controls",()=>{const c=read(controller);assert.match(c,/type=\"number\"/);assert.match(c,/name=\"productSearch\"/);assert.doesNotMatch(c,/new MutationObserver/)});
