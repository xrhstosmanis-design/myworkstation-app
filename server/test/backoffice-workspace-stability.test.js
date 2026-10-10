import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stockWrapper = await readFile(
  new URL("../../client/src/components/commerce/KioskStyleProductCenterWithStock.jsx", import.meta.url),
  "utf8",
);
const launcher = await readFile(
  new URL("../../client/src/components/commerce/CommerceLauncher.jsx", import.meta.url),
  "utf8",
);

test("catalog refresh keeps the BackOffice workspace mounted", () => {
  assert.doesNotMatch(stockWrapper, /<KioskStyleProductCenter key=\{reloadKey\}/);
  assert.match(stockWrapper, /<KioskStyleProductCenter api=\{api\} stores=\{stores\} onOpenFullProduct=\{onOpenFullProduct\}\/>/);
});

test("duplicate open events cannot reset an already open BackOffice", () => {
  assert.match(launcher, /if\(visibleRef\.current&&!operations\)return;\s*\/\/ Set it synchronously[\s\S]*?visibleRef\.current=true;/);
  assert.match(launcher, /onClick=\{\(\)=>\{visibleRef\.current=false;setParametersOpen\(false\);setVisible\(false\)\}\}/);
});


// Actual launcher, store entry and module navigation; isolated APIs, no live data.
test("store operations entry opens existing functions with the selected store", async t => {
  const {build}=await import("esbuild");
  const {JSDOM}=await import("jsdom");
  const {createRequire}=await import("node:module");
  const {fileURLToPath}=await import("node:url");
  const path=await import("node:path");
  const keep=new Set(["CommerceLauncher.jsx","StoreCloudPage.jsx","CommerceHub.jsx"]);
  const result=await build({
    stdin:{contents:'import React from "react";import Launcher from "./client/src/components/commerce/CommerceLauncher.jsx";import Store from "./client/src/components/cloud/StoreCloudPage.jsx";export default function Fixture(p){return <><Store {...p}/><Launcher/></>}',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},
    bundle:true,write:false,format:"cjs",platform:"node",
    external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},
    plugins:[{name:"isolated-child-panels",setup(b){b.onLoad({filter:/\.jsx$/},args=>{
      const name=path.basename(args.path);if(keep.has(name))return;
      return {contents:'import React from "react";export default function Panel(p){return <div data-fixture="'+name+'" data-store={p.activeStoreId||p.storeId||p.store?.id||""}/>}',loader:"jsx"};
    })}}]
  });
  const module={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Fixture=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid"});
  const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","fetch","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  localStorage.setItem("token","fixture-only");localStorage.setItem("user",JSON.stringify({role:"OWNER"}));
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  const root=createRoot(document.getElementById("root"));
  const stores=[{id:"A",name:"Store A"},{id:"B",name:"Store B"}],calls=[];
  let storeResponses=[];
  const license={activeModules:["INVENTORY"],modules:[]};
  globalThis.fetch=async(url,options={})=>{
    calls.push({url,method:options.method||"GET"});
    const data=url==="/api/stores"?(storeResponses.length?await storeResponses.shift():stores):license;
    return {ok:true,json:async()=>data};
  };
  const api=async(url,options={})=>{calls.push({url,method:options.method||"GET"});return {devices:[]}};
  const mount=async id=>act(async()=>root.render(React.createElement(Fixture,{store:stores.find(s=>s.id===id),api,onBack:()=>{}})));
  const button=text=>[...document.querySelectorAll("button")].find(b=>b.textContent===text||b.querySelector("b")?.textContent===text);
  const click=async el=>act(async()=>el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));
  const send=async detail=>act(async()=>window.dispatchEvent(detail?new CustomEvent("mws:commerce-open",{detail}):new Event("mws:commerce-open")));
  const close=async()=>click(document.querySelector('.commerce-window-bar button[title="Κλείσιμο"]'));
  const selection=()=>document.querySelector(".commerce-hub > .panel label select");
  try{
    await mount("B");
    await t.test("owner landing prioritizes shifts and payments; tool and store changes cannot retain old panels",async()=>{
      const panel=name=>document.querySelector('[data-fixture="'+name+'.jsx"]');
      assert.equal(panel("StoreTransactionsPanel").dataset.store,"B");
      assert.equal(panel("OwnerPaymentQuickActions"),null);
      assert.equal(panel("BarcodeRadioManagement"),null);
      assert.equal(panel("OwnerPendingApprovals"),null);
      assert.equal(document.querySelector(".owner-store-tools").open,false);
      await click(button("Πληρωμές Ιδιοκτήτη / Διαχειριστή"));
      assert.equal(panel("OwnerPaymentQuickActions").dataset.store,"B");
      assert.equal(panel("StoreTransactionsPanel"),null);
      await click(button("Barcode & Online Ράδιο"));
      assert.equal(panel("BarcodeRadioManagement").dataset.store,"B");
      await click(button("Εκκρεμείς επιβεβαιώσεις"));
      assert.equal(panel("BarcodeRadioManagement"),null);
      assert.equal(panel("OwnerPendingApprovals").dataset.store,"B");
      await click(button("Κλείσιμο πρόσθετης λειτουργίας"));
      assert.equal(panel("OwnerPendingApprovals"),null);
      await click(button("Σύνδεση RBS"));
      assert.ok(document.querySelector('[aria-label="Σύνδεση RBS CAP Driver"]'));
      await mount("A");
      assert.equal(panel("OwnerPaymentQuickActions"),null);
      assert.equal(panel("OwnerPendingApprovals"),null);
      assert.equal(document.querySelector('[aria-label="Σύνδεση RBS CAP Driver"]'),null);
      assert.equal(panel("StoreTransactionsPanel").dataset.store,"A");
      assert.equal(document.querySelector(".owner-primary-nav button").getAttribute("aria-pressed"),"true");
      assert.ok(calls.every(c=>c.method==="GET"),"navigation never submits business actions");
      await mount("B");
    });
    await t.test("upper entry remains product workspace; lower entry opens real module functions",async()=>{
      await click(button("Εμπορική λειτουργία"));
      assert.ok(document.querySelector('[data-fixture="KioskStyleProductCenterWithStock.jsx"]'));
      await close();
      await click(button("Λοιπές εμπορικές λειτουργίες"));
      assert.ok(document.querySelector(".commerce-hub"),"real existing CommerceHub");
      assert.equal(selection().value,"B");
      assert.deepEqual([...selection().options].map(o=>o.value),["B"]);
      const strip=document.querySelector(".commerce-module-strip");
      assert.ok(strip.textContent.includes("Αποθήκη"));
      assert.equal([...strip.querySelectorAll("button")].find(b=>b.textContent.includes("Αναλυτική")).disabled,true,"inactive module remains locked");
      assert.equal(document.querySelector('.commerce-mode-switch button.active').textContent,"Λοιπές εμπορικές λειτουργίες");
    });
    await t.test("ordinary duplicate event preserves current tab and does not fetch again",async()=>{
      await click(button("Online Παραγγελίες"));
      const count=calls.length;await send();
      assert.ok(document.querySelector('[data-fixture="OnlineOrdersBackofficePanel.jsx"][data-store="B"]'));
      assert.equal(calls.length,count);
    });
    await t.test("explicit new-store entry clears previous workspace and selects only that store",async()=>{
      await mount("A");await click(button("Λοιπές εμπορικές λειτουργίες"));
      assert.ok(document.querySelector(".commerce-hub"));assert.equal(selection().value,"A");
      assert.equal(document.querySelector('[data-fixture="OnlineOrdersBackofficePanel.jsx"]'),null);
      assert.deepEqual([...selection().options].map(o=>o.value),["A"]);
    });
    await t.test("missing or unauthorized requested store cannot fall back to another store",async()=>{
      for(const storeId of ["foreign",""]){await send({view:"operations",storeId});assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.querySelector(".commerce-hub"),null);}
    });
    await t.test("late earlier open cannot replace the current selected store",async()=>{
      let release;storeResponses=[new Promise(r=>{release=r}),Promise.resolve(stores)];
      await send({view:"operations",storeId:"A"});assert.ok(document.querySelector('[role="status"]'));
      await send({view:"operations",storeId:"B"});assert.equal(selection().value,"B");
      await act(async()=>release(stores));assert.equal(selection().value,"B");assert.deepEqual([...selection().options].map(o=>o.value),["B"]);
    });
    await t.test("all diagnostic transport remains read-only",async()=>assert.ok(calls.every(c=>c.method==="GET")));
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const [k,d] of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
  }
});
