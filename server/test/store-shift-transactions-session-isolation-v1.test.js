import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [modal,saleRoute]=await Promise.all([
  readFile(new URL("../../client/src/components/store/StoreShiftTransactionsModal.jsx",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8")
]);

test("Store Mode shift transactions use the exact active CashShiftSession id",()=>{
  assert.match(modal,/const sessionId=String\(open\.id\|\|""\)\.trim\(\)/);
  assert.match(modal,/String\(s\.sessionId\|\|""\)\.trim\(\)===sessionId/);
  assert.doesNotMatch(modal,/const openedAt=/);
  assert.doesNotMatch(modal,/createdAt\|\|s\.occurredAt\)\.getTime\(\)>=openedAt/);
});

test("recent POS sales expose their authoritative shift session id",()=>{
  assert.match(saleRoute,/AS "sessionId"/);
  assert.match(saleRoute,/st\."sessionId"/);
  assert.match(saleRoute,/COALESCE\(st\."description",''\) LIKE \('\%'\|\|s\."id"\|\|'\%'\)/);
});
