import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/backoffice-column-filters.js",import.meta.url),"utf8");

test("BackOffice columns resize horizontally and persist per table",()=>{
  assert.match(source,/mws-col-resizer/);
  assert.match(source,/mws-col-resizer:after/);
  assert.match(source,/pointermove/);
  assert.match(source,/setPointerCapture/);
  assert.match(source,/applyTableWidths/);
  assert.match(source,/tableLayout="fixed"/);
  assert.match(source,/mws:backoffice:columns:v1/);
  assert.match(source,/localStorage\.setItem\(storageKey\(meta\)/);
});

test("native BackOffice tables receive the shared resize controls automatically",()=>{
  assert.match(source,/querySelectorAll\("table"\)/);
  assert.match(source,/if\(headers\.length<2\)return/);
  assert.match(source,/decorateHeaders\(headers,\{container:table/);
});

test("CSS grid column pixel widths are parsed as numbers before dragging",()=>{
  assert.match(source,/const gridWidths=/);
  assert.match(source,/Number\.parseFloat\(value\)/);
  assert.match(source,/parsed\.every\(Number\.isFinite\)/);
  assert.doesNotMatch(source,/gridTemplateColumns\.split\(\/\\s\+\/\)\.map\(Number\)/);
  assert.match(source,/gridWidths\(meta\)/);
});

test("column popdowns expose conditions and real distinct values",()=>{
  assert.match(source,/Περιέχει/);
  assert.match(source,/Δεν είναι ίσο/);
  assert.match(source,/Μεγαλύτερο από/);
  assert.match(source,/new Set\(meta\.rows\(\)/);
  assert.match(source,/mws-col-filter-values/);
  assert.match(source,/normalize\("NFD"\)/);
  assert.match(source,/replace\(\/\[ςΣ\]\/g,"σ"\)/);
  assert.match(source,/terms\.every\(term=>value\.includes\(term\)\)/);
  assert.match(source,/mws:backoffice:filters:v1/);
  assert.match(source,/saveFilters\(meta\)/);
  assert.match(source,/restoreFilters\(meta\)/);
  assert.match(source,/activePopup&&!activePopup\.contains\(e\.target\)/);
  assert.doesNotMatch(source,/addEventListener\("scroll",closePopup,true\)/);
});

test("header click cycles ascending descending and original order",()=>{
  assert.match(source,/current===""\?"asc":current==="asc"\?"desc":""/);
  assert.match(source,/localeCompare\(String\(bv\),"el",\{numeric:true\}\)/);
  assert.match(source,/mwsOriginalOrder/);
  assert.match(source,/compareValue/);
});

test("all supported grids receive Greek headers and column controls",()=>{
  assert.match(source,/HEADER_TRANSLATIONS/);
  assert.match(source,/\["ACTIONS","Ενέργειες"\]/);
  assert.match(source,/translateHeader/);
  assert.match(source,/\.mws-daily-row\.head/);
  assert.match(source,/\.recipe-head/);
});
