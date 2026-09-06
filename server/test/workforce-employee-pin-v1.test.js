import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/platform-workforce-v2-employees.js",import.meta.url),"utf8");
const access=fs.readFileSync(new URL("../src/routes/workforce-v2-access.js",import.meta.url),"utf8");
const validation=fs.readFileSync(new URL("../src/routes/workforce-v2-validation.js",import.meta.url),"utf8");

test("Workforce v2 PIN is validated and bcrypt-hashed",()=>{
  assert.match(validation,/pin:z\.union\(\[z\.string\(\)\.regex\(\/\^\\d\{4,8\}\$/);
  assert.match(route,/bcrypt\.hash\(body\.pin,12\)/);
  assert.doesNotMatch(route,/res\.json\(.*pinHash/);
});

test("Workforce employee serialization exposes only hasPin",()=>{
  assert.match(access,/hasPin:Boolean\(employee\.pinHash\)/);
  assert.doesNotMatch(access,/pinHash:employee\.pinHash/);
});
