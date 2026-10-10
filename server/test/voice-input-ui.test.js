import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

// Real Command Center and voice controls. Speech/API fixtures do not certify a physical microphone or LAB.
test("mounted voice input only submits reviewed text on the existing Ask action", async () => {
  const {build} = await import("esbuild"), {JSDOM} = await import("jsdom");
  const bundle = await build({
    stdin: {contents: 'export {default} from "./client/src/components/platform/AiCommandCenter.jsx";', resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "jsx"},
    bundle: true, write: false, format: "cjs", platform: "node", loader: {".css": "empty"},
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    plugins: [{name: "unrelated-credit-panel", setup(b) { b.onLoad({filter: /AiCreditAlert\.jsx$/}, () => ({contents: "export default function Panel(){return null}", loader: "jsx"})); }}]
  });
  const module = {exports: {}};
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const Center = module.exports.default, dom = new JSDOM('<div id="root"></div>', {url: "https://isolated.invalid/platform-admin"});
  const keys = ["window", "document", "navigator", "HTMLElement", "Event", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of keys) Object.defineProperty(globalThis, k, {configurable: true, writable: true, value: k === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[k]});
  const recordings = [], calls = [];
  class Recognition {
    constructor() { recordings.push(this); this.starts = 0; this.aborts = 0; }
    start() { this.starts++; }
    stop() { this.stops = (this.stops || 0) + 1; }
    abort() { this.aborts++; }
  }
  Object.defineProperty(window, "isSecureContext", {configurable: true, value: true});
  window.SpeechRecognition = Recognition;
  const request = async (url, options = {}) => {
    calls.push({url, ...options});
    if (options.method === "POST") { assert.equal(url, "/api/platform/ai-command-center/ask"); return {answer: "Fixture read-only answer", sources: [], highlights: []}; }
    if (url.includes("cash-control")) return {totals: {}, stores: []};
    if (url.includes("invoice-learning")) return {state: {documents: [], profiles: {}}};
    if (url.includes("installation-terminals") || url.includes("device-routing") || url.includes("video-connection")) return {};
    return {items: []};
  };
  const companies = [{id: "company-a", name: "Fixture company", active: true, stores: [{id: "store-a", name: "Store A", active: true}, {id: "store-b", name: "Store B", active: true}]}];
  const React = await import("react"), {createRoot} = await import("react-dom/client"), {act} = React;
  const root = createRoot(document.getElementById("root"));
  const click = async el => { assert.ok(el); await act(async () => el.dispatchEvent(new window.MouseEvent("click", {bubbles: true}))); };
  const mic = () => document.querySelector('.mws-voice-input-actions button');
  const textarea = () => document.querySelector('textarea[aria-label="Ερώτηση για το MyWorkStation"]');
  const submit = () => document.querySelector('form button[type="submit"]');
  const posts = () => calls.filter(c => c.method === "POST");
  const result = text => ({results: [Object.assign([{transcript: text}], {isFinal: true})]});
  try {
    await act(async () => root.render(React.createElement(Center, {request, companies})));
    assert.equal(recordings.length, 0); assert.equal(mic().type, "button"); assert.equal(posts().length, 0);
    await click(mic()); const first = recordings[0];
    assert.equal(first.starts, 1); assert.equal(first.lang, "el-GR"); assert.equal(textarea().disabled, true); assert.equal(submit().disabled, true);
    await act(async () => first.onstart());
    await act(async () => { first.onresult(result("Τι χρειάζεται έλεγχο σήμερα;")); first.onresult(result("Τι χρειάζεται έλεγχο σήμερα;")); });
    assert.equal(textarea().value, ""); assert.equal(posts().length, 0);
    await click(mic()); assert.equal(first.stops, 1); assert.equal(mic().disabled, true);
    await act(async () => first.onend());
    assert.equal(textarea().value, "Τι χρειάζεται έλεγχο σήμερα;"); assert.equal(textarea().disabled, false); assert.equal(posts().length, 0);
    await click(submit()); assert.equal(posts().length, 1);
    assert.equal(JSON.parse(posts()[0].body).inputChannel, "voice"); assert.equal(JSON.parse(posts()[0].body).question, textarea().value);
    await click(mic()); const denied = recordings.at(-1);
    await act(async () => denied.onerror({error: "not-allowed"}));
    assert.match(document.querySelector('[role="alert"]').textContent, /Δεν επιτράπηκε/); assert.equal(textarea().disabled, false); assert.equal(posts().length, 1);
    await click(mic()); const cancelled = recordings.at(-1), lateResult = cancelled.onresult, lateEnd = cancelled.onend;
    await click(document.querySelector('button[aria-label="Ακύρωση φωνητικής εισαγωγής"]'));
    await act(async () => { lateResult(result("Discarded")); lateEnd(); });
    assert.equal(cancelled.aborts, 1); assert.equal(textarea().value, "Τι χρειάζεται έλεγχο σήμερα;");
    await click(mic()); const changedStore = recordings.at(-1), oldResult = changedStore.onresult, oldEnd = changedStore.onend;
    await click([...document.querySelectorAll('.ai-full-twin-selector button')].find(el => el.textContent === "Store B"));
    await act(async () => { oldResult(result("Old store")); oldEnd(); });
    assert.equal(changedStore.aborts, 1); assert.equal(textarea().disabled, false); assert.equal(textarea().value, "Τι χρειάζεται έλεγχο σήμερα;");
    await click(mic()); const removed = recordings.at(-1), removedResult = removed.onresult, removedEnd = removed.onend;
    await act(async () => root.unmount());
    await act(async () => { removedResult(result("After close")); removedEnd(); });
    assert.equal(removed.aborts, 1); assert.equal(posts().length, 1);
    delete window.SpeechRecognition;
    const fallback = createRoot(document.getElementById("root"));
    await act(async () => fallback.render(React.createElement(Center, {request, companies})));
    assert.equal(mic().disabled, true); assert.equal(textarea().disabled, false);
    await click(document.querySelector('.ai-command-prompts button')); await click(submit());
    assert.equal(posts().length, 2); assert.equal(JSON.parse(posts()[1].body).inputChannel, "text");
    await act(async () => fallback.unmount());
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
