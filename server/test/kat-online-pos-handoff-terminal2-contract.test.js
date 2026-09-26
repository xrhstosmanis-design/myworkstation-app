import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const handoff=fs.readFileSync(new URL("../src/routes/kat-online-pos-handoff.js",import.meta.url),"utf8");
const routing=fs.readFileSync(new URL("../src/kat-terminal-routing.js",import.meta.url),"utf8");
const checkout=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const e2e=fs.readFileSync(new URL("../e2e/kat-online-ordering-flow.mjs",import.meta.url),"utf8");
const legacy=fs.readFileSync(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");

test("safe POS handoff enforces configured delayed terminal and its open shift",()=>{
  assert.match(handoff,/resolveKatOnlineRouting/);
  assert.match(handoff,/configuredKatDelayedTerminal/);
  assert.match(routing,/KAT_DELAYED_TERMINAL_POS/);
  assert.match(routing,/e\."role"='DELIVERY'/);
  assert.match(routing,/JOIN "StoreEftposDevice"/);
  assert.match(handoff,/KAT_DELAYED_SHIFT_NOT_OPEN/);
  assert.match(handoff,/"sessionId"=\$\{openShift\.id\}/);
  assert.match(handoff,/DELAYED/);
});

test("online checkout rejects a wrong terminal or missing device route before creating a sale",()=>{
  const routingCheck=checkout.indexOf("onlineRouting=resolveKatOnlineRouting");
  const routeRequired=checkout.indexOf("KAT_DELIVERY_EFTPOS_NOT_CONFIGURED");
  const saleInsert=checkout.indexOf('INSERT INTO "Sale"');
  const stockMutation=checkout.indexOf("const stockResult=await reserveSharedStock(tx");
  assert.ok(routingCheck>-1&&routingCheck<saleInsert);
  assert.ok(routeRequired>-1&&routeRequired<saleInsert);
  assert.ok(saleInsert>-1&&saleInsert<stockMutation);
});

test("real online ordering E2E declares its delayed fiscal and DELIVERY EFTPOS route",()=>{
  assert.match(e2e,/INSERT INTO "StoreFiscalDevice"/);
  assert.match(e2e,/INSERT INTO "StoreEftposDevice"/);
  assert.match(e2e,/'DELIVERY'/);
  assert.match(e2e,/operationChannel:"DELIVERY_DELAYED"/);
});

test("legacy DELIVERED commercial posting is identified as migration blocker",()=>{
  assert.match(legacy,/if\(body\.status==="DELIVERED"\)saleId=await postCommercialSale/);
  assert.match(legacy,/'NON_FISCAL'/);
});
