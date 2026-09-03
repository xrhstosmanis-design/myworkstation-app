import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth=fs.readFileSync(new URL("../src/middleware/auth.js",import.meta.url),"utf8");

test("POS invoice document and AI job writes do not use operator credential as User FK",()=>{
  assert.match(auth,/writesNullableUserFk/);
  assert.match(auth,/\/api\/commerce\/documents\/inbox/);
  assert.match(auth,/\/api\/commerce\/ai-reader\/jobs/);
  assert.match(auth,/id:writesNullableUserFk\?null:operator\.id/);
  assert.match(auth,/operatorId:operator\.id/);
});
