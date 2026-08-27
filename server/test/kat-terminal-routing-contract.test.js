import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const routing=fs.readFileSync(new URL("../src/kat-terminal-routing.js",import.meta.url),"utf8");
const onlineBootstrap=fs.readFileSync(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const storePos=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");

test("KAT delayed routing guard is fail-closed and terminal identity exists",()=>{
  assert.match(routing,/KAT_DELAYED_TERMINAL_NOT_CONFIGURED/);
  assert.match(routing,/KAT_ONLINE_WRONG_TERMINAL/);
  assert.match(storePos,/terminalPos/);
  assert.match(storePos,/requestTerminal/);
});

test("online ordering already enforces unique sale linkage",()=>{
  assert.match(onlineBootstrap,/OnlineOrder_sale_key/);
  assert.match(onlineBootstrap,/WHERE \"saleId\" IS NOT NULL/);
});
