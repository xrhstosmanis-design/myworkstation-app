import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("actual BackOffice API retains authentication when transfer selects a terminal", async () => {
  const source = fs.readFileSync(new URL("../../client/src/main.jsx", import.meta.url), "utf8");
  const start = source.indexOf("const api=async(");
  const end = source.indexOf("\nfunction Login", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  let token = "isolated-owner-fixture";
  const api = vm.runInNewContext(source.slice(start, end) + "\napi", {
    localStorage: { getItem: () => token },
    fetch: async (path, options) => {
      calls.push({ path, options });
      const authenticated = options.headers.Authorization === "Bearer isolated-owner-fixture";
      return { ok: authenticated, json: async () => authenticated ? { ok: true } : { error: "Authentication required" } };
    }
  });
  const body = JSON.stringify({ direction: "IN", amount: 0.1, sessionId: "main-fixture" });
  const headers = { "x-mws-terminal-pos": "MAIN" };
  await api("/api/transactions/stores/fixture/cash-transfer", { method: "POST", headers, body });
  assert.equal(calls[0].options.headers.Authorization, "Bearer isolated-owner-fixture");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["x-mws-terminal-pos"], "MAIN");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, body);
  assert.deepEqual(headers, { "x-mws-terminal-pos": "MAIN" });
  await api("/api/transactions/stores/fixture/cash-transfer/context");
  assert.equal(calls[1].options.headers.Authorization, "Bearer isolated-owner-fixture");
  token = null;
  await assert.rejects(api("/api/transactions/stores/fixture/cash-transfer", { method: "POST", headers, body }), /Authentication required/);
  assert.equal(calls[2].options.headers.Authorization, undefined);
});
