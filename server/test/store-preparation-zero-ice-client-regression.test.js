import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const modal=await readFile(new URL("../../client/src/components/store/StorePreparationModal.jsx",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");

test("explicit ice quantity zero is preserved as a modifier",()=>{
  assert.match(modal,/\[iceQty,setIceQty\]=useState\(null\)/);
  assert.match(modal,/if\(iceQty!==null\)modifiers\.push\(addSynthetic\("ΠΑΓΟΣ ΠΟΣΟΤΗΤΑ",iceQty\)\)/);
  assert.match(modal,/iceQtySelected:iceQty!==null/);
  assert.match(modal,/setIceQty\(p\.iceQtySelected===true\?Number\(p\.iceQty\|\|0\):null\)/);
});

test("server maps synthetic ice quantity zero to zero grams",()=>{
  assert.match(route,/synthetic-ΠΑΓΟΣ ΠΟΣΟΤΗΤΑ-%/);
  assert.match(route,/ΠΟΣΟΤΗΤΑ 0%' THEN ice_target_qty:=0/);
});
