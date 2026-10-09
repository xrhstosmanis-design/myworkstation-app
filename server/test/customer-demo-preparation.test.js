import test from "node:test";
import assert from "node:assert/strict";
import { blockPreparedDemoMutation } from "../src/middleware/customer-demo-preparation.js";
import { demoView, demoPreparationEnabled } from "../src/services/customer-demo-preparation.js";
const companyId = "customer-demo-11111111-1111-4111-8111-111111111111";
const storeId = "customer-demo-store-11111111-1111-4111-8111-111111111111";
function guard(originalUrl, body = {}, method = "POST", query = {}) {
  let result = "next";
  const res = { status(code) { result = code; return this; }, json() { return this; } };
  blockPreparedDemoMutation({ originalUrl, body, method, query }, res, () => {});
  return result;
}
test("reserved demo preparations cannot be activated, impersonated or configured through general SA paths", () => {
  for (const path of [`/api/platform/companies/${companyId}`, `/api/platform/companies/${companyId}/license`, `/api/platform/companies/${companyId}/stores/${storeId}/rbs-installation`, `/api/platform/companies/${companyId}/impersonate`]) assert.equal(guard(path, { active: true }), 409);
  assert.equal(guard(`/api/platform/companies/%63ustomer-demo-11111111-1111-4111-8111-111111111111`), 409);
  assert.equal(guard("/api/platform/store-modules", { nested: [{ storeId }] }), 409);
  assert.equal(guard("/api/platform/store-modules", {}, "POST", { storeId }), 409);
  assert.equal(guard("/api/platform/companies/ordinary-company", { active: true }), "next");
  assert.equal(guard("/api/platform/customer-demos/11111111-1111-4111-8111-111111111111/revoke"), "next");
});
test("read-only ordinary and prepared contexts keep existing behavior; malformed paths are rejected", () => {
  assert.equal(guard(`/api/platform/companies/${companyId}`, {}, "GET"), "next");
  assert.equal(guard("/api/platform/companies/%xx"), 400);
});
test("expiry and revocation always produce non-installable views without credentials", () => {
  const row = { id: "demo", companyId, storeId, displayName: "Demo", status: "PREPARED", createdAt: new Date("2026-10-09"), expiresAt: new Date("2026-10-10"), revokedAt: null, requestKey: "hidden", createdBy: "hidden" };
  assert.equal(demoView(row, new Date("2026-10-09")).status, "PREPARED");
  assert.equal(demoView(row, new Date("2026-10-10")).status, "EXPIRED");
  assert.equal(demoView({ ...row, status: "REVOKED" }, new Date("2026-10-11")).status, "REVOKED");
  assert.equal(demoView({ ...row, status: "ACTIVE" }).status, "INVALID");
  assert.equal(demoView(row).installable, false);
  assert.equal("requestKey" in demoView(row), false);
  assert.equal("createdBy" in demoView(row), false);
});
test("preparation feature is default-off and requires an exact server flag", () => {
  const saved = process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED;
  try {
    for (const value of [undefined, "false", "1", "TRUE"]) { if (value === undefined) delete process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED; else process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED = value; assert.equal(demoPreparationEnabled(), false); }
    process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED = "true"; assert.equal(demoPreparationEnabled(), true);
  } finally { if (saved === undefined) delete process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED; else process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED = saved; }
});
