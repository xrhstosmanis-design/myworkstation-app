import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
const serverPatch=read("server/src/patch-safe-vault-adjustment-alert.js");
const clientPatch=read("client/scripts/patch-safe-vault-decrease-reason.js");
const serverPackage=read("server/package.json");
const rootPackage=read("package.json");

assert.match(serverPackage,/patch-safe-vault-adjustment-alert\.js/);
assert.match(rootPackage,/patch-safe-vault-decrease-reason\.js/);
assert.match(serverPatch,/SAFE_ADJUSTMENT/);
assert.match(serverPatch,/SAFE_DECREASE_REASON_REQUIRED/);
assert.match(serverPatch,/sendEmail/);
assert.match(serverPatch,/responsibleEmail/);
assert.match(serverPatch,/body\.drawer\+body\.custody\+body\.coins/);
assert.doesNotMatch(serverPatch,/operational\s*=\s*body\.drawer\+body\.custody\+body\.coins\+body\.safe/);
assert.match(clientPatch,/newSafe<expectedSafe/);
assert.match(clientPatch,/safeReason/);
assert.match(clientPatch,/Γράψε υποχρεωτικά αιτιολογία/);

console.log("KAT safe vault adjustment invariants passed");
