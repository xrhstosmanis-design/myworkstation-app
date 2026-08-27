import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const platformAdmin=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("Platform Admin no longer mounts the floating action-history launcher",()=>{
  assert.doesNotMatch(entry,/PlatformAuditCenter/);
});

test("Platform Admin opens Backoffice through scoped support access",()=>{
  assert.match(platformAdmin,/openPrimaryBackoffice/);
  assert.match(platformAdmin,/openCustomer\(company,store,"BACKOFFICE"\)/);
  assert.doesNotMatch(platformAdmin,/<a href="\/"[^>]*>.*Backoffice ΚΑΤ/s);
});
