import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const directory=route.slice(route.indexOf('router.get("/stores/:storeId/directory"'),route.indexOf('router.post("/login/pin"'));
const credentialUpdate=route.slice(route.indexOf('router.put("/stores/:storeId/employees/:employeeId"'));

test("public Store Mode directory exposes only the data needed for login",()=>{
  assert.match(directory,/c\."employeeId",c\."displayName"/);
  assert.match(directory,/AS "hasPin"/);
  assert.match(directory,/AS "hasCard"/);
  assert.doesNotMatch(directory,/c\."role"/);
  assert.doesNotMatch(directory,/pinHash"\s*,/);
  assert.doesNotMatch(directory,/cardCodeHash"\s*,/);
});

test("administrator credential reset releases matching login guards",()=>{
  assert.match(credentialUpdate,/clearLoginFailures\(store\.id,loginSubject\("PIN",employee\.id\)\)/);
  assert.match(credentialUpdate,/loginSubject\("CARD",existing\.cardCodeHash\)/);
  assert.match(credentialUpdate,/loginSubject\("CARD",cardCodeHash\)/);
});
