import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {pushSubscriptionFailure} from "../../client/src/components/store/store-chat-push-diagnostic.mjs";
const panel=fs.readFileSync(new URL("../../client/src/components/store/StoreChatPanel.jsx",import.meta.url),"utf8");
const source=panel.match(/const pushKeyBytes=.*\nconst subscribeToPush=.*\n/)[0];
function harness({existing=null,attempts=[]}={}){
  let subscribed=0,updated=0,registered=0;
  const registration={update:async()=>{updated++},pushManager:{getSubscription:async()=>existing,subscribe:async options=>{
    assert.equal(options.userVisibleOnly,true);
    assert.deepEqual([...options.applicationServerKey],[1,2,3]);
    const result=attempts[subscribed++];if(result instanceof Error)throw result;return result;
  }}};
  const subscribe=vm.runInNewContext(source+";subscribeToPush",{navigator:{serviceWorker:{register:async path=>{assert.equal(path,"/sw.js");registered++},ready:Promise.resolve(registration)}},atob,Uint8Array,Error,Promise,setTimeout:resolve=>resolve(),pushSubscriptionFailure});
  return {subscribe,counts:()=>({subscribed,updated,registered})};
}
const failure=(name,message="provider-private-endpoint/token")=>Object.assign(new Error(message),{name});
test("existing subscription is reused without another subscribe",async()=>{
  const existing={id:"existing"},h=harness({existing});assert.equal(await h.subscribe("AQID"),existing);
  assert.deepEqual(h.counts(),{subscribed:0,updated:0,registered:1});
});
test("successful retry preserves subscription options and one worker update",async()=>{
  const result={id:"retry"},h=harness({attempts:[failure("AbortError"),result]});
  assert.equal(await h.subscribe("AQID"),result);assert.deepEqual(h.counts(),{subscribed:2,updated:1,registered:1});
});
test("final failure reports both browser error names without provider text",async()=>{
  const first=failure("AbortError"),last=failure("InvalidStateError"),h=harness({attempts:[first,last]});
  await assert.rejects(h.subscribe("AQID"),error=>{
    assert.match(error.message,/PUSH_SUBSCRIBE \/ AbortError \/ InvalidStateError/);
    assert.doesNotMatch(error.message,/provider-private|token|Chrome/);assert.equal(error.cause,last);return true;
  });assert.deepEqual(h.counts(),{subscribed:2,updated:1,registered:1});
});
test("unrecognized names and provider messages cannot leak into diagnostic",()=>{
  const text=pushSubscriptionFailure(failure("https://private/token"),failure("secret"));
  assert.match(text,/UnknownError \/ UnknownError/);assert.doesNotMatch(text,/private|secret|token/);
});
