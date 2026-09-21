import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Invoice Learning draft save persists the workspace without waiting for profile sync",async()=>{
  const client=await fs.readFile(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
  const route=await fs.readFile(new URL("../src/routes/platform-invoice-learning-workspace.js",import.meta.url),"utf8");
  assert.match(client,/persistWorkspaceNow\\(\\{syncProfiles:false\\}\\)/);
  assert.match(client,/AbortSignal\\.timeout\\(30000\\)/);
  assert.match(route,/const syncProfiles=req\\.body\\?\\.syncProfiles!==false/);
  assert.match(route,/if\\(syncProfiles\\)await upsertSupplierProfiles/);
});
