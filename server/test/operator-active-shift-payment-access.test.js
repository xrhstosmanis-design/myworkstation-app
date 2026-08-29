import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");

test("operator access exposes same-shift payment permission",()=>{
  assert.match(source,/sameShiftPayments:p\.sameShiftPayments!==false/);
});

test("payments modal refreshes operator access instead of retaining an old cache",async()=>{
  const ui=await readFile(new URL("../../client/src/components/store/StorePosPaymentsModal.jsx",import.meta.url),"utf8");
  assert.doesNotMatch(ui,/if\(!cachedAccess\(store\.id\)\)api/);
  assert.match(ui,/api\(`\/api\/store-pos\/stores\/\$\{store\.id\}\/access`\)/);
});
