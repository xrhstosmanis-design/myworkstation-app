import {assertCustomerDemoOutboundAllowed} from "../src/customer-demo-runtime.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {isApplePushEndpoint} from "../src/store-chat-push-policy.js";

test("Apple notification policy accepts only HTTPS Apple push hosts",()=>{
  for(const endpoint of ["https://web.push.apple.com/id","https://push.apple.com/id","https://region.web.push.apple.com/id"])assert.equal(isApplePushEndpoint(endpoint),true);
  for(const endpoint of ["https://push.apple.com.evil.example/id","https://evilpush.apple.com/id","http://web.push.apple.com/id","https://fcm.googleapis.com/id","invalid"])assert.equal(isApplePushEndpoint(endpoint),false);
});
test("actual sender marks each provider separately and preserves tenant/sender bindings",async()=>{
  const rows=[{endpoint:"https://web.push.apple.com/id",subscriptionJson:{endpoint:"https://web.push.apple.com/id"}},{endpoint:"https://fcm.googleapis.com/id",subscriptionJson:{endpoint:"https://fcm.googleapis.com/id"}}],sent=[];
  const code=fs.readFileSync(new URL("../src/store-chat-push.js",import.meta.url),"utf8").split("export async function sendStoreChatPush")[1];
  const fn=vm.runInNewContext("async function sendStoreChatPush"+code+";sendStoreChatPush",{
    vapidKeys:async()=>{},isApplePushEndpoint,assertCustomerDemoOutboundAllowed,
    prisma:{$queryRaw:async(strings,...values)=>{assert.deepEqual(values,["company","B","sender"]);return rows}},
    webpush:{sendNotification:async(subscription,payload,options)=>sent.push({subscription,data:JSON.parse(payload),options})}
  });
  const result=await fn({store:{companyId:"company",id:"B",name:"LAB"},senderId:"sender"});
  assert.equal(result.attempted,2);assert.equal(result.delivered,2);
  assert.equal(sent[0].data.requiresSystemNotification,true);assert.equal(sent[1].data.requiresSystemNotification,false);
  assert.equal(sent[0].data.storeId,"B");assert.equal(sent[0].options.TTL,300);assert.equal(sent[0].data.message,undefined);
});
const worker=fs.readFileSync(new URL("../../client/public/sw.js",import.meta.url),"utf8");
async function deliver(required,visibilityState="visible"){
  let handler,work,notifications=0,posts=0;
  const clients={matchAll:async()=>[{url:"https://lab.example/store/B",visibilityState,postMessage(){posts++}}]};
  const self={location:{origin:"https://lab.example"},registration:{showNotification:async()=>{notifications++}},addEventListener(type,fn){if(type==="push")handler=fn}};
  vm.runInNewContext(worker,{self,clients,URL});
  handler({data:{json:()=>({storeId:"B",url:"/",requiresSystemNotification:required})},waitUntil(p){work=p}});
  await work;return {notifications,posts};
}
test("Apple foreground push fulfills userVisibleOnly through Notifications API",async()=>{
  assert.deepEqual(await deliver(true),{notifications:1,posts:0});
});
test("other providers preserve the existing foreground in-app alert",async()=>{
  assert.deepEqual(await deliver(false),{notifications:0,posts:1});
});
test("Apple and other providers both show background notifications",async()=>{
  assert.deepEqual(await deliver(true,"hidden"),{notifications:1,posts:0});
  assert.deepEqual(await deliver(false,"hidden"),{notifications:1,posts:0});
});
