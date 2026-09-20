import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning retries empty or invalid OpenAI structured responses once",()=>{
  assert.match(route,/const callOpenAiFallback=retry=>fetch/);
  assert.match(route,/code:"AI_EMPTY_STRUCTURED_RESPONSE"/);
  assert.match(route,/code:"AI_INVALID_STRUCTURED_RESPONSE"/);
});


test("Invoice Learning bounds the OpenAI fallback before the Render gateway timeout",()=>{
  assert.match(route,/OPENAI_INVOICE_FAST_MODEL\|\|process\.env\.OPENAI_INVOICE_MODEL\|\|"gpt-5-mini"/);
  assert.match(route,/signal:AbortSignal\.timeout\(OPENAI_FALLBACK_TIMEOUT_MS\)/);
  assert.match(route,/reasoning:\{effort:"minimal"\}/);
  assert.match(route,/code:"AI_PROVIDER_TIMEOUT"/);
  assert.match(route,/code:"AI_RETRY_TIMEOUT"/);
});
