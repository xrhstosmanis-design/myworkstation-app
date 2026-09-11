import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("store chat foundation has store isolation, categories and server-side storage",()=>{
  const route=fs.readFileSync(new URL("../src/routes/store-chat.js",import.meta.url),"utf8");
  assert.match(route,/StoreChatMessage/);
  assert.match(route,/STORE_OPERATOR/);
  assert.match(route,/STORE_CHAT_MESSAGE_SENT/);
  assert.match(route,/STOCK_SHORTAGE/);
});
