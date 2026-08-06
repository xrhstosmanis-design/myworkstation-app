import test from "node:test";
import assert from "node:assert/strict";

test("platform license route loads with module validation",async()=>{
  const route=await import("../src/routes/platform-admin.js");
  assert.ok(route.default);
});
