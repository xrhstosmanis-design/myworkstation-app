import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {nextOnlineOrdersPollAt,CLOSED_STORE_RETRY_MS} from "../../client/src/utils/online-orders-poll.mjs";
import {createRequestLatencyMonitor,monitoredLatencyRoute} from "../src/request-latency-monitor.js";

test("closed Online store slows only expected HTTP 503 polling",()=>{
  const at=1000;
  assert.equal(nextOnlineOrdersPollAt({status:503,message:"Το Online κατάστημα είναι προσωρινά κλειστό."},at),at+CLOSED_STORE_RETRY_MS);
  assert.equal(nextOnlineOrdersPollAt({status:403,message:"Οι Online Παραγγελίες δεν είναι ενεργές"},at),null);
  assert.equal(nextOnlineOrdersPollAt({status:503,message:"Service unavailable"},at),null);
  assert.equal(nextOnlineOrdersPollAt({status:500,message:"Internal"},at),null);
});

test("fixed latency labels never include store IDs or query strings",()=>{
  assert.equal(monitoredLatencyRoute("GET","/api/public/kat/pos/stores/private-id/orders?token=hidden"),"kat_orders_poll");
  assert.equal(monitoredLatencyRoute("POST","/api/ftext/v1/device/error-evidence-poll"),"ftext_device_poll");
  assert.equal(monitoredLatencyRoute("GET","/api/cloud/v1/stores/private-id/overview"),"cloud_store_overview");
  assert.equal(monitoredLatencyRoute("GET","/api/private/secret"),null);
});

test("aggregate timings, quantiles and error counts are emitted after the window",()=>{
  let clock=0,wall=0,called=0;
  const records=[];
  const middleware=createRequestLatencyMonitor({now:()=>clock,wallNow:()=>wall,emit:record=>records.push(record),windowMs:1000});
  const complete=(url,status,duration)=>{
    const response=new EventEmitter();response.statusCode=status;
    middleware({method:"GET",originalUrl:url},response,()=>called++);
    clock+=duration;
    response.emit("finish");
  };
  complete("/api/public/kat/pos/stores/private-id/orders?secret=1",503,55);
  assert.equal(records.length,0);
  wall=1001;
  complete("/api/health",200,3);
  assert.equal(called,2);
  assert.equal(records.length,1);
  assert.equal(records[0].route,"kat_orders_poll");
  assert.equal(records[0].count,1);
  assert.equal(records[0].status5xx,1);
  assert.equal(records[0].p95UpperMs,100);
  assert.equal(records[0].avgMs,55);
  assert.doesNotMatch(JSON.stringify(records),/private-id|secret=1/);
});

test("telemetry sink errors never interrupt API request flow",()=>{
  let clock=0,wall=0,nextCount=0;
  const middleware=createRequestLatencyMonitor({now:()=>clock,wallNow:()=>wall,emit:()=>{throw Error("logger unavailable")},windowMs:1000});
  const complete=()=>{
    const response=new EventEmitter();response.statusCode=200;
    middleware({method:"GET",originalUrl:"/api/health"},response,()=>nextCount++);
    clock+=5;
    assert.doesNotThrow(()=>response.emit("finish"));
  };
  complete();
  wall=1200;
  complete();
  assert.equal(nextCount,2);
});
