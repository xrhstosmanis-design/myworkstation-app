import test from "node:test";
import assert from "node:assert/strict";
import {validateCheckpointFiles} from "../../tools/verify-checkpoint-policy.mjs";

test("implementation changes require active list and a new checkpoint",()=>{
  const missing=validateCheckpointFiles(["server/src/index.js"]);
  assert.equal(missing.required,true);
  assert.equal(missing.ok,false);
  assert.equal(missing.errors.length,2);

  const complete=validateCheckpointFiles([
    "server/src/index.js",
    "CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md",
    "CHECKPOINTS/CHANGES/2026-09-06-example.md"
  ]);
  assert.equal(complete.ok,true);
});

test("documentation-only work does not demand a second checkpoint",()=>{
  assert.deepEqual(validateCheckpointFiles(["README.md","CHECKPOINTS/ACTIVE.md"]),{required:false,ok:true,errors:[]});
});
