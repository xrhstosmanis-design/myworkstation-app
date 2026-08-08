import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/platform-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const css=await readFile(new URL("../../client/src/components/platform/platform-super-access.css",import.meta.url),"utf8");

test("pilot profile stores the real PC, operating hours and responsible person per store",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "PilotStoreProfile"/);
  assert.match(route,/stores\/:storeId\/pilot-profile/);
  assert.match(route,/"pcName","operatingHours","responsibleName"/);
  assert.match(ui,/Κλείδωμα πιλοτικής εγκατάστασης/);
  assert.match(ui,/company\.stores\.length===1[\s\S]*Ετοιμότητα/);
});

test("pilot readiness blocks until backup, design and database freezes are confirmed",()=>{
  assert.match(route,/key:"backup"[\s\S]*blocking:true/);
  assert.match(route,/key:"scopeFreeze"[\s\S]*blocking:true/);
  assert.match(ui,/Λήψη ασφαλούς backup/);
  assert.match(ui,/Κλείδωμα υπάρχοντος design/);
  assert.match(ui,/Κλείδωμα δομής βάσης/);
});

test("Super Admin creates a tenant-scoped safety backup before it is confirmed",()=>{
  assert.match(route,/stores\/:storeId\/pilot-backup/);
  assert.match(route,/MYWORKSTATION_PILOT_SAFETY_BACKUP_V1/);
  assert.match(route,/containsPasswords:false/);
  assert.match(route,/containsPinOrCardSecrets:false/);
  assert.match(route,/X-Backup-SHA256/);
  assert.match(route,/PILOT_SAFETY_BACKUP_DOWNLOADED/);
  assert.match(ui,/downloadPilotBackup/);
});

test("scope freeze does not involve the RBS fiscal path",()=>{
  assert.match(route,/καμία εντολή προς RBS/);
  assert.match(ui,/δεν επικοινωνεί με RBS\/ταμειακή/);
});

test("physical pilot smoke tests are explicitly confirmed without fiscal automation",()=>{
  assert.match(bootstrap,/"loginTestedAt" TIMESTAMPTZ/);
  assert.match(route,/key:"operatorSmoke"[\s\S]*blocking:true/);
  assert.match(route,/key:"shiftSmoke"[\s\S]*blocking:true/);
  assert.match(route,/key:"kioskIsolation"[\s\S]*blocking:true/);
  assert.match(ui,/Είσοδος με PIN\/κάρτα/);
  assert.match(ui,/Kiosk Manager ανεπηρέαστο/);
  assert.match(ui,/δεν στέλνει εντολές σε RBS ή ταμειακή/);
});

test("readiness remains available during a rolling deploy before optional tables exist",()=>{
  assert.match(route,/to_regclass\('public\."PilotStoreProfile"'\)::text/);
  assert.match(route,/profileTable\[0\]\?\.tableName\?/);
  assert.match(route,/to_regclass\('public\."StorePosLayout"'\)::text/);
  assert.match(route,/layoutTable\[0\]\?\.tableName\?/);
});

test("readiness table probes are safely deserialized by Prisma",()=>{
  assert.doesNotMatch(route,/to_regclass\('[^']+'\) AS "tableName"/);
  assert.equal((route.match(/to_regclass\('[^']+'\)::text AS "tableName"/g)||[]).length,6);
});

test("Super Admin can print a clean store readiness report",()=>{
  assert.match(ui,/readiness-print-floating/);
  assert.match(ui,/window\.print\(\)/);
  assert.match(ui,/Εκτύπωση ελέγχου/);
  assert.match(css,/@media print/);
  assert.match(css,/\.pilot-profile-form\{display:none!important\}/);
});

test("readiness always provides visible close and Escape exit controls",()=>{
  assert.match(ui,/if\(event\.key==="Escape"\)setReadiness\(null\)/);
  assert.match(ui,/className="modal-close" onClick=\{\(\)=>setReadiness\(null\)\}/);
  assert.match(css,/\.readiness-dialog>\.modal-close\{position:fixed!important/);
  assert.match(css,/z-index:97!important/);
});
