import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const repoRoot=new URL("../../",import.meta.url);

test("secure owner provisioning and password routes load",async()=>{
  const [authRoute,ownerSecurity,authMiddleware]=await Promise.all([
    import("../src/routes/auth.js"),
    import("../src/routes/platform-owner-security.js"),
    import("../src/middleware/auth.js")
  ]);
  assert.ok(authRoute.default);
  assert.ok(ownerSecurity.default);
  assert.equal(typeof authMiddleware.auth,"function");
});

test("database and client include mandatory password change state",async()=>{
  const schema=await fs.readFile(new URL("prisma/schema.prisma",new URL("../",import.meta.url)),"utf8");
  const clientGate=await fs.readFile(new URL("../client/src/owner-password-change.js",repoRoot),"utf8");
  assert.match(schema,/mustChangePassword\s+Boolean\s+@default\(true\)/);
  assert.match(clientGate,/\/api\/auth\/change-password/);
  assert.match(clientGate,/τουλάχιστον 10 χαρακτήρες/);
});
