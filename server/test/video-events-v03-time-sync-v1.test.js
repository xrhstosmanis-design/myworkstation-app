import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");

test("V03 persists the time comparison result and last check metadata",()=>{
  for(const field of ["timeSyncStatus","timeCheckSource","lastSystemTime","lastNvrTime","measuredOffsetSeconds","timeDeviationSeconds","lastTimeCheckedAt"])assert.match(bootstrap,new RegExp(`"${field}"`));
  assert.match(route,/UPDATE "StoreVideoConnection" SET "timeSyncStatus"/);
  assert.match(route,/measuredOffsetSeconds-Number\(connection\.timeOffsetSeconds\|\|0\)/);
});

test("V03 manual fallback requires explicit confirmation and records safe audit",()=>{
  assert.match(route,/confirmation:z\.literal\(true\)/);
  assert.match(route,/MANUAL_CONFIRMED/);
  assert.match(route,/NVR_TIME_CHECKED/);
  assert.match(route,/realNvrConnectionPerformed:false/);
  assert.doesNotMatch(route,/NVR_TIME_CHECKED[\s\S]{0,500}passwordEnc/);
});

test("V03 classifies residual clock deviation and exposes Super Admin UI",()=>{
  assert.match(route,/absoluteDeviation<=5\?"IN_SYNC":absoluteDeviation<=60\?"DRIFT":"OUT_OF_SYNC"/);
  assert.match(ui,/V03 · Συγχρονισμός ώρας/);
  assert.match(ui,/Επιβεβαίωση και σύγκριση/);
  assert.match(ui,/Δεν δηλώνει πραγματική σύνδεση με το NVR/);
});
