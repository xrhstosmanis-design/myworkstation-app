import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {applyDocumentCameraFocus,documentCameraFocusOptions} from "../../client/src/lib/document-camera-focus.js";

async function component(name){
  const output=await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/store/${name}.jsx`,import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"},plugins:[{name:"isolated-media",setup(b){
    b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"fixture"}));b.onLoad({filter:/^icons$/,namespace:"fixture"},()=>({contents:"export const X=()=>null,Camera=()=>null,FileUp=()=>null,FileText=()=>null,Upload=()=>null,Wallet=()=>null,Landmark=()=>null;"}));
    b.onResolve({filter:/^@zxing\/browser$/},()=>({path:"camera",namespace:"fixture"}));b.onLoad({filter:/^camera$/,namespace:"fixture"},()=>({contents:"export class BrowserQRCodeReader {decodeFromConstraints(...args){return globalThis.__paymentCamera(...args)}}"}));
    b.onResolve({filter:/document-image-quality\.js$/},()=>({path:"quality",namespace:"fixture"}));b.onLoad({filter:/^quality$/,namespace:"fixture"},()=>({contents:"export async function prepareDocumentFile(file){return {file,quality:{ok:true}}}"}));
  }}]});
  const m={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
async function environment(run){
  const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost"});
  const keys=["window","document","navigator","HTMLElement","File","FileReader","CustomEvent","localStorage","IS_REACT_ACT_ENVIRONMENT","__paymentCamera","setTimeout"],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),nativeTimeout=globalThis.setTimeout,polls=[];
  for(const k of keys)if(k!=="setTimeout")Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  globalThis.setTimeout=(fn,ms,...args)=>ms===2000?(polls.push(()=>fn(...args)),polls.length):nativeTimeout(fn,ms,...args);
  globalThis.FileReader=class{readAsDataURL(){this.result="data:application/pdf;base64,JVBERi1maXh0dXJl";queueMicrotask(()=>this.onload?.())}};
  dom.window.HTMLMediaElement.prototype.play=async()=>{};
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
  const change=async(el,value)=>React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));el.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
  const click=async(text)=>React.act(async()=>{const el=[...document.querySelectorAll("button")].find(x=>x.textContent.includes(text));assert.ok(el,text);el.click();await Promise.resolve()});
  const file=async(el)=>React.act(async()=>{Object.defineProperty(el,"files",{configurable:true,value:[new File(["fixture"],"proof.pdf",{type:"application/pdf"})]});el.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  try{await run({React,root,dom,change,click,file,polls})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
}
const qr={filename:"invoice.pdf",dataUrl:"data:application/pdf;base64,JVBERi1maXh0dXJl",pageCount:1,header:{supplierTaxId:"123456789",supplierName:"LAB SUPPLIER",documentNumber:"A-0012",documentDate:"2026-10-11",totalGross:11.3,documentType:"INVOICE"}};
const supplier={id:"supplier",name:"LAB SUPPLIER",taxId:"123456789"};
function fixture({premium=true,fail=null,duplicate=false,transaction=null,handoff=null}={}){
  const calls=[],messages=[];let callback,closes=0,changes=0,stops=0;
  const track={getCapabilities:()=>({}),stop:()=>stops++};
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]})}});
  globalThis.__paymentCamera=async(_c,video,cb)=>{video.srcObject={getTracks:()=>[track],getVideoTracks:()=>[track]};callback=cb;return {stop:()=>stops++}};
  const api=async(path,options)=>{
    calls.push({path,options});if(fail&&path.endsWith(fail))throw Error("fixture save failed");
    if(path.endsWith("/overview"))return {suppliers:[supplier],openSession:{openedAt:new Date().toISOString()}};
    if(path.endsWith("/access"))return {access:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true}};
    if(path.endsWith("/capability")){if(!premium)throw Error("no premium");return {}}
    if(path.endsWith("/qr-read"))return qr;
    if(path.includes("/supplier-open-invoices?"))return {items:[{id:"doc",documentNumber:"A-0012",outstandingAmount:11.3,storeName:"LAB"}]};
    if(path.endsWith("/supplier-settlements"))return {status:"PENDING_REVIEW",transaction:{id:"payment"}};
    if(path.endsWith("/fast-duplicate-check"))return duplicate?{paymentReused:true,paymentTransactionId:"old"}:{};
    if(path.endsWith("/fast-handoff"))return handoff?handoff():{jobId:"job"};
    if(path.endsWith("/inbox")&&options?.method==="POST")return {id:"inbox"};
    if(path.includes("/fast-status/"))return {reviewRequired:true,error:"fixture background review"};
    if(path==="/api/transactions/stores/own"&&options?.method==="POST")return transaction?transaction():{id:"payment"};
    if(path.endsWith("/bank-deposits")&&options?.method==="POST")return {status:"PENDING_PROOF"};
    return {items:[]};
  };
  return {api,calls,messages,track,get callback(){return callback},get closes(){return closes},get changes(){return changes},get stops(){return stops},props:{api,store:{id:"own",name:"LAB"},runtimeAccess:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true},onClose:()=>closes++,onChanged:()=>changes++,setMessage:x=>messages.push(x),setError:()=>{}}};
}

test("camera focus uses only supported modes/ranges and handles rejected or ended tracks",async()=>{
  const calls=[],settings={focusMode:"continuous",focusDistance:4},track={getCapabilities:()=>({focusMode:["continuous","manual"],focusDistance:{min:1,max:10,step:.5}}),getSettings:()=>settings,applyConstraints:async c=>{calls.push(c);Object.assign(settings,c.advanced[0])}};
  assert.deepEqual(documentCameraFocusOptions(track).manual,{min:1,max:10,step:.5});
  assert.equal(await applyDocumentCameraFocus(track),true);assert.equal(await applyDocumentCameraFocus(track,6),true);assert.equal(settings.focusDistance,6);
  for(const value of [0,11,NaN])assert.equal(await applyDocumentCameraFocus(track,value),false);assert.equal(calls.length,2);
  const single={getCapabilities:()=>({focusMode:["single-shot"]}),applyConstraints:async c=>calls.push(c)};assert.equal(await applyDocumentCameraFocus(single),true);assert.equal(calls.at(-1).advanced[0].focusMode,"single-shot");
  await applyDocumentCameraFocus({...single,getCapabilities:()=>({focusMode:["continuous","single-shot"]})},null,{refocus:true});assert.equal(calls.at(-1).advanced[0].focusMode,"single-shot");
  assert.equal(await applyDocumentCameraFocus({getCapabilities:()=>({}),applyConstraints:()=>assert.fail()}),false);
  assert.equal(await applyDocumentCameraFocus({...single,readyState:"ended"}),false);
  assert.equal(await applyDocumentCameraFocus({...single,applyConstraints:async()=>{throw Error("rejected")}}),false);
});

test("mounted focus controls provide refocus/manual adjustment, fixed-focus guidance and stale cleanup",async()=>{
  const Control=await component("DocumentCameraFocus");
  await environment(async({React,root,click,change})=>{
    const calls=[],settings={focusMode:"continuous",focusDistance:3},track={getCapabilities:()=>({focusMode:["continuous","manual"],focusDistance:{min:1,max:10,step:1}}),getSettings:()=>settings,applyConstraints:async c=>{calls.push(c);Object.assign(settings,c.advanced[0])}};
    await React.act(async()=>root.render(React.createElement(Control,{track})));assert.equal(calls.length,1);
    await change(document.querySelector('input[type="range"]'),7);assert.equal(settings.focusDistance,7);
    await click("Επανεστίαση");assert.equal(settings.focusMode,"continuous");
    await React.act(async()=>root.render(React.createElement(Control,{track:{getCapabilities:()=>({})}})));assert.equal(document.querySelector("button"),null);assert.match(document.body.textContent,/δεν προσφέρει έλεγχο εστίασης/);
    let resolve;await React.act(async()=>root.render(React.createElement(Control,{track:{getCapabilities:()=>({focusMode:["single-shot"]}),applyConstraints:()=>new Promise(r=>resolve=r)}})));
    await React.act(async()=>root.render(null));await React.act(async()=>resolve());assert.equal(document.body.textContent,"");
  });
});

test("actual Basic/Premium QR review stays open, durable payment closes before background OCR",async()=>{
  const Modal=await component("StorePosPaymentsModal");
  for(const premium of [false,true])await environment(async({React,root,click,polls})=>{
    const f=fixture({premium});await React.act(async()=>root.render(React.createElement(Modal,{...f.props,initialPaymentType:"SUPPLIER_PAYMENT"})));
    await click("Νέο τιμολόγιο");await click(premium?"Λήψη σελίδας από κάμερα":"Λήψη από κάμερα");await click("Σάρωση QR τιμολογίου");await React.act(async()=>f.callback({getText:()=>"https://provider"}));assert.equal(f.closes,0,"QR download is review, not successful payment");
    await click("ΠΛΗΡΩΜΕΝΟ");await click("ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ");assert.equal(f.closes,1);assert.ok(f.changes>=1);assert.equal(f.calls.filter(c=>c.path==="/api/transactions/stores/own"&&c.options?.method==="POST").length,1);
    if(premium){assert.ok(f.messages.some(x=>x.startsWith("⏳")));assert.equal(polls.length,1);await React.act(async()=>polls[0]());assert.equal(f.closes,1,"later OCR status cannot close a subsequent payment modal");}
    await React.act(async()=>root.unmount());assert.ok(f.stops>0);
  });
});

test("Premium duplicate cancellation and failed durable handoff never signal completion",async()=>{
  const Modal=await component("StorePosPaymentsModal");
  for(const duplicate of [true,false])await environment(async({React,root,click})=>{
    const f=fixture({duplicate,fail:duplicate?null:"/fast-handoff"});window.confirm=()=>false;
    await React.act(async()=>root.render(React.createElement(Modal,{...f.props,initialPaymentType:"SUPPLIER_PAYMENT"})));await click("Νέο τιμολόγιο");await click("Λήψη σελίδας από κάμερα");await click("Σάρωση QR τιμολογίου");await React.act(async()=>f.callback({getText:()=>"https://provider"}));await click("ΠΛΗΡΩΜΕΝΟ");await click("ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ");
    assert.equal(f.closes,0);assert.equal(f.calls.filter(c=>c.path==="/api/transactions/stores/own"&&c.options?.method==="POST").length,duplicate?0:1);if(!duplicate)assert.ok(f.messages.some(x=>x.includes("fixture save failed")));
  });
});

test("open invoice payment and bank deposit close only after POST, not photo-quality success",async()=>{
  const Modal=await component("StorePosPaymentsModal");
  for(const bank of [false,true])for(const fail of [false,true])await environment(async({React,root,click,change,file})=>{
    const f=fixture({fail:fail?(bank?"/bank-deposits":"/supplier-settlements"):null});await React.act(async()=>root.render(React.createElement(Modal,{...f.props,initialPaymentType:bank?"BANK_DEPOSIT":"SUPPLIER_PAYMENT"})));
    if(bank){await change(document.querySelector('input[inputmode="decimal"]'),"10");await change([...document.querySelectorAll("label")].find(x=>x.textContent==="Καταθέτης").querySelector("input"),"LAB OPERATOR");}
    else{await change(document.querySelector("select"),"supplier");await change(document.querySelector('[aria-label="Ποσό για A-0012"]'),"10");}
    await file(document.querySelector('input[type="file"]'));assert.equal(f.closes,0,"preparing evidence must not dismiss payment");
    await click(bank?"Καταχώριση κατάθεσης":"Καταχώριση πληρωμής προς έλεγχο");assert.equal(f.closes,fail?0:1);if(fail)assert.ok(f.messages.some(x=>x.includes("fixture save failed")));
  });
});

test("expense POST waits for acceptance and stale selected-store result cannot close another store",async()=>{
  const Modal=await component("StorePosPaymentsModal");
  for(const stale of [false,true])await environment(async({React,root,click,change})=>{
    let accept;const f=fixture({transaction:()=>new Promise(r=>accept=r)});await React.act(async()=>root.render(React.createElement(Modal,{...f.props,initialPaymentType:"OTHER_EXPENSE"})));
    await click("1");await click("0");await change([...document.querySelectorAll("label")].find(x=>x.textContent==="Παρατηρήσεις").querySelector("input"),"LAB expense");
    const ack=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>!x.checked&&x.parentElement.textContent.includes("Δηλώνω"));assert.ok(ack);await React.act(async()=>ack.click());
    await React.act(async()=>document.querySelector(".pos-primary-action").click());assert.equal(f.closes,0);assert.ok(accept);
    if(stale)await React.act(async()=>root.render(React.createElement(Modal,{...f.props,store:{id:"other",name:"OTHER"}})));
    await React.act(async()=>accept({id:"payment"}));assert.equal(f.closes,stale?0:1);assert.equal(f.calls.filter(c=>c.path==="/api/transactions/stores/own"&&c.options?.method==="POST").length,1);
  });
});
