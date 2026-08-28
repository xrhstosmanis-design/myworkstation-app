import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../src/routes/platform-device-operations.js",import.meta.url),"utf8");
test("device operations includes health dashboard and deployment lifecycle",()=>{assert.match(source,/device-health/);assert.match(source,/REMOTE_INSTALL/);assert.match(source,/APP_UPDATE/);assert.match(source,/RECOVERY_DRY_RUN/);assert.match(source,/CANCELLED/)});
test("remote operations are planned and require local device confirmation",()=>{assert.match(source,/status:\"PLANNED\"/);assert.match(source,/DEVICE_CONFIRMATION/);assert.match(source,/rollbackRequired:true/)});
test("remote operations cannot issue fiscal commands",()=>{assert.match(source,/outboundFiscalCommands:false/);assert.doesNotMatch(source,/fetch\s*\(/);assert.doesNotMatch(source,/child_process|exec\s*\(/)});
