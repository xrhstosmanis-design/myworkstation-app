import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("store chat foundation has store isolation, categories and server-side storage",()=>{
  const route=fs.readFileSync(new URL("../src/routes/store-chat.js",import.meta.url),"utf8");
  const panel=fs.readFileSync(new URL("../../client/src/components/store/StoreChatPanel.jsx",import.meta.url),"utf8");
  assert.match(route,/StoreChatMessage/);
  assert.match(route,/LEFT JOIN "StoreOperatorCredential"/);
  assert.match(route,/o\."displayName"/);
  assert.match(route,/m\."companyId"=\$\{store\.companyId\}/);
  assert.match(route,/AS "readByMe"/);
  assert.match(route,/ORDER BY "readByMe" ASC/);
  assert.match(route,/STORE_OPERATOR/);
  assert.match(route,/STORE_CHAT_MESSAGE_SENT/);
  assert.match(route,/STOCK_SHORTAGE/);
  assert.match(panel,/const openMessage=/);
  assert.match(panel,/row\.readByMe/);
  assert.match(panel,/ΝΕΟ/);
  assert.doesNotMatch(panel,/Promise\.allSettled\(nextRows\.map/);
});
