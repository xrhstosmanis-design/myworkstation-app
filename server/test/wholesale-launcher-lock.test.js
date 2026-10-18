import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("mounted CommerceLauncher preserves unresolved wholesale child across navigation attempts and temporary authentication loss",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/platform-admin"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","MutationObserver","localStorage","IS_REACT_ACT_ENVIRONMENT","fetch","setInterval","clearInterval"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let poll;
  const requests=[],stores=[{id:"store-a",name:"Store A",active:true},{id:"store-b",name:"Store B",active:true}];
  for(const key of keys){
    const value=key==="IS_REACT_ACT_ENVIRONMENT"?true:key==="setInterval"?callback=>{poll=callback;return 1}:key==="clearInterval"?()=>{}:key==="fetch"?async path=>{requests.push(path);return {ok:true,status:200,json:async()=>path==="/api/stores"?stores:{activeModules:["CORE"]}}}:dom.window[key];
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  localStorage.setItem("token","isolated-token");localStorage.setItem("user",JSON.stringify({role:"OWNER"}));
  dom.window.__wholesaleMounts=0;dom.window.__wholesaleUnmounts=0;
  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client");
  const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},plugins:[{name:"isolate-launcher-children",setup(builder){
    builder.onLoad({filter:/\.jsx$/},async args=>{
      if(args.path.endsWith("/CommerceLauncher.jsx"))return;
      if(args.path.endsWith("/WholesaleB2BPanel.jsx"))return {loader:"jsx",contents:`import React,{useEffect,useRef} from 'react';export default function WholesaleStub({activeStoreId,onSubmissionLockChange}){const frozen=useRef('unchanged-original-client-order-key');useEffect(()=>{window.__wholesaleMounts++;return()=>window.__wholesaleUnmounts++},[]);return <section data-wholesale-child><span data-original-key>{frozen.current}</span><span data-original-store>{activeStoreId}</span><button onClick={()=>onSubmissionLockChange(true)}>Freeze unresolved request</button><button onClick={()=>onSubmissionLockChange(false)}>Acknowledge original request</button></section>}`};
      return {loader:"jsx",contents:"import React from 'react';export default function Stub(){return <div data-isolated-other-child/>}"};
    });
  }}]});
  const component={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
  const root=createRoot(document.getElementById("root"));
  const click=async text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(item=>item.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const open=async storeId=>act(async()=>window.dispatchEvent(new dom.window.CustomEvent("mws:commerce-open",{detail:{view:"operations",storeId}})));
  try{
    await act(async()=>root.render(React.createElement(component.exports.default)));await open("store-a");await click("Χονδρική / B2B");
    const child=document.querySelector("[data-wholesale-child]");assert.ok(child);assert.equal(child.querySelector("[data-original-store]").textContent,"store-a");assert.equal(dom.window.__wholesaleMounts,1);
    await click("Freeze unresolved request");const requestCount=requests.length;
    for(const title of ["Ελαχιστοποίηση","Κλείσιμο"]){const button=document.querySelector(`[title="${title}"]`);assert.equal(button.disabled,true);await act(async()=>button.click());assert.equal(document.querySelector("[data-wholesale-child]"),child)}
    for(const text of ["Προϊόντα, Τιμές, Προσφορές & Απογραφή","Λοιπές εμπορικές λειτουργίες","Εμπορικές λειτουργίες","Online Παραγγελίες"]){const button=[...document.querySelectorAll("button")].find(item=>item.textContent===text);assert.ok(button);assert.equal(button.disabled,true);await act(async()=>button.click())}
    await open("store-b");assert.equal(requests.length,requestCount);assert.equal(child.querySelector("[data-original-store]").textContent,"store-a");
    await act(async()=>document.querySelector('[title="Πλήρης οθόνη / επαναφορά"]').click());assert.equal(document.querySelector("[data-wholesale-child]"),child);
    localStorage.removeItem("token");localStorage.removeItem("user");await act(async()=>poll());
    assert.equal(document.querySelector("[data-wholesale-child]"),child,"authentication polling must not discard the unresolved original request");assert.equal(dom.window.__wholesaleUnmounts,0);
    localStorage.setItem("token","renewed-isolated-token");localStorage.setItem("user",JSON.stringify({role:"OWNER"}));await act(async()=>poll());
    assert.equal(document.querySelector("[data-original-key]").textContent,"unchanged-original-client-order-key");assert.equal(dom.window.__wholesaleMounts,1);assert.equal(dom.window.__wholesaleUnmounts,0);
    await click("Acknowledge original request");assert.equal(document.querySelector('[title="Κλείσιμο"]').disabled,false);await act(async()=>document.querySelector('[title="Κλείσιμο"]').click());assert.equal(document.querySelector("[data-wholesale-child]"),null);assert.equal(dom.window.__wholesaleUnmounts,1);
  }finally{
    await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
});
