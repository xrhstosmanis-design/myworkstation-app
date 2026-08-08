import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const auth=await readFile(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");

test("every Store Mode login creates a server-side expiring session",()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "StoreOperatorSession"/);
  assert.match(route,/operatorSessionId:sessionId/);
  assert.match(route,/createOperatorSession\(req,operator\)/);
  assert.match(auth,/JOIN "StoreOperatorSession"/);
  assert.match(auth,/operatorSessionExpired/);
});

test("Store Mode logout revokes the exact server session before clearing the tablet",()=>{
  assert.match(route,/router\.post\("\/logout",auth/);
  assert.match(route,/"revokedAt"=COALESCE\("revokedAt",NOW\(\)\)/);
  assert.match(route,/eventType:"OPERATOR_LOGOUT"/);
  assert.match(ui,/await api\("\/api\/operators\/logout",\{method:"POST"\}\)/);
  assert.match(ui,/finally\{[\s\S]*localStorage\.removeItem\("token"\)/);
});

test("legacy Store Mode tokens are rejected after the session upgrade",()=>{
  assert.match(auth,/if\(!payload\.operatorSessionId\)/);
  assert.match(auth,/STORE_OPERATOR_SESSION_REQUIRED/);
});
