import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const analyticsRoute=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const moduleRoute=await readFile(new URL("../src/routes/platform-store-modules.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("an active higher check package grants BASIC execution access",()=>{
  assert.match(analyticsRoute,/const CHECK_PACKAGE_KEYS=\["BASIC_CHECK","COMPLETE_CHECK","PREMIUM_CHECK"\]/);
  assert.match(analyticsRoute,/"moduleKey"=ANY\(\$\{CHECK_PACKAGE_KEYS\}::text\[\]\)/);
  assert.match(analyticsRoute,/const activeKeys=rows\.filter\(row=>packageIsActive\(row\)\)\.map\(row=>row\.moduleKey\)/);
  assert.match(analyticsRoute,/return \{level,activeKeys,basic:true,complete:level>=CHECK_PACKAGE_LEVELS\.COMPLETE_CHECK,premium:level>=CHECK_PACKAGE_LEVELS\.PREMIUM_CHECK\}/);
});

test("BASIC variance findings include read-only chronological evidence from the same closed shift",()=>{
  assert.match(analyticsRoute,/JSON_AGG\(JSON_BUILD_OBJECT\(/);
  assert.match(analyticsRoute,/'transactionId',entry\."id",'occurredAt',entry\."occurredAt"/);
  assert.match(analyticsRoute,/WHERE t\."companyId"=s\."companyId" AND t\."storeId"=s\."storeId" AND t\."sessionId"=s\."id"/);
  assert.match(analyticsRoute,/LIMIT 50/);
  assert.match(analyticsRoute,/movementEvidence:\(session\.movementEvidence\|\|\[\]\)/);
  assert.match(ui,/Κινήσεις βάρδιας που λήφθηκαν υπόψη/);
  assert.match(ui,/Εμφανίζονται έως οι 50 νεότερες κινήσεις/);
});

test("check-package cards expose inherited access without allowing a derived package toggle",()=>{
  assert.match(moduleRoute,/const CHECK_PACKAGE_LEVELS=\{BASIC_CHECK:0,COMPLETE_CHECK:1,PREMIUM_CHECK:2\}/);
  assert.match(moduleRoute,/includedBy=CHECK_PACKAGE_KEYS\.slice\(level\+1\)\.find/);
  assert.match(moduleRoute,/canToggle:directActive\|\|!active/);
  assert.match(ui,/Περιλαμβάνεται στο \$\{packageItem\.includedByTitle\}/);
  assert.match(ui,/disabled=\{!packageItem\.canToggle\|\|packagesBusy\|\|busy\|\|reviewBusy\}/);
});
