import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const platform=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const audit=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");

test("V11 stores a bounded metadata retention policy per recorder",()=>{
  assert.match(bootstrap,/"retentionDays" INTEGER NOT NULL DEFAULT 30/);
  assert.match(bootstrap,/"retentionDays" BETWEEN 1 AND 365/);
  assert.match(platform,/retentionDays:z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(365\)/);
  assert.match(ui,/Διατήρηση μεταδεδομένων \(ημέρες\)/);
});

test("V11 stamps expiry and purges only expired event metadata",()=>{
  assert.match(bootstrap,/"expiresAt" TIMESTAMPTZ NOT NULL/);
  assert.match(bootstrap,/eventAt\.getTime\(\)\+retentionDays\*86400000/);
  assert.match(bootstrap,/DELETE FROM "VideoOperationalEvent" WHERE "expiresAt"<\$\{now\}/);
  assert.match(audit,/v\."expiresAt">NOW\(\)/);
});

test("V11 does not add CCTV payload storage",()=>{
  assert.match(ui,/δεν αντιγράφουν video ή ολόκληρο CCTV/);
  assert.doesNotMatch(bootstrap,/BYTEA|videoData|clipData|videoBlob|recordingBlob/i);
});
