import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth=fs.readFileSync(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const entry=fs.readFileSync(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

test("Store Mode sessions are revalidated against every active tenant boundary",()=>{
  assert.match(auth,/StoreOperatorCredential/);
  assert.match(auth,/JOIN "Employee"/);
  assert.match(auth,/JOIN "Store"/);
  assert.match(auth,/JOIN "Company"/);
  assert.match(auth,/operator\.active/);
  assert.match(auth,/operator\.employeeActive/);
  assert.match(auth,/operator\.storeActive/);
  assert.match(auth,/operator\.companyActive/);
});

test("a role change invalidates the old Store Mode token",()=>{
  assert.match(auth,/operator\.role!==payload\.role/);
  assert.match(auth,/STORE_OPERATOR_ROLE_CHANGED/);
  assert.match(auth,/Συνδεθείτε ξανά/);
});

test("Store Mode clears local authentication immediately after a rejected session",()=>{
  assert.match(entry,/response\.status===401&&storeMatch/);
  assert.match(entry,/removeItem\("token"\)/);
  assert.match(entry,/removeItem\("storeOperatorSession"\)/);
  assert.match(entry,/window\.location\.reload\(\)/);
});
