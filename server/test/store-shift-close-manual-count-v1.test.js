import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/components/store/StoreShiftClosePanel.jsx",import.meta.url),"utf8");

test("store shift close requires real physical count before close",()=>{
  assert.match(source,/Άνοιξε πρώτα το συρτάρι από το κουμπί της ταμειακής/);
  assert.match(source,/μέτρησα τα πραγματικά χρήματα/);
  assert.match(source,/drawer:"",custody:"",coins:"",safe:""/);
  assert.match(source,/!countConfirmed/);
  assert.match(source,/\/api\/cash\/sessions\/\$\{data\.openSession\.id\}\/close/);
});
