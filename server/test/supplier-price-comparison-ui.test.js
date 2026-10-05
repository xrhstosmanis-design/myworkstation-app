// Isolated React/DOM acceptance, not browser, LAB, login or tenant proof.
// Compile the real panel; only its CSS is omitted because jsdom has no layout.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const quote=(supplierId,supplierName,lastCost,bestCost,extra={})=>({
  productId:"fixture-product",productName:"Καφές δοκιμής",sku:"FIX-29",unitLabel:"τεμ.",
  supplierId,supplierName,lastCost,bestCost,comparablePurchaseCount:2,excludedPurchaseCount:0,
  lastDocumentNumber:`${supplierId}-LAST`,lastPurchaseAt:"2026-10-03T09:00:00Z",
  bestDocumentNumber:`${supplierId}-HIST`,bestPurchaseAt:"2026-09-01T09:00:00Z",...extra
});
const pair=[quote("A","Άλφα",1.50,.50),quote("B","Βήτα",.75,.60),
  quote("C","Ελλιπής τελευταία",null,.90,{reason:"Μη επιβεβαιωμένη κοινή μονάδα",excludedPurchaseCount:1})];
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const text=node=>node.textContent.replace(/\s+/g," ").trim();

test("supplier comparison production panel: isolated React/DOM acceptance",async t=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/SupplierPriceComparisonPanel.jsx",import.meta.url))],
    bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"}});
  const module={exports:{}};
  new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Panel=module.exports.default;
  const dom=new JSDOM("<!doctype html><div id='root'></div>",{url:"https://isolated.invalid"});
  const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react");
  const {createRoot}=await import("react-dom/client");
  const {act}=React;
  const root=createRoot(dom.window.document.getElementById("root"));
  const render=(api,storeId)=>act(async()=>{root.render(React.createElement(Panel,{api,storeId}));});
  const mount=async(api,storeId)=>{await act(async()=>root.render(null));await render(api,storeId);};
  const rows=()=>[...dom.window.document.querySelectorAll("tbody tr")];
  const cells=row=>[...row.querySelectorAll("td")].map(cell=>cell.children.length?[...cell.children].map(text).join(" "):text(cell));
  const body=()=>text(dom.window.document.querySelector(".supplier-comparison-body"));
  const refresh=()=>dom.window.document.querySelector(".supplier-comparison-head button");
  const click=button=>act(async()=>button.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));
  const search=value=>act(async()=>{
    const input=dom.window.document.querySelector("input");
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);
    input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  });
  try{
    await t.test("two suppliers: correct EUR/percent differences and distinct historical documents",async()=>{
      const calls=[];await mount(async path=>{calls.push(path);return pair;},"store & A");
      assert.equal(calls[0],"/api/commerce/supplier-price-comparison?storeId=store+%26+A");
      assert.equal(rows().length,3);
      assert.match(cells(rows()[0])[0],/^Βήτα ΧΑΜΗΛΟΤΕΡΗ ΤΙΜΗ/);
      assert.equal(cells(rows()[0])[4],"0,000 €");
      assert.equal(cells(rows()[1])[1],"1,500 €");
      assert.equal(cells(rows()[1])[4],"+0,750 € +100% από τη χαμηλότερη");
      assert.match(cells(rows()[1])[3],/^A-LAST 3\/10\/2026$/);
      assert.equal(cells(rows()[2])[4],"—");
      assert.match(cells(rows()[2])[1],/^— Μη επιβεβαιωμένη κοινή μονάδα$/);
      assert.equal(rows()[2].className,"");
      const select=dom.window.document.querySelector("select");
      await act(async()=>{select.value="bestCost";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
      assert.match(cells(rows()[0])[0],/^Άλφα ΧΑΜΗΛΟΤΕΡΗ ΤΙΜΗ/);
      assert.match(cells(rows()[0])[3],/^A-HIST 1\/9\/2026$/);
      assert.equal(cells(rows()[1])[4],"+0,100 € +20% από τη χαμηλότερη");
      assert.match(cells(rows()[1])[3],/^B-HIST 1\/9\/2026$/);
      assert.equal(cells(rows()[2])[4],"+0,400 € +80% από τη χαμηλότερη");
      assert.match(body(),/Σύγκριση ιστορικών ελαχίστων/);
      assert.equal(calls.length,1,"basis changes must not refetch or mutate purchases");
    });
    await t.test("ties, invalid costs and single supplier never create a false saving",async()=>{
      await mount(async()=>[quote("A","Άλφα",1,1),quote("B","Βήτα",1.000000001,1)],"tie");
      assert.equal(dom.window.document.querySelectorAll("tr.cheapest").length,2);
      for(const row of rows()){assert.match(cells(row)[0],/ΙΔΙΑ ΧΑΜΗΛΟΤΕΡΗ ΤΙΜΗ/);assert.equal(cells(row)[4],"0,000 €");}
      assert.match(body(),/Υπάρχει ισοτιμία/);
      await mount(async()=>[quote("A","Μηδενική",0,null),quote("B","Αρνητική",-.1,null),quote("C","Ελλιπής",null,null),quote("D","Άκυρη","invalid",null)],"invalid");
      assert.equal(dom.window.document.querySelectorAll("tr.cheapest").length,0);
      for(const row of rows()){assert.equal(cells(row)[1],"—");assert.equal(cells(row)[4],"—");}
      assert.match(body(),/Δεν υπάρχουν τιμές με επιβεβαιωμένη κοινή μονάδα/);
      await mount(async()=>[pair[0]],"single");
      assert.equal(dom.window.document.querySelectorAll(".supplier-comparison-badge").length,0);
      assert.equal(cells(rows()[0])[4],"—");
      assert.match(body(),/χρειάζεται δεύτερος προμηθευτής/);
    });
    await t.test("Greek search matches accents, SKU and supplier; missing query is empty",async()=>{
      await mount(async()=>pair,"search");
      for(const query of ["καφες","FIX-29","αλφα"]){await search(query);assert.equal(rows().length,3,query);}
      await search("not-a-product");assert.equal(rows().length,0);assert.match(body(),/Δεν βρέθηκαν προϊόντα/);
      await search("");assert.equal(rows().length,3);
    });
    await t.test("loading, API rejection and malformed reply recover through the real refresh button",async()=>{
      const waiting=deferred();await mount(()=>waiting.promise,"loading");
      assert.match(body(),/Φόρτωση εγκεκριμένων αγορών/);assert.equal(refresh().disabled,true);
      await act(async()=>waiting.resolve(pair));assert.equal(rows().length,3);assert.equal(refresh().disabled,false);
      for(const failure of ["reject","malformed"]){
        let calls=0;await mount(async()=>{calls++;if(calls===1){if(failure==="reject")throw Error("Fixture unavailable");return {rows:pair};}return pair;},failure);
        const alert=dom.window.document.querySelector("[role=alert]");
        assert.ok(alert);assert.match(text(alert),failure==="reject"?/Fixture unavailable/:/δεν ήταν έγκυρη/);
        assert.equal(rows().length,0);assert.equal(refresh().disabled,false);
        await click(refresh());assert.equal(rows().length,3);assert.equal(dom.window.document.querySelector("[role=alert]"),null);assert.equal(calls,2);
      }
    });
    await t.test("store switch clears prices and late previous-store response cannot replace selected store",async()=>{
      const old=deferred(), current=deferred(),calls=[];
      const api=async path=>{const store=new URL(path,"https://isolated.invalid").searchParams.get("storeId");calls.push(store);return store==="A"?old.promise:current.promise;};
      await mount(api,"A");await render(api,"B");assert.equal(rows().length,0);assert.match(body(),/Φόρτωση/);
      await act(async()=>current.resolve([quote("B","Μόνο κατάστημα Β",7,7)]));
      assert.equal(rows().length,1);assert.match(cells(rows()[0])[0],/^Μόνο κατάστημα Β/);assert.equal(cells(rows()[0])[1],"7,000 €");
      await act(async()=>old.resolve(pair));assert.equal(rows().length,1);assert.match(cells(rows()[0])[0],/^Μόνο κατάστημα Β/);
      assert.deepEqual(calls,["A","B"]);
      const next=deferred();await render(()=>next.promise,"C");assert.equal(rows().length,0);assert.match(body(),/Φόρτωση/);
      await act(async()=>next.resolve([]));assert.match(body(),/Δεν υπάρχουν εγκεκριμένες αγορές/);
    });
    await t.test("no store sends no request; unmounted late reply causes no render",async()=>{
      let calls=0;await mount(async()=>{calls++;return pair;},"");
      assert.equal(calls,0);assert.match(body(),/Επίλεξε κατάστημα/);assert.equal(refresh().disabled,true);
      const late=deferred();await mount(()=>late.promise,"unmount");await act(async()=>root.render(null));
      await act(async()=>late.resolve(pair));assert.equal(dom.window.document.getElementById("root").childElementCount,0);
    });
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
