import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const patch=await readFile(new URL("../scripts/patch-pos-return-diagnostics.js",import.meta.url),"utf8");
const render=await readFile(new URL("../../render.yaml",import.meta.url),"utf8");

test("live POS return diagnostics are safe and Render-enabled",()=>{
  assert.match(patch,/POS_RETURN_\$\{stage\}_FAILED/);
  for(const stage of ["SALE_LINE","PAYMENT","STOCK","LEDGER","AUDIT","SALE","UNKNOWN"])assert.match(patch,new RegExp(`\\"${stage}\\"`));
  assert.doesNotMatch(patch,/return res\.status\(500\)\.json\(\{[^}]*raw/);
  assert.match(render,/node server\/scripts\/patch-pos-return-diagnostics\.js/);
});
