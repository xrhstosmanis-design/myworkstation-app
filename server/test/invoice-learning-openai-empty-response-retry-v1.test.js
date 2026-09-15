import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning retries empty or invalid OpenAI structured responses once",()=>{
  assert.match(route,/const callOpenAiFallback=retry=>fetch/);
  assert.match(route,/code:"AI_EMPTY_STRUCTURED_RESPONSE"/);
  assert.match(route,/code:"AI_INVALID_STRUCTURED_RESPONSE"/);
});
