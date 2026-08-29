import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");

test("operator access exposes same-shift payment permission",()=>{
  assert.match(source,/sameShiftPayments:p\.sameShiftPayments!==false/);
});
