import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createBackofficeSessionBoundary,readBackofficeContext,watchBackofficeContext} from "../../client/src/utils/backofficeSessionBoundary.mjs";

// Actual selected-store page, entry, both React roots, CommerceHub, InvoiceInboxPanel,
// four native installer modules and exact entry.jsx guards. Unrelated child features
// and the wholesale in-flight signal are fixtures; transport is isolated, never hosted.
// The unrelated PDF renderer is an explicit throw-on-call fixture; no worker is run.
test("selected-store direct invoice entry retains native view and boundaries",async t=>{
  const keep=new Set(["StoreCloudPage.jsx","StoreInvoiceEntry.jsx","CommerceHub.jsx","InvoiceInboxPanel.jsx","CommerceLauncher.jsx"]);
  // Execute the unmodified production installer functions and their exact
  // four document-wide guards from entry.jsx. Unrelated bootstrap is omitted.
  const bootstrap=readFileSync(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
  const guards=["installPurchaseOrdersSafely","installSupplierControlSafely","installCustomerControlSafely","installPriceCatalogSafely"].map(name=>{const line=bootstrap.split("\n").find(line=>line.startsWith(`const ${name}=`));assert.ok(line,name);return line}).join("\n");
  const suites=["installPurchaseOrdersSuite","installSupplierControlSuite","installCustomerControlSuiteV2","installPriceCatalogSuite"];
  const fixtureEntry=`export {default} from "./components/cloud/StoreCloudPage.jsx";\nexport {default as Launcher} from "./components/commerce/CommerceLauncher.jsx";\n${suites.map(name=>`import {${name}} from "./components/commerce/${name}.js";`).join("\n")}\nexport function installNativeIntegrations(){${guards}\nconst install=()=>{installPurchaseOrdersSafely();installSupplierControlSafely();installCustomerControlSafely();installPriceCatalogSafely()};install();const observer=new MutationObserver(install);observer.observe(document.documentElement,{childList:true,subtree:true});return()=>observer.disconnect()}`;
  const result=await build({stdin:{contents:fixtureEntry,resolveDir:fileURLToPath(new URL("../../client/src",import.meta.url)),sourcefile:"isolated-native-entry.js",loader:"js"},bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},plugins:[{name:"unrelated-children-only",setup(b){b.onLoad({filter:/invoice-assistant-pdf-viewer\.js$/},()=>({contents:'export async function mountInvoicePdfViewer(){globalThis.__task3PdfViewerCalls=(globalThis.__task3PdfViewerCalls||0)+1;throw new Error("PDF rendering is forbidden in this isolated navigation test")}',loader:"js"}));b.onLoad({filter:/\.jsx$/},args=>{
    const name=path.basename(args.path);if(keep.has(name))return;
    if(name==="WholesaleSuiteWorkspace.jsx")return {contents:'import React from "react";export const readWholesaleIdentity=()=>({userId:"owner",companyId:"company",role:"OWNER"});export const wholesaleIdentityKey=()=>"isolated-owner";export const wholesaleAccessEnabled=access=>access?.enabled===true;export default function Panel({onSubmissionLockChange}){return <><input data-fixture="WholesaleSuiteWorkspace.jsx"/><button onClick={()=>onSubmissionLockChange(true)}>Lock isolated wholesale fixture</button></>}',loader:"jsx"};
    return {contents:'import React from "react";export default function Panel(){return <input data-fixture="'+name+'" defaultValue=""/>}',loader:"jsx"};
  })}}]});
  const dom=new JSDOM('<div id="root"></div><div id="commerce-root"></div>',{url:"https://isolated.invalid/?supportPage=stores&supportStore=B"});
  const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","IS_REACT_ACT_ENVIRONMENT","setInterval","clearInterval","fetch","__task3PdfViewerCalls"];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let id=0;const timers=new Map(),interval=(fn,ms)=>{timers.set(++id,{fn,ms});return id},clear=id=>timers.delete(id);
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:k==="setInterval"?interval:k==="clearInterval"?clear:dom.window[k]});
  window.setInterval=interval;window.clearInterval=clear;
  const observers=new Set(),OriginalObserver=dom.window.MutationObserver;
  dom.window.MutationObserver=class extends OriginalObserver{constructor(callback){super(callback);observers.add(this)}};
  Object.defineProperty(globalThis,"MutationObserver",{configurable:true,get:()=>dom.window.MutationObserver,set:value=>{dom.window.MutationObserver=value}});
  const mod={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),launcherRoot=createRoot(document.getElementById("commerce-root"));
  const stores=[{id:"A",name:"Store A",active:true},{id:"B",name:"Store B",active:true}];
  const calls=[];let rows=stores,modules=["DOCUMENTS"],responses=[],licenseResponses=[],denied=null,boundary,stopWatch=()=>{};
  const token=session=>`fixture.${Buffer.from(JSON.stringify({id:"owner",companyId:"company",sessionId:session,tokenType:"BACKOFFICE_USER",role:"OWNER"})).toString("base64url")}.fixture`;
  const raw=async(url,options={})=>{
    calls.push({url,method:options.method||"GET"});
    assert.equal(options.method||"GET","GET","opening/refreshing must not write");
    assert.ok(url.startsWith("/api/"),"no outbound provider request");
    if(url==="/api/stores"){if(denied)throw Object.assign(new Error("Fixture denied"),{status:denied});return responses.length?await responses.shift():rows;}
    if(url==="/api/wholesale/capabilities")return {enabled:true};
    if(url==="/api/license/current")return licenseResponses.length?await licenseResponses.shift():{activeModules:modules,modules:[]};
    if(url.includes("/documents/inbox/archive?"))return {items:[],total:0,archiveTotal:0,suppliers:[]};
    if(url.includes("/documents/mydata/status?"))return {enabled:true,labLocked:true,serverAutomatic:true};
    if(url.includes("/overview?"))return {devices:[],recent:[],summary:{}};
    throw new Error(`Unexpected request ${url}`);
  };
  globalThis.fetch=async(url,options={})=>{const data=await raw(url,options);return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)}};
  const stopNative=mod.exports.installNativeIntegrations();
  const render=async(storeId="B",extra={})=>act(async()=>root.render(React.createElement(mod.exports.default,{api:boundary.request,store:{id:storeId,name:`Store ${storeId}`},onBack:()=>{},...extra})));
  const reset=async()=>{
    stopWatch();await act(async()=>{root.render(null);launcherRoot.render(null)});rows=stores;modules=["DOCUMENTS"];responses=[];licenseResponses=[];denied=null;
    localStorage.clear();localStorage.setItem("token",token("session-A"));localStorage.setItem("user",JSON.stringify({id:"owner",companyId:"company",role:"OWNER"}));localStorage.setItem("activeModules",JSON.stringify(["DOCUMENTS"]));
    const next=createBackofficeSessionBoundary({readContext:()=>readBackofficeContext(localStorage),request:raw,isCurrent:()=>boundary===next,onInvalidated:()=>root.render(React.createElement("p",{"data-session-blocked":"true"},"Session stopped"))});boundary=next;stopWatch=watchBackofficeContext(boundary,window,document);
    await act(async()=>launcherRoot.render(React.createElement(mod.exports.Launcher)));
  };
  const button=text=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===text);
  const click=async text=>act(async()=>{const b=button(text);assert.ok(b,text);b.click()});
  const open=()=>click("Θυρίδα τιμολογίων καταστήματος");
  const close=()=>click("Κλείσιμο θυρίδας τιμολογίων");
  const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,280)));
  const inbox=()=>document.querySelector(".invoice-inbox-head");
  const emit=(event,detail)=>act(async()=>window.dispatchEvent(new CustomEvent(event,{detail})));
  try{
    await t.test("one direct click opens the actual inbox for B, never the first available A",async()=>{
      await reset();await render();const start=calls.length;await open();await settle();assert.ok(inbox());
      const selects=[...document.querySelectorAll(".commerce-hub select")];assert.ok(selects.length>=2);
      for(const select of selects){assert.equal(select.value,"B");assert.deepEqual([...select.options].map(o=>o.value),["B"]);}
      assert.match(document.querySelector(".invoice-inbox-head h2").textContent,/Θυρίδα Τιμολογίων/);
      const reads=calls.slice(start).filter(c=>c.url.includes("/documents/"));assert.ok(reads.length>=3);assert.ok(reads.every(c=>new URL(c.url,"https://isolated.invalid").searchParams.get("storeId")==="B"));
      assert.equal(document.querySelector('[aria-label="Προβολή τιμολογίων"] button[aria-pressed="true"]').textContent,"Τιμολόγια ημέρας");
    });
    await t.test("repeated opening and ordinary refresh do not remount the inbox or an existing payment draft",async()=>{
      await reset();await render();await click("Πληρωμές Ιδιοκτήτη / Διαχειριστή");const draft=document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]');draft.value="unsent input";
      await open();await settle();const first=inbox(),count=calls.length;await open();assert.equal(inbox(),first);assert.equal(calls.length,count);
      await emit("focus");assert.equal(inbox(),first);assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),draft);assert.equal(draft.value,"unsent input");
      await close();assert.equal(inbox(),null);assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),draft);
    });
    await t.test("fresh entry modules ignore stale module events without remounting working state",async()=>{
      await reset();await render();await click("Πληρωμές Ιδιοκτήτη / Διαχειριστή");
      const draft=document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]');draft.value="preserved draft";
      await open();await settle();await click("Παλιά τιμολόγια");const first=inbox();assert.ok(first);
      localStorage.setItem("activeModules","[]");
      for(const detail of [{activeModules:[]},undefined]){
        const before=calls.filter(c=>c.url==="/api/license/current").length;
        await emit("myworkstation:modules-updated",detail);await emit("focus");
        assert.ok(calls.filter(c=>c.url==="/api/license/current").length>=before+2);
        assert.equal(inbox(),first,"fresh server permission must preserve the mounted inbox");
        assert.equal(document.querySelector('[aria-label="Προβολή τιμολογίων"] button[aria-pressed="true"]').textContent,"Παλιά τιμολόγια");
        assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),draft);assert.equal(draft.value,"preserved draft");
      }
    });
    await t.test("late catalog response cannot overwrite freshly verified entry modules",async()=>{
      await reset();await render();let release;
      licenseResponses=[{activeModules:["DOCUMENTS"],modules:[]},new Promise(r=>{release=r})];
      await open();await settle();const first=inbox();assert.ok(first);await click("Παλιά τιμολόγια");
      await emit("focus");await act(async()=>release({activeModules:[],modules:[]}));
      assert.equal(inbox(),first,"older catalog data must not overwrite the entry's newer verification");
      assert.equal(document.querySelector('[aria-label="Προβολή τιμολογίων"] button[aria-pressed="true"]').textContent,"Παλιά τιμολόγια");
    });
    await t.test("stale granting events cannot restore a freshly revoked entry",async()=>{
      await reset();await render();await open();await settle();assert.ok(inbox());modules=[];
      await emit("myworkstation:modules-updated",{activeModules:["DOCUMENTS"]});
      assert.equal(inbox(),null);const count=calls.length;
      await emit("myworkstation:modules-updated",{activeModules:["DOCUMENTS"]});await emit("focus");await settle();
      assert.equal(inbox(),null);assert.ok(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"] [role="alert"]'));
      assert.ok(!calls.slice(count).some(c=>c.url.includes("/documents/")));
    });
    await t.test("missing, foreign, inactive and ambiguous stores fail closed without invoice reads",async()=>{
      for(const kind of ["missing","foreign","inactive","ambiguous"]){
        await reset();rows=kind==="inactive"?[{...stores[1],active:false}]:kind==="ambiguous"?[stores[1],stores[1]]:stores;
        await render(kind==="missing"?"":kind==="foreign"?"FOREIGN":"B");const count=calls.length;await open();await settle();
        assert.equal(inbox(),null);assert.ok(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"] [role="alert"]'));
        assert.ok(!calls.slice(count).some(c=>c.url.includes("/documents/")));
        if(kind==="missing")assert.ok(!calls.slice(count).some(c=>c.url==="/api/stores"));
      }
    });
    await t.test("cached module cannot grant access; current 401/403 denials never mount the inbox",async()=>{
      for(const kind of ["module",401,403]){
        await reset();if(kind==="module")modules=[];else denied=kind;
        await render();const count=calls.length;await open();await settle();assert.equal(inbox(),null);
        assert.ok(document.querySelector('[role="alert"], [data-session-blocked]'));assert.ok(!calls.slice(count).some(c=>c.url.includes("/documents/")));
      }
    });
    await t.test("late previous-store and closed-entry responses cannot mount old content",async()=>{
      await reset();let release;responses=[new Promise(r=>{release=r})];await render("A");await open();assert.equal(inbox(),null);
      await render("B");assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);await open();await settle();assert.equal(document.querySelector(".invoice-inbox-head select").value,"B");
      await act(async()=>release(stores));assert.equal(document.querySelector(".invoice-inbox-head select").value,"B");
      await close();responses=[new Promise(r=>{release=r})];await open();await close();const count=calls.length;await act(async()=>release(stores));await settle();assert.equal(inbox(),null);assert.ok(!calls.slice(count).some(c=>c.url.includes("/documents/")));
    });
    await t.test("session replacement during preflight is rejected by the original Backoffice boundary",async()=>{
      await reset();let release;responses=[new Promise(r=>{release=r})];await render();await open();localStorage.setItem("token",token("session-B"));const count=calls.length;
      await act(async()=>release(stores));assert.ok(document.querySelector("[data-session-blocked]"));assert.equal(inbox(),null);assert.equal(calls.length,count);
    });
    await t.test("mounted session change unmounts native readers and blocks retained stale callbacks",async()=>{
      await reset();await render();await open();await settle();const stale=[...timers.values()];localStorage.setItem("token",token("session-B"));const count=calls.length;await emit("focus");
      assert.ok(document.querySelector("[data-session-blocked]"));assert.equal(inbox(),null);await act(async()=>{for(const timer of stale)await timer.fn()});assert.equal(calls.length,count);
    });
    await t.test("fresh module revocation and store deactivation remove the native invoice view",async()=>{
      for(const change of ["module","store"]){await reset();await render();await open();await settle();assert.ok(inbox());
        if(change==="module")modules=[];else rows=[stores[0],{...stores[1],active:false}];await emit(change==="module"?"myworkstation:modules-updated":"focus");
        assert.equal(inbox(),null);assert.ok(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"] [role="alert"]'));
      }
    });
    await t.test("delegated users receive no new entry and navigation locks remain effective",async()=>{
      await reset();await render("B",{capabilities:["sales.read"]});assert.equal(button("Θυρίδα τιμολογίων καταστήματος"),undefined);
      await render("B",{navigationLocked:true});assert.equal(button("Θυρίδα τιμολογίων καταστήματος").disabled,true);await open();assert.equal(inbox(),null);
    });
    const launcherOpen=()=>emit("mws:commerce-open",{view:"operations",storeId:"B"});
    const allButtons=host=>{assert.ok(host,"active hub");for(const selector of ["[data-purchase-orders-launch]","[data-supplier-control-launch]","[data-customer-control-launch]","[data-price-catalog-launch]"])assert.ok(host.querySelector(selector),selector)};
    const closeLauncher=()=>act(async()=>{const b=document.querySelector('.commerce-overlay button[title="Κλείσιμο"]');assert.ok(b);assert.equal(b.disabled,false);b.click()});
    await t.test("embedded inbox refuses a second launcher hub and explicit close restores native installers",async()=>{
      await reset();await render();await click("Πληρωμές Ιδιοκτήτη / Διαχειριστή");const payment=document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]');payment.value="untouched payment draft";
      await open();await settle();const first=inbox();allButtons(document.querySelector(".commerce-hub"));await launcherOpen();await settle();
      assert.equal(document.querySelectorAll(".commerce-hub").length,1,"must not mount two native commerce hubs");assert.equal(document.querySelector(".commerce-overlay"),null,"existing inbox must refuse competing launcher");assert.equal(inbox(),first);assert.match(document.querySelector('[role="alert"]').textContent,/Κλείσε πρώτα/);
      await close();await launcherOpen();await settle();assert.equal(inbox(),null);assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
      assert.equal(document.querySelector('[data-fixture="OwnerPaymentQuickActions.jsx"]'),payment);assert.equal(payment.value,"untouched payment draft");
    });
    await t.test("existing launcher refuses embedded entry without discarding its mounted state",async()=>{
      await reset();await render();await launcherOpen();await settle();const first=document.querySelector(".commerce-overlay .commerce-hub");allButtons(first);await open();await settle();
      assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null,"existing launcher owns the workspace");assert.equal(document.querySelectorAll(".commerce-hub").length,1);assert.equal(document.querySelector(".commerce-overlay .commerce-hub"),first);assert.match(document.querySelector('[role="alert"]').textContent,/Κλείσε πρώτα/);
      await closeLauncher();await open();await settle();assert.ok(inbox());allButtons(document.querySelector(".commerce-hub"));assert.equal(document.querySelectorAll(".commerce-hub").length,1);
    });
    await t.test("minimized launcher still owns its workspace until explicit close",async()=>{
      await reset();await render();await launcherOpen();await settle();await act(async()=>document.querySelector('.commerce-overlay button[title="Ελαχιστοποίηση"]').click());
      assert.ok(document.querySelector(".commerce-overlay.window-minimized"));await open();await settle();assert.equal(inbox(),null);assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);
      await closeLauncher();await open();await settle();assert.ok(inbox());
    });
    await t.test("pending launcher preflight reserves ownership before a hub exists",async()=>{
      await reset();await render();let release;responses=[new Promise(r=>{release=r})];await launcherOpen();const count=calls.filter(c=>c.url==="/api/stores").length;await open();
      assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);assert.equal(calls.filter(c=>c.url==="/api/stores").length,count,"refused entry must not start another preflight");
      await act(async()=>release(stores));await settle();assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
    });
    await t.test("pending embedded preflight reserves ownership and closed late results cannot remount",async()=>{
      await reset();await render();let release;responses=[new Promise(r=>{release=r})];await open();const count=calls.filter(c=>c.url==="/api/stores").length;await launcherOpen();
      assert.equal(document.querySelector(".commerce-overlay"),null);assert.equal(calls.filter(c=>c.url==="/api/stores").length,count);await close();await launcherOpen();await settle();
      await act(async()=>release(stores));await settle();assert.equal(inbox(),null);assert.equal(document.querySelectorAll(".commerce-hub").length,1);allButtons(document.querySelector(".commerce-overlay .commerce-hub"));
    });
    await t.test("same-turn opposite opening requests cannot claim two workspaces",async()=>{
      for(const invoiceFirst of [true,false]){await reset();await render();await act(async()=>{const generic=()=>window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"operations",storeId:"B"}}));if(invoiceFirst){button("Θυρίδα τιμολογίων καταστήματος").click();generic()}else{generic();button("Θυρίδα τιμολογίων καταστήματος").click()}});await settle();
        assert.equal(document.querySelectorAll(".commerce-hub").length,1,"first accepted request reserves the only native hub");assert.equal(Boolean(inbox()),invoiceFirst);assert.equal(Boolean(document.querySelector(".commerce-overlay")),!invoiceFirst);
      }
    });
    await t.test("native commerce callback and navigation lock preserve the current embedded inbox",async()=>{
      await reset();let nativeCalls=0;await render("B",{onOpenCommerce:()=>nativeCalls++});await open();await settle();const first=inbox();await click("Εμπορική λειτουργία");assert.equal(nativeCalls,0);assert.equal(inbox(),first);
      await render("B",{navigationLocked:true,onOpenCommerce:()=>nativeCalls++});await launcherOpen();assert.equal(document.querySelector(".commerce-overlay"),null);assert.equal(inbox(),first);
      await render("B",{onOpenCommerce:()=>nativeCalls++});await close();await click("Εμπορική λειτουργία");assert.equal(nativeCalls,1);
    });
    await t.test("locked wholesale fixture is never replaced by embedded invoice entry",async()=>{
      await reset();await render();await emit("mws:commerce-open",{view:"products",storeId:"B"});await settle();await click("Χονδρική B2B");await click("Lock isolated wholesale fixture");
      const draft=document.querySelector('[data-fixture="WholesaleSuiteWorkspace.jsx"]');draft.value="pending wholesale fixture";await open();await settle();assert.equal(inbox(),null);assert.equal(document.querySelector('[aria-label="Θυρίδα επιλεγμένου καταστήματος"]'),null);
      assert.equal(document.querySelector('[data-fixture="WholesaleSuiteWorkspace.jsx"]'),draft);assert.equal(draft.value,"pending wholesale fixture");assert.equal(document.querySelector('.commerce-overlay button[title="Κλείσιμο"]').disabled,true);
    });
    await t.test("all observed setup, navigation and LAB status polling stay read-only",async()=>{
      await reset();await render();await open();await settle();await act(async()=>{for(const timer of [...timers.values()])if(timer.ms===15*60*1000)await timer.fn()});await settle();
      assert.ok(calls.length>0);assert.ok(calls.every(c=>c.method==="GET"));assert.ok(!calls.some(c=>/\/sync|\/reprocess|\/original$|\/consolidate|\/payments/.test(c.url)));
    });
    assert.equal(globalThis.__task3PdfViewerCalls||0,0,"no PDF viewer or worker may run");
  }finally{stopNative();stopWatch();await act(async()=>{root.unmount();launcherRoot.unmount()});for(const observer of observers)observer.disconnect();dom.window.close();for(const[k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
