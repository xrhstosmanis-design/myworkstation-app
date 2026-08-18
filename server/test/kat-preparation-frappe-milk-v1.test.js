import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const defaults=await readFile(new URL("../src/kat-preparation-defaults.js",import.meta.url),"utf8");

test("frappe with milk consumes milk before generic frappe rule",()=>{
  const milkRule=defaults.indexOf('if(/ΦΡΑΠΕ ΜΕ ΓΑΛΑ/.test(n))');
  const genericRule=defaults.indexOf('if(/ΦΡΑΠΕ/.test(n))');
  assert.ok(milkRule>=0,"missing frappe-with-milk recipe rule");
  assert.ok(genericRule>=0,"missing generic frappe recipe rule");
  assert.ok(milkRule<genericRule,"frappe-with-milk must be matched before generic frappe");
  assert.match(defaults,/ΦΡΑΠΕ ΜΕ ΓΑΛΑ[\s\S]*ingredientSku\.milkEvap,30,"ML"/);
});

test("recipe profile version advances when automatic recipe changes",()=>{
  assert.match(defaults,/const RECIPE_PROFILE_VERSION=4/);
});
