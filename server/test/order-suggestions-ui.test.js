import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("order suggestions production panel: isolated DOM controls, pagination and stale responses",async t=>{
  const built=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/OrderSuggestionsPanel.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"}});
  const module={exports:{}};new Function("require","module","exports",built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const Panel=module.exports.default;
  const dom=new JSDOM("<!doctype html><div id='root'></div>",{url:"https://isolated.invalid"});
  const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),root=createRoot(dom.window.document.getElementById("root"));
  const fixture=Array.from({length:7},(_,i)=>({productId:`p${i}`,name:`Καφές ${i}`,sku:`SKU-${i}`,unitLabel:"τεμ.",currentStock:3,minStock:5,netQuantity:45,dailyDemand:1.5,soldQuantity:60,returnedQuantity:15,suggestedQuantity:i+1,reason:"Κάλυψη πωλήσεων.",warnings:[]}));
  fixture.push({...fixture[0],productId:"zero",name:"Zero",suggestedQuantity:0});
  const response=(storeId,rows=fixture,options={historyDays:30,coverageDays:7,leadDays:3})=>({storeId,rows,options});
  const render=(api,storeId)=>act(async()=>root.render(React.createElement(Panel,{api,storeId})));
  const mount=async(api,store)=>{await act(async()=>root.render(null));await render(api,store);};
  const text=()=>dom.window.document.querySelector(".order-suggestions").textContent;
  const rows=()=>[...dom.window.document.querySelectorAll("tbody tr")];
  const click=node=>act(async()=>node.click());
  const type=(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
  const buttons=()=>[...dom.window.document.querySelectorAll("button")];
  try{
    await t.test("three-row pagination and filters expose correct quantities with no write request",async()=>{
      const calls=[];await mount(async path=>{calls.push(path);return response("A");},"A");
      assert.equal(rows().length,3);assert.match(text(),/7 είδη/);assert.match(rows()[0].textContent,/Καφές 0/);
      await click(buttons().find(b=>b.textContent==="Επόμενα"));assert.equal(rows().length,3);assert.match(rows()[0].textContent,/Καφές 3/);
      await click(buttons().find(b=>b.textContent==="Επόμενα"));assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Καφές 6/);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),"καφες 1");assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Καφές 1/);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),"not-found");assert.equal(rows().length,0);assert.match(text(),/Δεν υπάρχουν προτάσεις/);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προτάσεων"]'),"");await click(dom.window.document.querySelector('[type="checkbox"]'));assert.match(text(),/8 είδη/);
      assert.equal(calls.length,1);assert.match(calls[0],/^\/api\/commerce\/order-suggestions\?storeId=A&historyDays=30&coverageDays=7&leadDays=3$/);
      assert.match(text(),/Δεν υποβάλλεται παραγγελία/);
    });
    await t.test("parameters apply only through computation; server-applied summary stays distinct",async()=>{
      const calls=[];const api=async path=>{calls.push(path);const u=new URL(path,"https://isolated.invalid");return response("A",fixture,{historyDays:Number(u.searchParams.get("historyDays")),coverageDays:Number(u.searchParams.get("coverageDays")),leadDays:Number(u.searchParams.get("leadDays"))});};
      await mount(api,"A");await type(dom.window.document.querySelectorAll('input[type="number"]')[2],"6");assert.equal(calls.length,1);assert.match(text(),/παράδοση 3 ημερών/);
      await act(async()=>dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
      assert.equal(calls.length,2);assert.match(calls[1],/leadDays=6/);assert.match(text(),/παράδοση 6 ημερών/);
    });
    await t.test("loading and errors clear rows; retry and unconfirmed unit warnings remain visible",async()=>{
      let resolve;await mount(()=>new Promise(done=>{resolve=done;}),"A");assert.equal(rows().length,0);assert.match(text(),/Φόρτωση αποθέματος/);assert.equal(buttons()[0].disabled,true);
      const unknown={...fixture[0],suggestedQuantity:null,reason:"Χρειάζεται επιβεβαίωση μονάδας αποθήκης.",warnings:["Αρνητικό απόθεμα: έλεγχος."]};
      await act(async()=>resolve(response("A",[unknown])));assert.equal(rows().length,1);assert.equal(dom.window.document.querySelector(".order-suggestions-quantity").firstChild.textContent,"—");assert.match(text(),/επιβεβαίωση μονάδας/);assert.match(text(),/Αρνητικό απόθεμα/);
      let calls=0;await mount(async()=>{if(++calls===1)throw Error("Fixture unavailable");return response("A");},"A");assert.ok(dom.window.document.querySelector('[role="alert"]'));assert.equal(rows().length,0);
      await act(async()=>dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));assert.equal(rows().length,3);assert.equal(dom.window.document.querySelector('[role="alert"]'),null);
    });
    await t.test("store change and wrong-store replies cannot leak stale proposals; no-store makes no call",async()=>{
      let resolve;const api=async path=>new URL(path,"https://isolated.invalid").searchParams.get("storeId")==="A"?new Promise(done=>{resolve=done;}):response("B",[{...fixture[0],name:"Only B"}]);
      await mount(api,"A");await render(api,"B");assert.equal(rows().length,1);assert.match(text(),/Only B/);
      await act(async()=>resolve(response("A")));assert.equal(rows().length,1);assert.match(text(),/Only B/);assert.doesNotMatch(text(),/Καφές/);
      await mount(async()=>response("A"),"B");assert.match(text(),/Μη έγκυρη απάντηση/);assert.equal(rows().length,0);
      let calls=0;await mount(async()=>{calls++;return response("A");},"");assert.equal(calls,0);assert.match(text(),/Επίλεξε κατάστημα/);assert.equal(buttons()[0].disabled,true);
    });
  }finally{await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
