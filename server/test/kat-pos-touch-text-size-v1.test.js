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
  assert.match(panel,/id:"XL",label:"Πολύ μεγάλα",scale:1\.3/);
  assert.match(panel,/Αλλάζει μόνο τα γράμματα — όχι τη διάταξη/);
});

test("text-size preference is saved per store terminal",()=>{
  assert.match(panel,/myworkstation:pos-text-size:/);
  assert.match(panel,/localStorage\.setItem\(posTextSizeKey\(store\.id\),next\)/);
  assert.match(panel,/"--pos-text-scale":selectedPosTextSize\.scale/);
});

test("font scaling does not change fixed POS geometry",()=>{
  assert.match(viewportCss,/font-size: calc\(17px \* var\(--pos-text-scale\)\)/);
  assert.match(viewportCss,/\.pos-audience-selector button \{ font-size: calc\(14px \* var\(--pos-text-scale\)\)/);
  assert.match(viewportCss,/\.standard-action-bar > button,[\s\S]*font-size: calc\(12px \* var\(--pos-text-scale\)\)/);
  assert.doesNotMatch(viewportCss,/zoom:\s*var\(--pos-text-scale\)/);
  assert.doesNotMatch(viewportCss,/transform:\s*scale\(var\(--pos-text-scale\)\)/);
});

test("Store Mode is locked to the viewport while inner product lists may scroll",()=>{
  assert.match(viewportCss,/\.compact-store-mode \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*overflow: hidden;[\s\S]*overscroll-behavior: none;/);
  assert.match(viewportCss,/\.compact-store-main \{[\s\S]*height: 100%;[\s\S]*overflow: hidden;/);
  assert.match(viewportCss,/\.mws-standard-pos \.standard-pos-grid \{[\s\S]*min-height: 0;/);
});
