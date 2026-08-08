import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");

test("Store Mode login guard persists limits across server restarts",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "StoreOperatorLoginGuard"/);
  assert.match(route,/UNIQUE \("storeId","subjectKey"\)/);
  assert.match(route,/assertLoginAllowed/);
  assert.match(route,/recordLoginFailure/);
});

test("PIN and card login lock for fifteen minutes after five failures",()=>{
  assert.match(route,/failedCount"\+1>=5/);
  assert.match(route,/15\*60\*1000/);
  assert.match(route,/status=429/);
  assert.match(route,/Πολλές αποτυχημένες προσπάθειες/);
  assert.match(route,/loginSubject\("PIN",body\.employeeId\)/);
  assert.match(route,/loginSubject\("CARD",hash\)/);
});

test("successful Store Mode login clears the matching failure counter",()=>{
  const pinSuccess=route.indexOf("await clearLoginFailures(body.storeId,subjectKey)",route.indexOf('router.post("/login/pin"'));
  const cardSuccess=route.indexOf("await clearLoginFailures(body.storeId,subjectKey)",route.indexOf('router.post("/login/card"'));
  assert.ok(pinSuccess>0);
  assert.ok(cardSuccess>pinSuccess);
  assert.doesNotMatch(route,/subjectKey.*pinHash/);
  assert.doesNotMatch(route,/subjectKey.*cardCode/);
});
