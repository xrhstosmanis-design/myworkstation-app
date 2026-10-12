
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {transformSync} from "esbuild";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
test("mounted owner app lists authorized stores, changes company and notification target without opening POS",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://virtual.example/chat/"}),previous={};
 for(const key of ["window","document","navigator","location","history"]){previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const messages=new dom.window.EventTarget();Object.defineProperty(navigator,"serviceWorker",{value:messages,configurable:true});
 let session={token:"virtual",user:{id:"owner",company:{id:"C1"}}},draft=false;const paths=[];
 const stores=[{id:"A",name:"First",companyId:"C1"},{id:"B",name:"Second",companyId:"C2"}];
 const api=async(path,options)=>{paths.push(path);if(path==="/api/store-chat/mobile/stores")return {stores,canSwitchCompany:true};if(path==="/api/auth/owner-companies/select")return {token:"selected",user:{id:"owner",company:{id:JSON.parse(options.body).companyId}}};if(path.endsWith("/messages"))return {store:stores.find(s=>path.includes("/"+s.id+"/"))};throw new Error(path)};
 const panel=props=>React.createElement("section",null,React.createElement("h2",null,props.store.name),React.createElement("button",{onClick:()=>{draft=true;props.onDraftChange(true)}},"Draft"),React.createElement("button",{onClick:props.onClose},"Stores"));
 const deps={"react":React,"./StoreChatPanel.jsx":{__esModule:true,default:panel},"./ChatMobileLogin.jsx":{__esModule:true,default:()=>null},"./ChatOperatorLogin.jsx":{__esModule:true,default:()=>null},"./ChatInstallControls.jsx":{__esModule:true,default:()=>null},"./store-chat-notification-loader.mjs":{loadNotificationChatStore:async(fn,id)=>(await fn("/api/store-chat/stores/"+id+"/messages")).store},"./chat-mobile-session.mjs":{chatApi:api,chatSession:()=>session,chatToken:()=>session.token,saveChatSession:data=>{session=data},clearChatSession:()=>{session=null}},"./chat-mobile-install.mjs":{mobileChatUrl:id=>"/chat/"+(id?id+"/":""),registerChatWorker:async()=>({})},"./chat-mobile-app.css":{}};
 const source=fs.readFileSync(new URL("../../client/src/components/store/StoreChatNotificationPage.jsx",import.meta.url),"utf8"),compiled=transformSync(source,{loader:"jsx",format:"cjs"}).code,module={exports:{}};
 new Function("require","module","exports",compiled)(name=>deps[name]||createRequire(import.meta.url)(name),module,module.exports);
 const root=createRoot(document.getElementById("root")),flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,5))});
 try{
  await act(async()=>root.render(React.createElement(module.exports.default)));await flush();assert.match(document.body.textContent,/Τα καταστήματά μου/);assert.match(document.body.textContent,/First/);assert.match(document.body.textContent,/Second/);
  const second=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Second"));await act(async()=>second.click());await flush();assert.equal(location.pathname,"/chat/B/");assert.match(document.querySelector("h2").textContent,/Second/);assert.ok(paths.includes("/api/auth/owner-companies/select"));assert.ok(paths.includes("/api/store-chat/stores/B/messages"));assert.equal(session.user.company.id,"C2");
  await act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Draft").click());assert.equal(draft,true);let confirmed=0;window.confirm=()=>{confirmed++;return false};
  await act(async()=>messages.dispatchEvent(new dom.window.MessageEvent("message",{data:{type:"STORE_CHAT_OPEN",storeId:"B"}})));await flush();assert.equal(confirmed,0);assert.equal(document.querySelector("h2").textContent,"Second");
  await act(async()=>messages.dispatchEvent(new dom.window.MessageEvent("message",{data:{type:"STORE_CHAT_OPEN",storeId:"A"}})));assert.equal(confirmed,1);assert.equal(location.pathname,"/chat/B/");
  window.confirm=()=>true;await act(async()=>messages.dispatchEvent(new dom.window.MessageEvent("message",{data:{type:"STORE_CHAT_OPEN",storeId:"A"}})));await flush();assert.equal(location.pathname,"/chat/A/");assert.equal(document.querySelector("h2").textContent,"First");assert.ok(!paths.some(p=>/sales|shift|terminal/.test(p)));
  await act(async()=>messages.dispatchEvent(new dom.window.MessageEvent("message",{data:{type:"STORE_CHAT_OPEN",storeId:"A"}})));await flush();assert.equal(document.querySelector("h2").textContent,"First");assert.equal(location.pathname,"/chat/A/");
 }finally{await act(async()=>root.unmount());dom.window.close();for(const key of Object.keys(previous)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key]}delete globalThis.IS_REACT_ACT_ENVIRONMENT}
});
