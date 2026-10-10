import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {aiCommandUsage} from "../src/services/ai-command-usage.js";

// Execute the existing route's actual schema/handler with an isolated provider. No external API/database.
const source = await readFile(new URL("../src/routes/platform-admin.js", import.meta.url), "utf8");
const schemaSource = source.match(/const aiCommandQuestionSchema=.*\nconst aiCommandAnswerSchema=.*\nconst aiResponseText=.*\n/)[0];
const handlerSource = source.slice(source.indexOf('router.post("/ai-command-center/ask"'), source.indexOf("\nexport default router;"));
const snapshot = {generatedAt: "2026-10-10T12:00:00Z", companies: {active: 0, inactive: 0, stores: 0, attention: 0}, problems: {total: 0, cash: 0, payments: 0, paymentDiscrepancies: 0, bank: 0, bankDiscrepancies: 0}, companyStates: []};
const setup = (env = {OPENAI_API_KEY: "fixture-only", OPENAI_COMMAND_CENTER_MODEL: "fixture-model"}, provider = {}) => {
  const calls = [], logs = []; let handler;
  new Function("z", "router", "process", "fetch", "console", "aiCommandUsage", "AbortSignal", schemaSource + handlerSource)(
    z, {post(_path, fn) { handler = fn; }}, {env}, async (url, options) => { calls.push({url, options}); return {ok: true, status: 200, json: async () => ({output_text: JSON.stringify({answer: "Fixture", highlights: [], sources: [], limitations: "Snapshot only"}), usage: {input_tokens: 5, output_tokens: 3, total_tokens: 8}, ...provider})}; },
    {info: (...args) => logs.push(args)}, aiCommandUsage, {timeout: () => "fixture-timeout"}
  );
  return {calls, logs, async invoke(body) { let result, status = 200, error; const res = {status(value) { status = value; return this; }, json(value) { result = value; return this; }}; await handler({body}, res, value => { error = value; }); return {result, status, error}; }};
};

test("typed clients remain compatible and voice uses the same provider, prompt and read-only response", async () => {
  for (const channel of [undefined, "voice"]) {
    const f = setup(); const response = await f.invoke({question: "Έλεγξε σήμερα", snapshot, ...(channel ? {inputChannel: channel} : {})});
    assert.equal(response.error, undefined); assert.equal(response.result.readOnly, true); assert.equal(f.calls.length, 1);
    const request = JSON.parse(f.calls[0].options.body); assert.equal(request.model, "fixture-model"); assert.equal(request.tools, undefined); assert.equal(request.inputChannel, undefined);
    assert.match(request.input, /BUSINESS_SNAPSHOT=/); assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-only");
    const usage = JSON.parse(f.logs[0][1]); assert.equal(usage.feature, channel === "voice" ? "VOICE_ASSISTANT" : "COMMAND_CENTER"); assert.equal(usage.tokens.totalTokens, 8);
    assert.equal(JSON.stringify(f.logs).includes("Έλεγξε σήμερα"), false); assert.equal(JSON.stringify(f.logs).includes("fixture-only"), false);
  }
});

test("invalid channel or missing provider never triggers an AI call", async () => {
  const invalid = setup(); assert.ok((await invalid.invoke({question: "Έλεγξε σήμερα", snapshot, inputChannel: "unknown"})).error); assert.equal(invalid.calls.length, 0);
  const absent = setup({}); const response = await absent.invoke({question: "Έλεγξε σήμερα", snapshot, inputChannel: "voice"});
  assert.equal(response.status, 503); assert.equal(response.result.code, "AI_PROVIDER_NOT_CONFIGURED"); assert.equal(absent.calls.length, 0); assert.equal(absent.logs.length, 0);
});
