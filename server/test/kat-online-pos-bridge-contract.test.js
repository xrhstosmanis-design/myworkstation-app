import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const bridge=fs.readFileSync(new URL("../../client/src/kat-online-pos-bridge.js",import.meta.url),"utf8");
test("KAT online bridge carries checkout identity and delivery fee",()=>{assert.match(bridge,/orderNumber/);assert.match(bridge,/deliveryFee/);assert.match(bridge,/productId/);assert.match(bridge,/mws:kat-online-checkout/)});
