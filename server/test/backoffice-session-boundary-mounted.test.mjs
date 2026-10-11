import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const jwt=p=>`fixture.${Buffer.from(JSON.stringify(p)).toString("base64url")}.not-a-signature`;
const base={id:"fixture-owner",companyId:"company-A",sessionId:"session-A",sessionVersion:1,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,tokenType:"BACKOFFICE_USER",supportContext:{companyId:"company-A",storeId:"store-A",destination:"ALL"}};
const fixtureUser={id:"fixture-owner",role:"OWNER",fullName:"Fixture owner",isSuperAdmin:true,company:{id:"company-A",name:"Fixture company"}};

test("actual Backoffice and StoreCloudPage stop stale polling, retain renewal, and recover through explicit login",async t=>{
 for(const loginCompany of ["company-A","company-B"])await t.test(`fresh workspace after explicit ${loginCompany} login`,async()=>{
  const filename=fileURLToPath(new URL("../../client/src/main.jsx",import.meta.url));
  const source=fs.readFileSync(filename,"utf8").replace('createRoot(document.getElementById("root")).render(<App/>);','export {App};');
  const result=await build({stdin:{contents:source,resolveDir:path.dirname(filename),loader:"jsx"},bundle:true,write:false,platform:"node",format:"cjs",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},plugins:[{name:"isolated-child-panels",setup(b){b.onLoad({filter:/\.jsx$/},args=>{
    if(path.basename(args.path)==="StoreCloudPage.jsx")return;
    return {contents:'import React from "react";export default function Panel(){return <div data-fixture-panel="'+path.basename(args.path)+'"/>}',loader:"jsx"};
  })}}]});
  const mod={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/?supportPage=stores&supportStore=store-A"});
  const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","fetch","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
  let timerId=0,overviewStatus=200,loginStatus=401,holdLogin=false,releaseLogin;
  const timers=new Map(),calls=[];
  window.setInterval=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id};window.clearInterval=id=>timers.delete(id);
  const seed=()=>{localStorage.setItem("token",jwt(base));localStorage.setItem("user",JSON.stringify(fixtureUser));localStorage.setItem("supportContext",JSON.stringify(base.supportContext));sessionStorage.setItem("platformToken","fixture-platform")};
  seed();
  globalThis.fetch=async(url,options={})=>{
    const companyId=JSON.parse(Buffer.from(options.headers.Authorization.split(".")[1],"base64url")).companyId;
    calls.push({url,authorization:options.headers?.Authorization,method:options.method||"GET",companyId});
    const overview=url.includes("/overview?");
    let status=overview?overviewStatus:url==="/api/auth/login"?loginStatus:200;
    let data=url==="/api/stores"?(companyId==="company-B"?[{id:"store-B",name:"New company store"}]:[{id:"store-A",name:"Fixture store"}]):url==="/api/employees"||url==="/api/leaves"?[]:url==="/api/license/current"?{activeModules:[]}:url==="/api/auth/owner-companies"?{companies:[]}:overview?{devices:[]}:{};
    if(url==="/api/auth/login"&&status===200)data={token:jwt({...base,companyId:loginCompany,sessionId:"session-new",platformRole:"OWNER",isSuperAdmin:false,supportContext:undefined}),user:{...fixtureUser,isSuperAdmin:false,company:{id:loginCompany,name:`Fixture ${loginCompany}`}}};
    if(status!==200)data={error:"Fixture denial"};
    if(url==="/api/auth/login"&&holdLogin)await new Promise(resolve=>{releaseLogin=resolve});
    return {ok:status===200,status,json:async()=>data};
  };
  const click=async text=>act(async()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent===text);assert.ok(b,text);b.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true}))});
  const tick=async ms=>act(async()=>{for(const t of [...timers.values()])if(t.ms===ms)await t.fn()});
  try{
    await act(async()=>root.render(React.createElement(mod.exports.App)));
    assert.ok(document.querySelector(".store-operations-front"));
    assert.equal(timers.size,3);
    const count=calls.length;await tick(2000);assert.ok(calls.length>count);
    const renewed=jwt({...base,iat:20,exp:40,mustChangePassword:false});localStorage.setItem("token",renewed);
    await act(async()=>window.dispatchEvent(new dom.window.StorageEvent("storage",{key:"token"})));
    assert.ok(document.querySelector(".store-operations-front"));await tick(2000);
    assert.equal(calls.at(-1).authorization,`Bearer ${renewed}`);
    const oldTimers=[...timers.values()];
    localStorage.setItem("token",jwt({...base,companyId:"company-B",sessionId:"session-B"}));
    const preserved=localStorage.getItem("token");
    await act(async()=>window.dispatchEvent(new dom.window.StorageEvent("storage",{key:"token"})));
    assert.equal(document.querySelector(".store-operations-front"),null);assert.match(document.body.textContent,/Η προβολή Backoffice διακόπηκε/);assert.equal(timers.size,0);
    const stoppedCount=calls.length;await act(async()=>{for(const t of oldTimers)await t.fn()});assert.equal(calls.length,stoppedCount);assert.equal(localStorage.getItem("token"),preserved);

    await click("Νέα σύνδεση");
    assert.ok(document.querySelector("form.login-card"));
    await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(localStorage.getItem("token"),preserved);assert.ok(localStorage.getItem("supportContext"));
    loginStatus=200;holdLogin=true;
    await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
    const newer=jwt({...base,sessionId:"other-tab-session"});localStorage.setItem("token",newer);
    await act(async()=>releaseLogin());
    assert.equal(localStorage.getItem("token"),newer);assert.ok(localStorage.getItem("supportContext"));assert.match(document.body.textContent,/Η σύνδεση άλλαξε όσο περίμενες/);
    holdLogin=false;
    const recoveryStart=calls.length;
    await act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(localStorage.getItem("supportContext"),null);assert.equal(sessionStorage.getItem("platformToken"),null);
    assert.equal(document.querySelector(".store-operations-front"),null);assert.equal(timers.size,0);
    assert.match(document.body.textContent,new RegExp(`Fixture ${loginCompany}`));
    assert.deepEqual(calls.slice(recoveryStart).filter(x=>x.url.includes("/overview")),[]);
    await click("Καταστήματα");await click("Άνοιγμα καταστήματος");
    assert.ok(document.querySelector(".store-operations-front"));assert.equal(timers.size,3);
    const ownStore=loginCompany==="company-B"?"store-B":"store-A";
    const reopened=calls.slice(recoveryStart).filter(x=>x.url.includes("/overview"));
    assert.ok(reopened.length>0);assert.ok(reopened.every(x=>x.companyId===loginCompany&&x.url.includes(`/stores/${ownStore}/`)));
    overviewStatus=401;await tick(2000);
    assert.equal(document.querySelector(".store-operations-front"),null);assert.equal(timers.size,0);assert.match(document.body.textContent,/Η συνεδρία δεν είναι πλέον ενεργή/);
    assert.deepEqual(calls.filter(x=>x.method!=="GET").map(x=>x.url),["/api/auth/login","/api/auth/login","/api/auth/login"]);
  }finally{
    await act(async()=>root.unmount());dom.window.close();for(const k of keys){const desc=previous.get(k);if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k]}
  }
 });
});
