import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {syncOfflineSales,queueOfflineCashSale} from "../../client/src/offline-sale-queue.js";

const read=path=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
const safety=read("server/src/pos-sale-safety.js"),pos=read("server/src/routes/store-pos.js"),cash=read("server/src/routes/cash-control.js"),ui=read("client/src/components/cloud/CashControlPanel.jsx");
const storage=()=>{const data=new Map();return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value))}};

test("offline evidence is one tenant/store scoped row per transaction and cannot downgrade SYNCED",()=>{
  assert.match(safety,/CREATE TABLE IF NOT EXISTS "OfflineSaleSyncEvidence"/);
  assert.match(safety,/UNIQUE\("storeId","clientTransactionId"\)/);
  assert.match(safety,/CASE WHEN "OfflineSaleSyncEvidence"\."status"='SYNCED' THEN 'SYNCED'/);
  assert.match(pos,/companyId:req\.user\.companyId,storeId:store\.id/);
  const evidenceSchema=safety.slice(safety.indexOf('CREATE TABLE IF NOT EXISTS "OfflineSaleSyncEvidence"'),safety.indexOf('CREATE INDEX IF NOT EXISTS "OfflineSaleSyncEvidence_store_status_idx"'));
  assert.doesNotMatch(evidenceSchema,/"(?:cardNumber|pan|cvv)"/i);
});

test("only the server checkout marks an offline transaction SYNCED and links its sale",()=>{
  assert.match(pos,/offlineOrigin=body\.paymentMethod==="CASH"/);
  assert.match(pos,/status:"SYNCED",saleId/);
  assert.match(pos,/idempotentReplay:true/);
  assert.match(pos,/z\.enum\(\["PENDING","FAILED"\]\)/);
});

test("BackOffice returns counts, sale links and replay alerts",()=>{
  assert.match(cash,/OfflineSaleSyncEvidence/);
  assert.match(cash,/offlineSync:\{counts:/);
  assert.match(ui,/data-offline-sync-evidence="true"/);
  assert.match(ui,/DUPLICATE\/REPLAY/);
  assert.match(ui,/row\.saleId/);
});

test("reconnect reports PENDING then FAILED without blocking a later exactly-once retry",async()=>{
  const local=storage(),events=[],id="44444444-4444-4444-8444-444444444444";
  queueOfflineCashSale("kat",{request:{paymentMethod:"CASH",items:[]}},{storage:local,id});
  await syncOfflineSales({storeId:"kat",storage:local,report:async event=>events.push(event),send:async()=>{throw Object.assign(new Error("timeout"),{code:"TIMEOUT"})}});
  assert.deepEqual(events.map(event=>event.status),["PENDING","FAILED"]);
  assert.equal(events[1].clientTransactionId,id);assert.equal(events[1].lastErrorCode,"TIMEOUT");
});
