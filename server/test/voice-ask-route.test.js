import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {aiCommandUsage} from "../src/services/ai-command-usage.js";
import {runCashAssistant} from "../src/services/assistant-cash-tools.js";

// Execute the existing route's actual schema/handler with an isolated provider. No external API/database.
const source = await readFile(new URL("../src/routes/platform-admin.js", import.meta.url), "utf8");
const schemaSource = source.match(/const aiCommandQuestionSchema=.*\nconst aiCommandAnswerSchema=.*\nconst aiResponseText=.*\n/)[0];
const handlerSource = source.slice(source.indexOf('router.post("/ai-command-center/ask"'), source.indexOf("\nexport default router;"));
const snapshot = {generatedAt: "2026-10-10T12:00:00Z", companies: {active: 0, inactive: 0, stores: 0, attention: 0}, problems: {total: 0, cash: 0, payments: 0, paymentDiscrepancies: 0, bank: 0, bankDiscrepancies: 0}, companyStates: []};
const setup = (env = {OPENAI_API_KEY: "fixture-only", OPENAI_COMMAND_CENTER_MODEL: "fixture-model"}, provider = {}) => {
  const calls = [], logs = [], reads = []; let handler;
  new Function("z", "router", "process", "fetch", "console", "aiCommandUsage", "AbortSignal", "runCashAssistant", "readCanonicalPlatformCash", schemaSource + handlerSource)(
    z, {post(_path, fn) { handler = fn; }}, {env}, async (url, options) => { calls.push({url, options}); return {ok: true, status: 200, json: async () => ({output_text: JSON.stringify({answer: "Fixture", highlights: [], sources: [], limitations: "Snapshot only"}), usage: {input_tokens: 5, output_tokens: 3, total_tokens: 8}, ...(typeof provider==="function"?provider(calls.length):provider)})}; },
    {info: (...args) => logs.push(args)}, aiCommandUsage, {timeout: () => "fixture-timeout"}, runCashAssistant, async (_req,date) => {reads.push(date);return {date,rows:[{storeName:"LAB",sessionId:"shift",variance:-12.5}],totals:{}}}
  );
  return {calls, logs, reads, async invoke(body) { let result, status = 200, error; const res = {status(value) { status = value; return this; }, json(value) { result = value; return this; }}; await handler({body,user:{isSuperAdmin:true},headers:{authorization:"Bearer session-fixture"}}, res, value => { error = value; }); return {result, status, error}; }};
};

test("typed clients remain compatible and voice uses the same provider, prompt and read-only response", async () => {
  for (const channel of [undefined, "voice"]) {
    const f = setup(); const response = await f.invoke({question: "Έλεγξε σήμερα", snapshot, ...(channel ? {inputChannel: channel} : {})});
    assert.equal(response.error, undefined); assert.equal(response.result.readOnly, true); assert.equal(f.calls.length, 1);
    const request = JSON.parse(f.calls[0].options.body); assert.equal(request.model, "fixture-model"); assert.equal(request.tools[0].name, "cash_details"); assert.equal(request.inputChannel, undefined);
    assert.equal(request.store,false);assert.match(request.input[0].content, /BUSINESS_SNAPSHOT=/); assert.equal(f.calls[0].options.headers.Authorization, "Bearer fixture-only");
    const usage = JSON.parse(f.logs[0][1]); assert.equal(usage.feature, channel === "voice" ? "VOICE_ASSISTANT" : "COMMAND_CENTER"); assert.equal(usage.tokens.totalTokens, 8);
    assert.equal(JSON.stringify(f.logs).includes("Έλεγξε σήμερα"), false); assert.equal(JSON.stringify(f.logs).includes("fixture-only"), false);
  }
});

test("actual Ask handler carries a historical cash read into the provider and returns canonical evidence",async()=>{
  const f=setup(undefined,index=>index===1?{output_text:undefined,output:[{type:"function_call",name:"cash_details",call_id:"cash-fixture",arguments:'{"date":"2026-10-09"}'}]}:{});
  const response=await f.invoke({question:"Δείξε το πρόβλημα μετρητών στις 9 Οκτωβρίου",snapshot,inputChannel:"voice"});
  assert.equal(response.error,undefined);assert.deepEqual(f.reads,["2026-10-09"]);assert.equal(f.calls.length,2);assert.equal(f.logs.length,2);
  assert.equal(response.result.evidence[0].rows[0].variance,-12.5);assert.equal(response.result.evidence[0].rows[0].sessionId,"shift");
  const continued=JSON.parse(f.calls[1].options.body);assert.equal(continued.input.at(-1).type,"function_call_output");assert.match(continued.input.at(-1).output,/-12.5/);
});

test("invalid channel or missing provider never triggers an AI call", async () => {
  const invalid = setup(); assert.ok((await invalid.invoke({question: "Έλεγξε σήμερα", snapshot, inputChannel: "unknown"})).error); assert.equal(invalid.calls.length, 0);
  const absent = setup({}); const response = await absent.invoke({question: "Έλεγξε σήμερα", snapshot, inputChannel: "voice"});
  assert.equal(response.status, 503); assert.equal(response.result.code, "AI_PROVIDER_NOT_CONFIGURED"); assert.equal(absent.calls.length, 0); assert.equal(absent.logs.length, 0);
});
