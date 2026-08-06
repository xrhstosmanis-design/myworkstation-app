import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const repoRoot=new URL("../../",import.meta.url);

test("owner security routes load without changing the platform auth router",async()=>{
  const module=await import("../src/routes/owner-security.js");
  assert.ok(module.default);
  const index=await fs.readFile(new URL("../src/index.js",import.meta.url),"utf8");
  assert.match(index,/app\.use\("\/api\/auth",ownerSecurityRoutes\);\s*app\.use\("\/api\/auth",authRoutes\);/);
});

test("owner 2FA remains optional until the owner starts setup",async()=>{
  const route=await fs.readFile(new URL("../src/routes/owner-security.js",import.meta.url),"utf8");
  assert.match(route,/if\(user\.totpEnabled\)/);
  assert.match(route,/const result=await issueOwnerSession\(user,req,body\.deviceName\)/);
  assert.match(route,/\/owner\/2fa\/setup/);
  assert.ok(!route.includes("setupRequired:true"));
});

test("owner MFA gate blocks Backoffice data until verification",async()=>{
  const client=await fs.readFile(new URL("client/src/owner-account-security.js",repoRoot),"utf8");
  assert.match(client,/user\?\.mfaRequired&&!allowed/);
  assert.match(client,/\/api\/auth\/owner\/2fa\/verify/);
  assert.match(client,/Ασφάλεια λογαριασμού/);
  assert.match(client,/Ενεργοποίηση 2FA/);
});
