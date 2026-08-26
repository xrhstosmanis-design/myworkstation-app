import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const platform=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const operators=await readFile(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");

test("Super Admin creates a store-specific Store Mode link and Windows shortcut",()=>{
  assert.match(platform,/\/store\/\$\{encodeURIComponent\(store\.id\)\}/);
  assert.match(platform,/\[InternetShortcut\]/);
  assert.match(platform,/MyWorkStation Store Mode - \$\{store\.name/);
  assert.match(platform,/>Store Mode</);
  assert.match(platform,/>Απλή συντόμευση</);
});

test("direct Store Mode launch still requires personal PIN or card authentication",()=>{
  assert.match(entry,/const storeMatch=window\.location\.pathname\.match\(\/\^\\\/store\\\/\(\[\^\/\]\+\)/);
  assert.match(operators,/router\.post\("\/login\/pin"/);
  assert.match(operators,/router\.post\("\/login\/card"/);
  assert.match(operators,/OPERATOR_LOGIN_PIN/);
  assert.match(operators,/OPERATOR_LOGIN_CARD/);
});
