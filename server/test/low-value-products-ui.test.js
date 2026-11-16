import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("low value production panel: isolated DOM controls, pagination and stale responses",async t=>{
  const built=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/LowValueProductsPanel.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"}});
  const module={exports:{}};new Function("require","module","exports",built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const Panel=module.exports.default;
  const dom=new JSDOM("<!doctype html><div id='root'></div>",{url:"https://isolated.invalid"});
  const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),root=createRoot(dom.window.document.getElementById("root"));
  const fixture=Array.from({length:7},(_,i)=>({productId:`p${i}`,name:`Καφές ${i}`,sku:`SKU-${i}`,unitLabel:"τεμ.",currentStock:30,soldQuantity:10,returnedQuantity:0,netQuantity:10,daysOfStock:90,salesNet:100,costValue:90,profit:10,margin:10,flags:["LOW_MARGIN"],warnings:[],costEvidence:[{documentId:"doc1",number:"INV-1",date:"2026-10-01"}]}));
  fixture.push({...fixture[0],productId:"zero",name:"Zero",flags:[]});
  const response=(storeId,rows=fixture,options={historyDays:30,slowDays:90,marginPercent:20})=>({storeId,rows,options});
  const render=(api,storeId)=>act(async()=>root.render(React.createElement(Panel,{api,storeId})));
  const mount=async(api,store)=>{await act(async()=>root.render(null));await render(api,store);};
  const text=()=>dom.window.document.querySelector(".low-value-products").textContent;
  const rows=()=>[...dom.window.document.querySelectorAll("tbody tr")];
  const click=node=>act(async()=>node.click());
  const type=(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
  const buttons=()=>[...dom.window.document.querySelectorAll("button")];
  const select=async value=>act(async()=>{const node=dom.window.document.querySelector("select");node.value=value;node.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
  const submit=()=>act(async()=>dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));
  try{
    await t.test("read-only report paginates, searches, separates findings and exposes document evidence",async()=>{
      const calls=[];await mount(async path=>{calls.push(path);return response("A");},"A");
      assert.equal(rows().length,5);assert.match(text(),/7 από 8 είδη/);
      assert.match(rows()[0].textContent,/Χαμηλό περιθώριο/);assert.match(rows()[0].textContent,/INV-1/);
      await click(buttons().find(b=>b.textContent==="Επόμενα"));assert.equal(rows().length,2);assert.match(rows()[0].textContent,/Καφές 5/);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προϊόντος"]'),"καφες 1");assert.equal(rows().length,1);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προϊόντος"]'),"missing");assert.equal(rows().length,0);assert.match(text(),/Δεν υπάρχουν είδη/);
      await type(dom.window.document.querySelector('[placeholder="Αναζήτηση προϊόντος"]'),"");await select("ALL");assert.match(text(),/8 από 8 είδη/);
      await select("MOVEMENT");assert.equal(rows().length,0);await select("MARGIN");assert.equal(rows().length,5);
      await select("REVIEW");assert.equal(rows().length,0);
      assert.equal(calls.length,1);assert.match(calls[0],/^\/api\/commerce\/low-value-products\?storeId=A&historyDays=30&slowDays=90&marginPercent=20$/);
      await click(buttons().find(b=>b.textContent==="Πώς αξιολογούνται"));assert.match(text(),/τελευταίο εγκεκριμένο τιμολόγιο/);
      await click(buttons().find(b=>b.textContent==="Κλείσιμο βοήθειας"));assert.equal(dom.window.document.querySelector('[aria-label="Αιτιολογία αξιολόγησης"]'),null);
    });
    await t.test("draft thresholds only apply after computation; errors clear data and retry works",async()=>{
      const calls=[];await mount(async path=>{calls.push(path);const u=new URL(path,"https://isolated.invalid");return response("A",fixture,{historyDays:Number(u.searchParams.get("historyDays")),slowDays:Number(u.searchParams.get("slowDays")),marginPercent:Number(u.searchParams.get("marginPercent"))});},"A");
      await type(dom.window.document.querySelectorAll('input[type="number"]')[2],"40");assert.equal(calls.length,1);assert.match(text(),/περιθώριο < 20%/);
      await submit();assert.equal(calls.length,2);assert.match(text(),/περιθώριο < 40%/);
      let attempts=0;await mount(async()=>{if(++attempts===1)throw Error("Unavailable");return response("A",[{...fixture[0],flags:["REVIEW"],costValue:null,profit:null,margin:null,warnings:["Δεν υπάρχει ιστορικό κόστος."],costEvidence:[]}]);},"A");
      assert.ok(dom.window.document.querySelector('[role="alert"]'));assert.equal(rows().length,0);await submit();assert.equal(rows().length,1);assert.match(rows()[0].textContent,/Δεν υπάρχει ιστορικό κόστος/);assert.match(rows()[0].textContent,/Κόστος —/);
    });
    await t.test("loading, store changes, wrong-store replies and no-store never expose stale results",async()=>{
      let resolve;const api=async path=>new URL(path,"https://isolated.invalid").searchParams.get("storeId")==="A"?new Promise(done=>{resolve=done;}):response("B",[{...fixture[0],name:"Only B"}]);
      await mount(api,"A");assert.equal(rows().length,0);assert.match(text(),/Φόρτωση πωλήσεων/);
      await render(api,"B");assert.equal(rows().length,1);assert.match(text(),/Only B/);
      await act(async()=>resolve(response("A")));assert.match(text(),/Only B/);assert.doesNotMatch(text(),/Καφές/);
      await mount(async()=>response("A"),"B");assert.match(text(),/Μη έγκυρη απάντηση/);assert.equal(rows().length,0);
      let calls=0;await mount(async()=>{calls++;return response("A");},"");assert.equal(calls,0);assert.match(text(),/Επίλεξε κατάστημα/);
    });
  }finally{await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
