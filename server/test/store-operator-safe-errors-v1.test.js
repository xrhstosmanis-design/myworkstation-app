import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const wrapper=route.slice(route.indexOf("function route(handler)"),route.indexOf("function requireAdmin"));

test("unexpected Store Mode failures never expose internal database messages",()=>{
  assert.match(wrapper,/clientStatus=Number\.isInteger\(error\?\.status\)/);
  assert.match(wrapper,/clientStatus\?error\?\.message:null/);
  assert.match(wrapper,/Παρουσιάστηκε προσωρινό σφάλμα\. Δοκιμάστε ξανά\./);
  assert.doesNotMatch(wrapper,/error:error\?\.publicMessage\|\|error\?\.message/);
});

test("known client errors keep their safe status and public message",()=>{
  assert.match(wrapper,/error\?\.publicMessage\|\|\(clientStatus\?error\?\.message:null\)/);
  assert.match(wrapper,/res\.status\(clientStatus\|\|500\)/);
  assert.match(wrapper,/error\?\.name==="ZodError"/);
});
