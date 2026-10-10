import test from "node:test";
import assert from "node:assert/strict";

// Real parent and Command Center; other panels and every API are isolated fixtures.
// This does not exercise server permissions, business actions or a live store.
test("N40: mounted Command Center retains exact selection and fails closed on invalidation",async t=>{
  const {build}=await import("esbuild");
  const {JSDOM}=await import("jsdom");
  const {createRequire}=await import("node:module");
  const {fileURLToPath}=await import("node:url");
  const path=await import("node:path");
  const keep=new Set(["PlatformAdminApp.jsx","AiCommandCenter.jsx"]);
  const result=await build({
    stdin:{contents:'export {default} from "./client/src/components/platform/PlatformAdminApp.jsx";',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},
    bundle:true,write:false,format:"cjs",platform:"node",
    external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},
    plugins:[{name:"isolated-panels",setup(b){b.onLoad({filter:/\.jsx$/},args=>{
      const name=path.basename(args.path);if(keep.has(name))return;
      if(name==="PlatformSecureLogin.jsx")return {contents:'import React from "react";export default function Login(p){return <button data-fixture-login onClick={()=>p.onLogin({id:"fixture-next-user",fullName:"Fixture Next"})}>Fixture login</button>}',loader:"jsx"};
      return {contents:'import React from "react";export default function Panel(p){return <section data-fixture="'+name+'" data-store={p.store?.id||p.manager?.store?.id||""} data-company={p.company?.id||p.manager?.company?.id||""}>{p.onClose&&<button onClick={p.onClose}>Fixture close</button>}</section>}',loader:"jsx"};
    })}}]
  });
  const module={exports:{}};
  new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const App=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/platform-admin"});
  const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","fetch","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  localStorage.setItem("token","fixture-only");localStorage.setItem("platformUser",JSON.stringify({id:"fixture-user",fullName:"Fixture User"}));
  const company=(id,name,storeId,storeName)=>({id,name,active:true,plan:"BASIC",modules:[],stores:[{id:storeId,name:storeName,active:true}]});
  const a=company("company-a","Company A","store-a","Store A"),b=company("company-b","Company B","store-b","Store B");
  let companies=[a,b];const calls=[],unexpected=[];
  globalThis.fetch=async(url,options={})=>{
    const method=options.method||"GET",pathname=new URL(url,"https://isolated.invalid").pathname;
    calls.push({url,method});
    if(method!=="GET"&&!(pathname==="/api/auth/logout"&&method==="POST")){
      unexpected.push({url,method});throw new Error("Unexpected fixture write");
    }
    let data;
    if(pathname==="/api/platform/overview")data={companies,stats:{}};
    else if(pathname==="/api/platform/owners")data={owners:[]};
    else if(pathname==="/api/platform/backup-monitoring")data={configured:false};
    else if(pathname==="/api/platform/cash-control/daily")data={totals:{},stores:[],rows:[]};
    else if(pathname==="/api/transactions/supplier-settlements/review"||pathname==="/api/transactions/bank-ledger/review")data={items:[]};
    else if(pathname==="/api/platform/invoice-learning/workspace")data={state:{documents:[],profiles:{}}};
    else if(/^\/api\/platform\/companies\/[^/]+\/stores\/[^/]+\/(installation-terminals|device-routing|video-connection)$/.test(pathname))data={terminals:[],fiscalDevices:[],eftposDevices:[],cameras:[]};
    else if(pathname==="/api/auth/logout")data={ok:true};
    else {unexpected.push({url,method});throw new Error(`Unexpected fixture route ${pathname}`);}
    return {ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data};
  };
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  const root=createRoot(document.getElementById("root"));
  const click=async el=>{assert.ok(el,"Expected mounted control");await act(async()=>el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));};
  const open=()=>click(document.querySelector(".ai-command-launch"));
  const close=()=>click(document.querySelector(".ai-command-close"));
  const refresh=()=>click(document.querySelector('.ai-command-header-actions button:not(.ai-command-close)'));
  const select=name=>click([...document.querySelectorAll(".ai-full-twin-selector button")].find(el=>el.textContent===name));
  const selected=()=>document.querySelector(".ai-full-twin-selector button.active")?.textContent||null;
  const assertUnavailable=()=>{
    assert.equal(selected(),null);assert.equal(document.querySelector(".ai-full-twin-areas"),null);
    assert.ok(document.querySelector('[data-ai-twin-selection-unavailable="true"][role="alert"]'));
  };
  const area=name=>[...document.querySelectorAll(".ai-full-twin-areas button")].find(el=>el.querySelector("small")?.textContent===name);
  try{
    await act(async()=>root.render(React.createElement(App)));
    await open();
    await t.test("first displayed pair is latched before any explicit selection",async()=>{
      assert.equal(selected(),"Store A");assert.equal(document.querySelectorAll(".ai-full-twin-areas button").length,6);
      companies=[b,a];await refresh();assert.equal(selected(),"Store A");
      companies=[b];await refresh();assertUnavailable();
    });
    await t.test("explicit reselection recovers and survives normal close/reopen",async()=>{
      await select("Store B");assert.equal(selected(),"Store B");
      await close();assert.equal(document.querySelector(".ai-command-page"),null);
      companies=[a,b];
      await click(document.querySelector(".platform-action-utility button"));
      await open();assert.equal(selected(),"Store B");
    });
    await t.test("a reused store id under a different company cannot inherit selection",async()=>{
      companies=[a,{...b,id:"company-other"}];await refresh();assertUnavailable();
      await select("Store B");assert.equal(selected(),"Store B");
      companies=[a,b];await refresh();assertUnavailable();
      await select("Store B");
    });
    await t.test("remembered selection remains invalid across unmounts until explicit choice",async()=>{
      companies=[a];await refresh();assertUnavailable();
      await close();await open();assertUnavailable();
      await select("Store A");assert.equal(selected(),"Store A");
      companies=[a,b];await refresh();await select("Store B");
    });
    await t.test("ordinary existing workforce close and manual return retain the same pair",async()=>{
      await click(area("Προσωπικό"));
      const panel=document.querySelector('[data-fixture="SuperAdminStaffScheduler.jsx"]');
      assert.equal(panel?.dataset.company,"company-b");assert.equal(panel?.dataset.store,"store-b");
      assert.equal(document.querySelector(".ai-command-page"),null);
      await click(panel.querySelector("button"));await open();assert.equal(selected(),"Store B");
    });
    await t.test("existing video entry keeps the pair and manual return selection",async()=>{
      const before=calls.length;await click(area("Κάμερες"));
      assert.ok(calls.slice(before).some(call=>call.url==="/api/platform/companies/company-b/stores/store-b/video-connection"));
      const panel=document.querySelector('[data-fixture="VideoConnectionManager.jsx"]');
      assert.equal(panel?.dataset.company,"company-b");assert.equal(panel?.dataset.store,"store-b");
      await click(panel.querySelector("button"));await open();assert.equal(selected(),"Store B");
    });
    await t.test("empty refreshed overview exposes no action tiles or silent store",async()=>{
      companies=[];await refresh();assertUnavailable();
      assert.equal(document.querySelectorAll(".ai-full-twin-selector button").length,0);
      companies=[a];await refresh();assertUnavailable();
      await select("Store A");
    });
    await t.test("session clearing does not carry a remembered pair to another login",async()=>{
      companies=[a,b];await refresh();await select("Store B");await close();
      const logout=[...document.querySelectorAll(".platform-user button")].find(el=>el.textContent==="Έξοδος");
      await click(logout);assert.ok(document.querySelector("[data-fixture-login]"));
      await click(document.querySelector("[data-fixture-login]"));await open();assert.equal(selected(),"Store A");
    });
    assert.deepEqual(unexpected,[],"No unrecognized reads or business writes in isolated navigation tests");
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
