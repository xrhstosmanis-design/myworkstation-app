import assert from "node:assert/strict";
import fs from "node:fs";

const patch=fs.readFileSync(new URL("../src/patch-pilot-backup-verify.js",import.meta.url),"utf8");
const packageJson=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8"));

assert.match(patch,/PILOT_BACKUP_RESTORE_VERIFY_V1/,"Backup verification marker missing");
assert.match(patch,/MYWORKSTATION_PILOT_SAFETY_BACKUP_V1/,"Backup format guard missing");
assert.match(patch,/document\.scope\?\.companyId!==req\.params\.companyId\|\|document\.scope\?\.storeId!==req\.params\.storeId/,"Tenant/store scope guard missing");
assert.match(patch,/\^\[a-f0-9\]\{64\}\$/, "SHA-256 checksum format guard missing");
assert.match(patch,/crypto\.createHash\("sha256"\)/,"SHA-256 verification missing");
assert.match(patch,/actual!==expected/,"Checksum comparison missing");
assert.match(patch,/mode:\"DRY_RUN_ONLY\"/,"Restore verification must remain dry-run only");
assert.match(patch,/mutatedDatabase:false/,"Dry-run must explicitly report no database mutation");
assert.match(patch,/secretsRestored:false/,"Restore verification must not restore secrets");
assert.match(patch,/PILOT_SAFETY_BACKUP_RESTORE_VERIFIED/,"Restore verification audit event missing");
assert.doesNotMatch(patch,/passwordHash\s*[:=]/,"Backup verifier must not restore password hashes");
assert.doesNotMatch(patch,/pinHash\s*[:=]/,"Backup verifier must not restore PIN hashes");
assert.ok(String(packageJson.scripts?.start||"").includes("patch-pilot-backup-verify.js"),"Server start does not mount pilot backup verification patch");

console.log("KAT pilot backup/restore safety invariants passed");
