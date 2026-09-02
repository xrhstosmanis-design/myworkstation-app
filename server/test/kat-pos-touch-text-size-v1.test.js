import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const panel=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const viewportCss=await readFile(new URL("../../client/src/components/store/store-pos-viewport-fit.css",import.meta.url),"utf8");

test("POS exposes a touch text-size control with three choices",()=>{
  assert.match(panel,/className="pos-text-size-trigger"/);
  assert.match(panel,/Κανονικά/);
  assert.match(panel,/Μεγάλα/);
  assert.match(panel,/Πολύ μεγάλα/);
  assert.match(panel,/Αλλάζει μόνο τα γράμματα — όχι τη διάταξη/);
});

test("text-size preference is saved per store terminal",()=>{
  assert.match(panel,/myworkstation:pos-text-size:/);
  assert.match(panel,/localStorage\.setItem\(posTextSizeKey\(store\.id\),next\)/);
  assert.match(panel,/"--pos-text-scale":selectedPosTextSize\.scale/);
});

test("font scaling does not change fixed POS geometry",()=>{
  assert.match(viewportCss,/font-size: calc\(17px \* var\(--pos-text-scale\)\)/);
  assert.match(viewportCss,/font-size: calc\(10px \* var\(--pos-text-scale\)\)/);
  assert.doesNotMatch(viewportCss,/zoom:\s*var\(--pos-text-scale\)/);
  assert.doesNotMatch(viewportCss,/transform:\s*scale\(var\(--pos-text-scale\)\)/);
});
