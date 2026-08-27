import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/components/platform/PlatformSecurityPanel.jsx",import.meta.url),"utf8");
const mailService=fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8");

test("Super Admin security panel exposes protected mail readiness and test action",()=>{
  assert.match(source,/\/api\/platform\/mail\/status/);
  assert.match(source,/\/api\/platform\/mail\/test/);
  assert.match(source,/Αποστολή δοκιμαστικού email/);
  assert.doesNotMatch(source,/SMTP_PASSWORD/);
});

test("SMTP delivery failures return a useful safe error instead of a generic server error",()=>{
  assert.match(mailService,/MAIL_DELIVERY_FAILED/);
  assert.match(mailService,/Η αναφορά δημιουργήθηκε, αλλά δεν στάλθηκε με email/);
  assert.match(mailService,/error\.status=502/);
  assert.doesNotMatch(mailService,/SMTP_PASSWORD.*cause/);
});
