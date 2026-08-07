import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/components/platform/PlatformSecurityPanel.jsx",import.meta.url),"utf8");

test("Super Admin security panel exposes protected mail readiness and test action",()=>{
  assert.match(source,/\/api\/platform\/mail\/status/);
  assert.match(source,/\/api\/platform\/mail\/test/);
  assert.match(source,/Αποστολή δοκιμαστικού email/);
  assert.doesNotMatch(source,/SMTP_PASSWORD/);
});
