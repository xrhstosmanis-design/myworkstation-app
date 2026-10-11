import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

async function bundle(path){const {build}=await import("esbuild"),built=await build({stdin:{contents:`export {default} from "./${path}"`,resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});const module={exports:{}};new Function("require","module","exports",built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports.default}
const report={kind:"product_stock",scope:"OWNER_SELECTED_STORE",companyId:"c",storeId:"s",storeName:"Store",observedAt:"2026-10-11T14:00:00.000Z",productQuery:"TEST1",result:"matched",rows:[{productId:"p",name:'<img src=x onerror="bad">',sku:"TEST1",currentStock:-2.125,unit:"KG"}],candidates:[]};

test("stock evidence escapes product names, retains negative fractional quantity and never infers quantity for incomplete matches",async()=>{
  const Panel=await bundle("client/src/components/voice/StockAssistantEvidence.jsx"),React=await import("react"),{renderToStaticMarkup}=await import("react-dom/server");
  const html=renderToStaticMarkup(React.createElement(Panel,{evidence:[report]}));
  assert.match(html,/-2,125/);assert.match(html,/κιλά/);assert.match(html,/ώρα Ελλάδας/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|Έλεγχος Ταμείων|Τζίρος με ΦΠΑ/);
  for(const result of ["ambiguous","no_match","source_limited"]){const out=renderToStaticMarkup(React.createElement(Panel,{evidence:[{...report,result,rows:[],candidates:[{name:"A",sku:"TEST2"}],truncated:result==="source_limited"}]}));assert.doesNotMatch(out,/<table|-2,125/);if(result==="ambiguous")assert.match(out,/συγκεκριμένο SKU/);if(result==="no_match")assert.match(out,/δεν αποδεικνύει μηδενικό απόθεμα/);if(result==="source_limited")assert.match(out,/στενότερο φίλτρο/)}
});

test("mounted Owner stock answer survives unchanged capability refresh and is withdrawn on actual access or store change",async()=>{
  const Panel=await bundle("client/src/components/voice/OwnerAssistantPanel.jsx"),{JSDOM}=await import("jsdom"),dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid"}),keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  let supported=["cash_details","sales_by_product","stock_by_product"],posts=0,recording;const scope={companyId:"c",storeId:"s",storeName:"Store"};
  const api=async(url,options={})=>options.method==="POST"?(posts++,{scope,answer:"Stock fixture -2,125 κιλά",evidence:[report]}):{available:true,scope,supported};
  class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
  const ask=async()=>{await act(async()=>document.querySelector(".mws-voice-input-actions button").dispatchEvent(new window.MouseEvent("click",{bubbles:true})));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:"Πόσο απόθεμα έχει το TEST1;"}],{isFinal:true})]});recording.onend()});await act(async()=>document.querySelector('button[type="submit"]').dispatchEvent(new window.MouseEvent("click",{bubbles:true})))};
  try{
    await act(async()=>root.render(React.createElement(Panel,{api,storeId:"s",storeName:"Store"})));await ask();assert.equal(posts,1);assert.ok(document.querySelector(".mws-stock-evidence"));assert.equal(document.querySelector(".mws-cash-evidence"),null);assert.equal(document.querySelector(".mws-sales-evidence"),null);
    await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.match(document.body.textContent,/Stock fixture/);
    await act(async()=>root.render(React.createElement(Panel,{api,storeId:"",storeName:""})));assert.equal(document.querySelector(".mws-stock-evidence"),null);assert.doesNotMatch(document.body.textContent,/Stock fixture/);assert.equal(document.querySelector("textarea").value,"");
    await act(async()=>root.render(React.createElement(Panel,{api,storeId:"s",storeName:"Store"})));await ask();assert.equal(posts,2);supported=["cash_details"];await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(document.querySelector(".mws-stock-evidence"),null);assert.doesNotMatch(document.body.textContent,/Stock fixture/);assert.equal(document.querySelector('button[type="submit"]').disabled,true);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of prior)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}
});
