import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client=fs.readFileSync(new URL("../../client/src/invoice-learning-ai-bootstrap.js",import.meta.url),"utf8");

test("Invoice Learning preserves a complete result when a later stability read times out",()=>{
  assert.match(client,/if\(best\?\.completeness\?\.complete\)return \{\.\.\.best,stableRead:false,stabilityIncomplete:true/);
  assert.match(client,/if\(data\.stableRead\)return best/);
  assert.match(client,/ο επαναληπτικός έλεγχος καθυστέρησε/);
});

test("Invoice Learning does not fall back to an incomplete provider result",()=>{
  const guardedFallbacks=client.match(/if\(best\?\.completeness\?\.complete\)return \{\.\.\.best,stableRead:false,stabilityIncomplete:true/g)||[];
  assert.equal(guardedFallbacks.length,2);
});
