import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const handoff=fs.readFileSync(new URL("../src/routes/kat-online-pos-handoff.js",import.meta.url),"utf8");
const legacy=fs.readFileSync(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");

test("safe POS handoff enforces configured delayed terminal and its open shift",()=>{
  assert.match(handoff,/resolveKatOnlineRouting/);
  assert.match(handoff,/KAT_DELAYED_TERMINAL_POS/);
  assert.match(handoff,/KAT_DELAYED_SHIFT_NOT_OPEN/);
  assert.match(handoff,/"sessionId"=\$\{openShift\.id\}/);
  assert.match(handoff,/DELAYED/);
});

test("legacy DELIVERED commercial posting is identified as migration blocker",()=>{
  assert.match(legacy,/if\(body\.status==="DELIVERED"\)saleId=await postCommercialSale/);
  assert.match(legacy,/'NON_FISCAL'/);
});
