import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const backoffice=await readFile(new URL("../src/routes/purchase-order-total-reconciliation-guard.js",import.meta.url),"utf8");

test("POS hands off invoice line differences up to five euros",()=>{
  assert.match(source,/const POS_HANDOFF_TOLERANCE=5/);
  assert.match(source,/if\(diff>POS_HANDOFF_TOLERANCE\)return res\.status\(409\)/);
  assert.match(source,/tolerance:POS_HANDOFF_TOLERANCE/);
});

test("BackOffice still keeps strict reconciliation before final stock posting",()=>{
  assert.match(backoffice,/const TOLERANCE=0\.05/);
  assert.match(backoffice,/if\(absDifference<=TOLERANCE\+0\.000001\)return next\(\)/);
});
