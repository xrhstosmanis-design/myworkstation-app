import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

test("Platform Admin no longer mounts the floating action-history launcher",()=>{
  assert.doesNotMatch(entry,/PlatformAuditCenter/);
});
