import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker=fs.readFileSync(new URL("../src/workers/workforce-auto-out.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");

test("Workforce stale attendance auto-outs at 12h and requires review",()=>{
  assert.match(worker,/12\*60\*60\*1000/);
  assert.match(worker,/method:"AUTO_OUT_12H"/);
  assert.match(worker,/status:"NEEDS_APPROVAL"/);
  assert.match(worker,/code:"AUTO_OUT_12H"/);
  assert.match(worker,/action:"WORKFORCE_AUTO_OUT_12H"/);
  assert.match(worker,/startedAt:\{lte:cutoff\}/);
  assert.match(worker,/FOR UPDATE/);
  assert.match(worker,/workedMinutes=720/);
  assert.match(worker,/setInterval\(run,5\*60\*1000\)/);
  assert.match(index,/startWorkforceAutoOutWorker\(\)/);
});
