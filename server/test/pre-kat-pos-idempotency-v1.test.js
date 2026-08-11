import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {buildSaleFingerprint} from "../src/pos-sale-safety.js";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const safetyPath="server/src/pos-sale-safety.js";
const posPath="server/src/routes/store-pos.js";
const clientPath="client/src/pos-checkout-safety.js";
const safety=read(safetyPath),pos=read(posPath),client=read(clientPath),entry=read("client/src/entry.jsx"),index=read("server/src/index.js");

test("sale safety server and client transport parse",()=>{
  execFileSync(process.execPath,["--check",path.join(repo,safetyPath)]);
  execFileSync(process.execPath,["--check",path.join(repo,posPath)]);
  execFileSync(process.execPath,["--check",path.join(repo,clientPath)]);
});

test("sale safety schema is guaranteed at startup",()=>{
  assert.match(safety,/ADD COLUMN IF NOT EXISTS "clientTransactionId" TEXT/);
  assert.match(safety,/ADD COLUMN IF NOT EXISTS "saleFingerprint" TEXT/);
  assert.match(safety,/ADD COLUMN IF NOT EXISTS "duplicateConfirmed" BOOLEAN/);
  assert.match(safety,/CREATE UNIQUE INDEX IF NOT EXISTS "Sale_store_client_tx_uq"/);
  assert.match(safety,/CREATE TABLE IF NOT EXISTS "PosSaleSafetyAudit"/);
  assert.match(index,/ensurePosSaleSafetySchema/);
  assert.match(index,/await ensurePosSaleSafetySchema\(\)/);
});

test("fingerprint is deterministic despite item/payment order",()=>{
  const a=buildSaleFingerprint({customerId:"c1",items:[{productId:"p2",quantity:1,lineTotal:3},{productId:"p1",quantity:2,lineTotal:4}],paymentMethod:"MIXED",payments:[{method:"CARD",amount:3},{method:"CASH",amount:4}],total:7});
  const b=buildSaleFingerprint({customerId:"c1",items:[{productId:"p1",quantity:2,lineTotal:4},{productId:"p2",quantity:1,lineTotal:3}],paymentMethod:"MIXED",payments:[{method:"CASH",amount:4},{method:"CARD",amount:3}],total:7});
  assert.equal(a,b);
  assert.equal(a.length,64);
});

test("checkout accepts transaction UUID and explicit duplicate confirmation only",()=>{
  assert.match(pos,/clientTransactionId:z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(pos,/confirmDuplicate:z\.coerce\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(pos,/buildSaleFingerprint/);
  assert.match(pos,/clientTransactionId=body\.clientTransactionId\|\|crypto\.randomUUID\(\)/);
});

test("checkout serializes same fingerprint before replay and duplicate checks",()=>{
  const lock=pos.indexOf("pg_advisory_xact_lock");
  const replay=pos.indexOf("findSaleByClientTransaction",lock);
  const similar=pos.indexOf("findRecentSimilarSale",replay);
  const insert=pos.indexOf('INSERT INTO "Sale"',similar);
  assert.ok(lock>=0&&replay>lock&&similar>replay&&insert>similar);
  assert.match(pos,/seconds:45/);
});

test("exact transaction retry replays instead of inserting another sale",()=>{
  assert.match(pos,/kind:"REPLAY"/);
  assert.match(pos,/eventType:"IDEMPOTENT_REPLAY"/);
  assert.match(pos,/idempotentReplay:true/);
  assert.match(safety,/WHERE "companyId"=\$\{companyId\} AND "storeId"=\$\{storeId\} AND "clientTransactionId"=\$\{clientTransactionId\}/);
});

test("similar sale is blocked unless operator explicitly confirms it",()=>{
  assert.match(pos,/recent&&!body\.confirmDuplicate/);
  assert.match(pos,/eventType:"DUPLICATE_BLOCKED"/);
  assert.match(pos,/code:"DUPLICATE_SIMILAR_SALE"/);
  assert.match(pos,/recent&&body\.confirmDuplicate/);
  assert.match(pos,/eventType:"DUPLICATE_CONFIRMED"/);
  assert.match(pos,/duplicateConfirmed/);
});

test("checkout transport reuses UUID for concurrent/retry requests and clears it after success",()=>{
  assert.match(client,/const pending=new Map\(\)/);
  assert.match(client,/stableKey/);
  assert.match(client,/clientTransactionId:entry\.id/);
  assert.match(client,/pending\.get\(key\)/);
  assert.match(client,/if\(response\.ok\)pending\.delete\(key\)/);
  assert.match(client,/TTL_MS=2\*60\*1000/);
});

test("duplicate warning requires explicit operator confirmation before retry",()=>{
  assert.match(client,/detail\?\.code==="DUPLICATE_SIMILAR_SALE"/);
  assert.match(client,/globalThis\.confirm/);
  assert.match(client,/send\(true\)/);
  assert.match(client,/confirmDuplicate:Boolean\(confirmDuplicate\)/);
});

test("checkout safety is installed once before POS traffic",()=>{
  assert.match(entry,/import \{installPosCheckoutSafety\} from "\.\/pos-checkout-safety\.js"/);
  assert.equal((entry.match(/installPosCheckoutSafety\(\);/g)||[]).length,1);
  assert.match(client,/__mwsPosCheckoutSafetyInstalled/);
});

test("sale remains explicitly non fiscal",()=>{
  assert.match(pos,/'NON_FISCAL'/);
  assert.doesNotMatch(pos,/fiscalStatus[^\n]*ISSUED|sendToAade|CapDriver|RBS/i);
});
