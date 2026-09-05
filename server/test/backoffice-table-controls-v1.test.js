import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/backoffice-column-filters.js",import.meta.url),"utf8");

test("BackOffice columns resize horizontally and persist per table",()=>{
  assert.match(source,/mws-col-resizer/);
  assert.match(source,/pointermove/);
  assert.match(source,/mws:backoffice:columns:v1/);
  assert.match(source,/localStorage\.setItem\(storageKey\(meta\)/);
});

test("column popdowns expose conditions and real distinct values",()=>{
  assert.match(source,/Περιέχει/);
  assert.match(source,/Δεν είναι ίσο/);
  assert.match(source,/Μεγαλύτερο από/);
  assert.match(source,/new Set\(meta\.rows\(\)/);
  assert.match(source,/mws-col-filter-values/);
  assert.match(source,/activePopup&&!activePopup\.contains\(e\.target\)/);
  assert.doesNotMatch(source,/addEventListener\("scroll",closePopup,true\)/);
});

test("header click cycles ascending descending and original order",()=>{
  assert.match(source,/current===""\?"asc":current==="asc"\?"desc":""/);
  assert.match(source,/localeCompare\(String\(bv\),"el",\{numeric:true\}\)/);
  assert.match(source,/mwsOriginalOrder/);
  assert.match(source,/compareValue/);
});
