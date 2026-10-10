import test from "node:test";
import assert from "node:assert/strict";
import {createVoiceInput, speechRecognitionConstructor} from "../../client/src/components/voice/voice-input.js";
import {aiCommandUsage} from "../src/services/ai-command-usage.js";

function fixture(options = {}) {
  const instances = [], states = [], texts = [], timers = new Map(); let id = 0;
  const controller = createVoiceInput({
    createRecognition: () => { const recognition = {startCalls: 0, stopCalls: 0, abortCalls: 0,
      start() { this.startCalls++; }, stop() { this.stopCalls++; }, abort() { this.abortCalls++; }};
      instances.push(recognition); return recognition; },
    onState: value => states.push(value), onText: text => texts.push(text),
    setTimer: fn => { timers.set(++id, fn); return id; }, clearTimer: token => timers.delete(token), ...options
  });
  return {controller, instances, states, texts, timers};
}
const result = (text, final = true) => Object.assign([{transcript: text}], {isFinal: final});

test("voice requires HTTPS and a real browser recognition constructor", () => {
  class Recognition {}
  assert.equal(speechRecognitionConstructor({isSecureContext: false, SpeechRecognition: Recognition}), null);
  assert.equal(speechRecognitionConstructor({isSecureContext: true}), null);
  assert.equal(speechRecognitionConstructor({isSecureContext: true, webkitSpeechRecognition: Recognition}), Recognition);
});

test("voice is opt-in, one session, Greek, never auto-submits or duplicates a final result", () => {
  const f = fixture(); assert.equal(f.instances.length, 0);
  assert.equal(f.controller.start("Υπάρχουσα ερώτηση"), true); assert.equal(f.controller.start(), false);
  const r = f.instances[0]; assert.equal(r.lang, "el-GR"); assert.equal(r.continuous, false);
  r.onstart(); r.onresult({results: [result("πόσα νερά", false)]}); assert.deepEqual(f.texts, []);
  r.onresult({results: [result("πόσα νερά")]}); r.onresult({results: [result("πόσα νερά")]});
  assert.deepEqual(f.texts, []); const lateEnd = r.onend; r.onend(); lateEnd();
  assert.deepEqual(f.texts, ["Υπάρχουσα ερώτηση πόσα νερά"]); assert.equal(f.instances.length, 1); assert.equal(f.timers.size, 0);
});

test("stop accepts the final result once and remains processing until end", () => {
  const f = fixture(); f.controller.start(); const r = f.instances[0]; r.onstart();
  f.controller.stop(); f.controller.stop(); assert.equal(r.stopCalls, 1);
  r.onresult({results: [result("πωλήσεις χθες")]}); assert.equal(f.states.at(-1).status, "processing");
  r.onend(); assert.deepEqual(f.texts, ["πωλήσεις χθες"]);
});

test("cancel and context-dispose discard queued results and cannot overwrite the next question", () => {
  const f = fixture(); f.controller.start("πριν"); const r = f.instances[0], lateResult = r.onresult, lateEnd = r.onend;
  f.controller.cancel(); assert.equal(r.abortCalls, 1); f.controller.start("νέο");
  lateResult({results: [result("παλιό")]}); lateEnd(); assert.deepEqual(f.texts, []);
  const next = f.instances[1], nextEnd = next.onend; next.onresult({results: [result("τρέχον")]}); f.controller.dispose(); nextEnd();
  assert.deepEqual(f.texts, []); assert.equal(next.abortCalls, 1); assert.equal(f.controller.start(), false);
});

test("denied, unavailable, silent, network and Greek-language errors recover without any transcript", () => {
  for (const error of ["not-allowed", "audio-capture", "no-speech", "network", "language-not-supported"]) {
    const f = fixture(); f.controller.start(); const r = f.instances[0], lateEnd = r.onend;
    r.onresult({results: [result("μη αποδεκτό")]}); r.onerror({error}); lateEnd();
    assert.deepEqual(f.texts, []); assert.equal(f.states.at(-1).status, "idle"); assert.ok(f.states.at(-1).error);
    assert.equal(f.controller.start(), true);
  }
});

test("empty/interim-only results, timeout and overflow preserve the existing input", () => {
  const silent = fixture(); silent.controller.start("παλιό"); silent.instances[0].onresult({results: [result("προσωρινό", false)]}); silent.instances[0].onend();
  assert.deepEqual(silent.texts, []); assert.ok(silent.states.at(-1).error);
  const timed = fixture(); timed.controller.start(); const late = timed.instances[0].onend; [...timed.timers.values()][0](); late();
  assert.deepEqual(timed.texts, []); assert.equal(timed.instances[0].abortCalls, 1);
  const long = fixture({maxLength: 8}); long.controller.start("παλιό"); long.instances[0].onresult({results: [result("μεγάλο")]}); long.instances[0].onend();
  assert.deepEqual(long.texts, []); assert.match(long.states.at(-1).error, /8/);
});

test("unsupported and thrown start leave typing available and clean up the session", () => {
  const none = fixture({createRecognition: () => null}); assert.equal(none.controller.start(), false); assert.equal(none.states.at(-1).status, "idle");
  const thrown = fixture({createRecognition: () => ({start() { throw Error("device"); }, abort() {}})});
  assert.equal(thrown.controller.start(), false); assert.equal(thrown.timers.size, 0); assert.ok(thrown.states.at(-1).error);
});

test("usage distinguishes voice with real reported tokens; absent/invalid data never invents zero or prices", () => {
  const raw = {model: "configured-model", usage: {input_tokens: 11, output_tokens: 7, total_tokens: 18}, question: "private", key: "secret"};
  const usage = aiCommandUsage(raw, "voice"); assert.equal(usage.feature, "VOICE_ASSISTANT");
  assert.deepEqual(usage.tokens, {inputTokens: 11, outputTokens: 7, totalTokens: 18}); assert.equal(JSON.stringify(usage).includes("private"), false); assert.equal(JSON.stringify(usage).includes("secret"), false);
  assert.equal(aiCommandUsage({}, "text", "fallback").tokens, null);
  assert.deepEqual(aiCommandUsage({usage: {input_tokens: -1, output_tokens: "3", total_tokens: Infinity}}).tokens, {inputTokens: null, outputTokens: null, totalTokens: null});
});
