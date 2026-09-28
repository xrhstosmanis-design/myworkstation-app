import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const css=await readFile(new URL("../../client/src/components/platform/platform-admin.css",import.meta.url),"utf8");
const screen=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("Super Admin check actions wrap according to the panel width",()=>{
  assert.match(css,/\.sa-checks-workspace\{container-type:inline-size\}/);
  assert.match(css,/\.sa-checks-filters>\*\{min-width:0\}/);
  assert.match(css,/\.sa-checks-filters input,\.sa-checks-filters select,\.sa-filter-actions button\{width:100%;box-sizing:border-box\}/);
  assert.match(css,/@container\(max-width:1100px\)\{\.supplier-review-filters\.sa-checks-filters\{grid-template-columns:1fr 1fr 1fr\}/);
  assert.match(css,/@media\(max-width:760px\)\{\.supplier-review-filters\.sa-checks-filters\{grid-template-columns:1fr\}/);
  assert.match(screen,/Εκτέλεση ελέγχου/);
  assert.match(screen,/Καθαρισμός/);
});
