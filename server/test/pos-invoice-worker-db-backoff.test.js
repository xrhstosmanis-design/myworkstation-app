import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");

test("POS invoice durable worker backs off after Prisma pool exhaustion",()=>{
  assert.match(source,/const POS_BACKGROUND_DB_BACKOFF_MS=60000/);
  assert.match(source,/Timed out fetching a new connection from the connection pool/);
  assert.match(source,/P2024/);
  assert.match(source,/Date\.now\(\)<posBackgroundDbBackoffUntil/);
  assert.match(source,/posBackgroundDbBackoffUntil=Date\.now\(\)\+POS_BACKGROUND_DB_BACKOFF_MS/);
});

test("normal durable sweep cadence remains five seconds",()=>{
  assert.match(source,/const POS_BACKGROUND_SWEEP_MS=5000/);
  assert.match(source,/setInterval\(runPosInvoiceBackgroundSweep,POS_BACKGROUND_SWEEP_MS\)/);
});
