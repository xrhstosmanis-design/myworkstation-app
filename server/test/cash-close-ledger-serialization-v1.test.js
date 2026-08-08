import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const cash=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ledger=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const closeStart=cash.indexOf('router.post("/sessions/:sessionId/close"');
const closeRoute=cash.slice(closeStart);

test("cash close locks the open shift before reading its authoritative ledger",()=>{
  assert.match(closeRoute,/prisma\.\$transaction\(async tx=>/);
  assert.match(closeRoute,/SELECT s\.\*[\s\S]*FOR UPDATE OF s/);
  const lock=closeRoute.indexOf("FOR UPDATE OF s");
  const totals=closeRoute.indexOf("authoritativeShiftTotals(tx");
  const update=closeRoute.indexOf('UPDATE "CashShiftSession"');
  assert.ok(lock>=0&&totals>lock&&update>totals);
});

test("transaction creation takes a key-share lock on the same open shift",()=>{
  const createStart=ledger.indexOf('router.post("/stores/:storeId"');
  const createEnd=ledger.indexOf('router.get("/:transactionId/attachment"',createStart);
  const createRoute=ledger.slice(createStart,createEnd);
  assert.match(createRoute,/FROM "CashShiftSession" shift[\s\S]*shift\."status"='OPEN'[\s\S]*FOR KEY SHARE OF shift[\s\S]*RETURNING \*/);
});

test("email remains outside the database transaction and only follows a committed close",()=>{
  const transactionEnd=closeRoute.indexOf("});",closeRoute.indexOf("prisma.$transaction"));
  const conflict=closeRoute.indexOf("if(!closeResult)");
  const email=closeRoute.indexOf("sendCashShiftClosedEmail");
  assert.ok(transactionEnd>=0&&conflict>transactionEnd&&email>conflict);
});
