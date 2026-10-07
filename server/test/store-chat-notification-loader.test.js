import test from "node:test";
import assert from "node:assert/strict";
import {loadNotificationChatStore} from "../../client/src/components/store/store-chat-notification-loader.mjs";
test("notification uses the existing scoped messages API and authoritative store",async()=>{
  const paths=[],store={id:"LAB",name:"LAB"};
  assert.equal(await loadNotificationChatStore(async path=>{paths.push(path);return {store}},"LAB"),store);
  assert.deepEqual(paths,["/api/store-chat/stores/LAB/messages"]);
});
test("authentication or tenant denial is propagated without another-store fallback",async()=>{
  const denied=new Error("403"),paths=[];
  await assert.rejects(loadNotificationChatStore(async path=>{paths.push(path);throw denied},"LAB"),error=>error===denied);
  assert.equal(paths.length,1);
});
test("wrong or absent store response cannot open Chat",async()=>{
  for(const result of [{store:{id:"OTHER"}},{}])await assert.rejects(loadNotificationChatStore(async()=>result,"LAB"));
});
test("empty target makes no request and path characters stay encoded",async()=>{
  let calls=0;await assert.rejects(loadNotificationChatStore(async()=>{calls++},""));assert.equal(calls,0);
  const paths=[];await loadNotificationChatStore(async path=>{paths.push(path);return {store:{id:"A/B"}}},"A/B");
  assert.deepEqual(paths,["/api/store-chat/stores/A%2FB/messages"]);
});
