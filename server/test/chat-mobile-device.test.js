import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {pushSubscriptionFailure} from "../../client/src/components/store/store-chat-push-diagnostic.mjs";
const source=fs.readFileSync(new URL("../../client/src/components/store/chat-mobile-push.mjs",import.meta.url),"utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
function harness({existing=null,attempts=[],permission="granted"}={}){
 let asked=0,subscribed=0,updates=0;const saved=[];
 const registration={update:async()=>{updates++},pushManager:{getSubscription:async()=>existing,subscribe:async options=>{assert.equal(options.userVisibleOnly,true);assert.deepEqual([...options.applicationServerKey],[1,2,3]);const result=attempts[subscribed++];if(result instanceof Error)throw result;return result}}};
 const Notification={permission,requestPermission:async()=>{asked++;return permission}};
 const activate=vm.runInNewContext(source+";activateMobileChatPush",{Notification,window:{Notification,PushManager:{}},navigator:{serviceWorker:{}},registerChatWorker:async()=>registration,atob,Uint8Array,Error,Promise,setTimeout:resolve=>resolve(),pushSubscriptionFailure});
 const api=async(path,options)=>{if(path.endsWith("/push-key"))return {publicKey:"AQID"};saved.push({path,body:JSON.parse(options.body)});return {ok:true}};
 return {activate:options=>activate(api,"/api/store-chat/mobile",options),counts:()=>({asked,subscribed,updates}),saved};
}
const subscription={toJSON:()=>({endpoint:"https://virtual.example/subscription"})};
test("mobile repeated activation shares one subscribe and one server binding",async()=>{
 const h=harness({attempts:[subscription]});const a=h.activate(),b=h.activate();assert.equal(a,b);assert.equal(await a,subscription);assert.deepEqual(h.counts(),{asked:1,subscribed:1,updates:0});assert.equal(h.saved.length,1);
});
test("mobile passive startup never subscribes or asks permission; explicit activation still works",async()=>{
 const h=harness({attempts:[subscription]});assert.equal(await h.activate({requestPermission:false}),null);assert.deepEqual(h.counts(),{asked:0,subscribed:0,updates:0});assert.equal(h.saved.length,0);assert.equal(await h.activate(),subscription);
});
test("mobile activation reuses consent and retries one browser failure without leaking provider text",async()=>{
 const failure=Object.assign(new Error("private endpoint/token"),{name:"AbortError"}),h=harness({attempts:[failure,subscription]});assert.equal(await h.activate(),subscription);assert.deepEqual(h.counts(),{asked:1,subscribed:2,updates:1});assert.equal(h.saved.length,1);
 const failed=harness({attempts:[failure,failure,subscription]});await assert.rejects(failed.activate(),e=>/PUSH_SUBSCRIBE \/ AbortError \/ AbortError/.test(e.message)&&!e.message.includes("private"));assert.equal(failed.saved.length,0);assert.equal(await failed.activate(),subscription);
});
test("mobile existing subscription is bound once; denied permission creates no binding",async()=>{
 const h=harness({existing:subscription});assert.equal(await h.activate(),subscription);assert.equal(h.counts().subscribed,0);assert.equal(h.saved.length,1);
 const denied=harness({permission:"denied"});await assert.rejects(denied.activate(),/δεν επιτρέπονται/);assert.equal(denied.saved.length,0);assert.equal(denied.counts().subscribed,0);
});
test("own active Chat worker is usable while an update waits",async()=>{
 const own={active:{state:"activated"},waiting:{state:"installed",addEventListener:()=>{throw new Error("Should not wait for an update")}}};
 const code=fs.readFileSync(new URL("../../client/src/components/store/chat-mobile-install.mjs",import.meta.url),"utf8").replace(/^export /gm,"");
 const register=vm.runInNewContext(code+";registerChatWorker",{navigator:{serviceWorker:{register:async()=>own}},location:{pathname:"/chat/"}});assert.equal(await register(),own);
});
