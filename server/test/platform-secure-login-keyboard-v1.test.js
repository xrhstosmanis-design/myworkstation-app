import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const login=await readFile(new URL("../../client/src/components/platform/PlatformSecureLogin.jsx",import.meta.url),"utf8");

test("platform authentication fields stay on the native keyboard path",()=>{
  assert.match(login,/<input type="email" data-keyboard="off"/);
  assert.match(login,/<input type="password" data-keyboard="off"/);
  assert.match(login,/onInput=\{e=>setEmail\(e\.currentTarget\.value\)\}/);
  assert.match(login,/onInput=\{e=>setPassword\(e\.currentTarget\.value\)\}/);
  assert.match(login,/<input data-keyboard="off" inputMode="numeric" autoComplete="one-time-code"/);
  assert.match(login,/Κωδικός 2FA ή κωδικός ανάκτησης<input data-keyboard="off"/);
});
