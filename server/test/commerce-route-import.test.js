import test from "node:test";
import assert from "node:assert/strict";

test("Commerce V1 route and tenant guard import successfully",async()=>{
  const route=await import("../src/routes/commerce-v1.js");
  const guard=await import("../src/middleware/commerce-tenant-guard.js");
  assert.ok(route.default);
  assert.equal(typeof guard.commerceTenantGuard,"function");
});
