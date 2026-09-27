import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const css=await readFile(new URL("../../client/src/components/platform/platform-admin.css",import.meta.url),"utf8");
const screen=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("Super Admin check actions wrap before the intermediate viewport clips them",()=>{
  assert.match(css,/@media\(max-width:1250px\)\{\.supplier-review-filters\.sa-checks-filters\{grid-template-columns:1fr 1fr 1fr\}/);
  assert.match(screen,/Εκτέλεση ελέγχου/);
  assert.match(screen,/Καθαρισμός/);
});
