import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");
const remote=read("../src/routes/platform-device-operations.js");
const modules=read("../src/store-paid-modules.js");
const schedules=read("../src/routes/api.js");
const platform=read("../../client/src/components/platform/PlatformAdminApp.jsx");
const acceptance=read("../../client/src/entry.jsx");
const deviceCenter=read("../../client/src/components/platform/DeviceOperationsCenter.jsx");

test("REMOTE is centrally visible, free and requires a short-lived local acceptance",()=>{
  assert.match(platform,/Super Admin Installation Center/);
  assert.match(remote,/REMOTE_ASSIST/);
  assert.match(remote,/AWAITING_DEVICE/);
  assert.match(remote,/supportCodeHash/);
  assert.match(remote,/10\*60\*1000/);
  assert.match(acceptance,/Αποδοχή REMOTE/);
  assert.match(acceptance,/remote\/.+accept/);
});

test("device operations replaces the terminal modal instead of stacking two modals",()=>{
  assert.match(platform,/setDeviceOperationsManager\(terminalManager\)/);
  assert.match(platform,/setTerminalManager\(null\)/);
  assert.match(deviceCenter,/onLaunch/);
});

test("AI staff scheduler is a paid store module with permanent Super Admin access",()=>{
  assert.match(modules,/StorePaidModule/);
  assert.match(modules,/AI_STAFF_SCHEDULER/);
  assert.match(modules,/isSuperAdmin\(req\.user\)/);
  assert.match(schedules,/requireAiStaffScheduler/);
  assert.match(schedules,/schedules\/:id\/email/);
  assert.match(schedules,/sendEmail/);
});
