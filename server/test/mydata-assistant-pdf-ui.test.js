import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
const tick=()=>new Promise(r=>setTimeout(r,10));

test("myDATA inbox Check passes its exact inbox/store and auto-opens review; late old-store acquisition cannot navigate",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid"});
 const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","IS_REACT_ACT_ENVIRONMENT"];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/InvoiceInboxPanel.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"}});
 const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById("root")),calls=[],events=[];let finish;
 document.addEventListener("purchase-orders:open",e=>events.push(e.detail));
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith("/original"))return new Promise(r=>finish=r);if(path.includes("/archive?"))return {items:[{id:"inbox-exact",mark:"400001",filename:"42.pdf",status:"IN_REVIEW",hasAttachment:true}],total:1,archiveTotal:1,suppliers:[]};return {enabled:false,serverAutomatic:true}};
 const actWait=fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,300))});
 const check=()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Έλεγχος από βοηθό AI");
 try{
  await actWait(()=>root.render(React.createElement(module.exports.default,{api,stores:[{id:"s",name:"S"},{id:"other",name:"Other"}]})));
  await actWait();await actWait(()=>check().click());assert.equal(JSON.parse(calls.find(c=>c.path.endsWith("/original")).options.body).storeId,"s");
  await actWait(()=>finish({purchaseOrderId:"order-exact",downloaded:false}));assert.deepEqual(events,[{orderId:"order-exact",storeId:"s",assistantSource:{inboxId:"inbox-exact",storeId:"s"},openAssistant:true}]);
  await actWait(()=>check().click());const select=document.querySelector(".invoice-inbox-head select");await actWait(()=>{select.value="other";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  await actWait(()=>finish({purchaseOrderId:"old-store-order"}));assert.equal(events.length,1);
  assert.equal(calls.some(c=>/sync|reprocess|ai-recheck|\/sales|\/finalize/.test(c.path)),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});

test("same order switches retained POS/photos to explicit myDATA/PDF; preview keeps exact origin and stale responses stay detached",async()=>{
 const dom=new JSDOM("<main>isolated</main>",{url:"https://isolated.invalid"});
 const keys=["window","document","MutationObserver","FormData","localStorage","Image"];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 try{
  const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/invoice-assistant-pos-client.js",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},plugins:[{name:"isolated-pdf-render",setup(b){b.onLoad({filter:/invoice-assistant-pdf-viewer\.js$/},()=>({contents:'export async function mountInvoicePdfViewer(host,data){host.dataset.renderedPdf=data;return ()=>{host.dataset.disposed="1"}}',loader:"js"}))}}]});
  const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const {openPosInvoiceAssistant}=module.exports,calls=[],pdf="data:application/pdf;base64,EXACT-INBOX",photo="data:image/jpeg;base64,POS-PHOTO";
  const order={invoiceNumber:"42",supplierName:"Fixture"},detail={order,lines:[],totals:{net:0,vat:0,gross:0}};
  let resolveStale;
  const api=async(path,options={})=>{calls.push({path,options});if(path.includes("/source")){if(path.includes("inboxId=late"))return new Promise(r=>resolveStale=r);const mydata=path.includes("inboxId=i");return {document:{totalGross:0},pages:[{index:1,filename:mydata?"42.pdf":"POS.jpg",mimeType:mydata?"application/pdf":"image/jpeg",dataUrl:mydata?pdf:photo}]}}if(path.endsWith("/preview"))return {printedLines:[],corrections:[],pagesComplete:false,assistantMessage:"Review only"};return detail};
  await openPosInvoiceAssistant("o",order,null,api);const pos=document.querySelector("[data-pages]").closest("[data-pos-invoice-modal]");assert.equal(pos.querySelector("canvas").dataset.source,photo);
  pos.querySelector("[data-minimize]").click();
  const context={inboxId:"i",storeId:"s"};await openPosInvoiceAssistant("o",order,null,api,context);await tick();
  assert.equal(pos.isConnected,false);const pdfWindow=document.querySelector("[data-pages]").closest("[data-pos-invoice-modal]");assert.match(pdfWindow.textContent,/myDATA/);assert.equal(pdfWindow.querySelector("[data-pdf-viewer]").dataset.renderedPdf,pdf);assert.equal(pdfWindow.querySelector("canvas"),null);
  context.inboxId="caller-mutated";pdfWindow.querySelector("[data-message]").value="Check original";pdfWindow.querySelector("[data-ask]").click();await tick();
  const previews=calls.filter(c=>c.path.endsWith("/preview")&&JSON.parse(c.options.body).inboxId==="i");assert.ok(previews.length>=1);for(const c of previews)assert.equal(JSON.parse(c.options.body).storeId,"s");const preview=JSON.parse(previews.at(-1).options.body);assert.equal(preview.message,"Check original");assert.equal(preview.inboxId,"i");
  pdfWindow.querySelector("[data-minimize]").click();await openPosInvoiceAssistant("o",order,null,api,{inboxId:"i",storeId:"s"});assert.equal(document.querySelector("[data-pages]"),pdfWindow.querySelector("[data-pages]"));assert.equal(calls.filter(c=>c.path.includes("inboxId=i")).length,1);
  const stale=openPosInvoiceAssistant("o",order,null,api,{inboxId:"late",storeId:"s"});await tick();await openPosInvoiceAssistant("o",order,null,api);resolveStale({document:{totalGross:0},pages:[]});await stale;await tick();assert.equal(document.querySelector("[data-pages] canvas").dataset.source,photo);
  assert.equal(calls.some(c=>["PUT","PATCH","DELETE"].includes(c.options.method)),false);
  assert.ok(calls.filter(c=>c.options.method==="POST").every(c=>c.path.endsWith("/preview")));
  document.querySelector("[data-close]").click();await tick();assert.equal(document.querySelector("[data-invoice-assistant-restore]"),null);
 }finally{dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
