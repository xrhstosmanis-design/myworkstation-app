import assert from "node:assert/strict";
import test from "node:test";
import {queueOfflineCashSale,readOfflineSaleHistory,readOfflineSaleQueue,syncOfflineSales} from "../../client/src/offline-sale-queue.js";

const storage=()=>{const data=new Map();return{getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))}};
const request={paymentMethod:"CASH",items:[{productId:"coffee",quantity:1,unitPriceOverride:2,overrideReason:"OFFLINE_POS_LOCKED_PRICE"}]};

test("internet loss, application restart and reconnect preserve one transaction identity",async()=>{
  const local=storage(),id="11111111-1111-4111-8111-111111111111";
  queueOfflineCashSale("kat",{total:2,request},{storage:local,id,now:()=>new Date("2026-08-28T10:00:00Z")});
  assert.equal(readOfflineSaleQueue("kat",local)[0].request.clientTransactionId,id);
  let calls=0;
  const send=async body=>{calls+=1;assert.equal(body.clientTransactionId,id);return{saleId:"sale-1"}};
  const [first,concurrent]=await Promise.all([
    syncOfflineSales({storeId:"kat",storage:local,online:()=>true,send}),
    syncOfflineSales({storeId:"kat",storage:local,online:()=>true,send})
  ]);
  assert.equal(calls,1);
  assert.equal(first.synced+concurrent.synced,1);
  assert.equal(readOfflineSaleQueue("kat",local).length,0);
  assert.equal(readOfflineSaleHistory("kat",local)[0].state,"SYNCED");
});

test("failed reconnect remains durable and a later restart retries exactly once",async()=>{
  const local=storage(),id="22222222-2222-4222-8222-222222222222";
  queueOfflineCashSale("kat",{total:2,request},{storage:local,id});
  await syncOfflineSales({storeId:"kat",storage:local,online:()=>true,send:async()=>{throw new Error("Internet timeout")}});
  const failed=readOfflineSaleQueue("kat",local)[0];
  assert.equal(failed.state,"FAILED");assert.equal(failed.attempts,1);assert.match(failed.lastError,/timeout/);
  let calls=0;
  await syncOfflineSales({storeId:"kat",storage:local,online:()=>true,send:async body=>{calls+=1;assert.equal(body.clientTransactionId,id);return{saleId:"sale-2",idempotentReplay:true}}});
  assert.equal(calls,1);assert.equal(readOfflineSaleQueue("kat",local).length,0);
  const evidence=readOfflineSaleHistory("kat",local)[0];
  assert.equal(evidence.state,"SYNCED");assert.equal(evidence.attempts,2);assert.equal(evidence.idempotentReplay,true);
});

test("offline state never calls the server",async()=>{
  const local=storage();queueOfflineCashSale("kat",{total:2,request},{storage:local,id:"33333333-3333-4333-8333-333333333333"});
  let calls=0;const result=await syncOfflineSales({storeId:"kat",storage:local,online:()=>false,send:async()=>{calls+=1}});
  assert.equal(result.skipped,true);assert.equal(calls,0);assert.equal(readOfflineSaleQueue("kat",local).length,1);
});
