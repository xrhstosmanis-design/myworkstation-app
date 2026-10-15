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

const posted=f=>f.calls.filter(c=>c.path==="/api/transactions/stores/own"&&c.options?.method==="POST");
const inputFor=text=>[...document.querySelectorAll("label")].find(el=>el.textContent.startsWith(text)).querySelector("input,select");
async function payrollFilled(env,{kind="REST_DAY",reason="Εικονική αιτιολογία",hours="2.5"}={}){
 const {click,change,React}=env;
 if(!document.querySelector(".pos-payments-menu"))await click("Όλες οι πληρωμές");
 await click("Μισθοδοσία");await click("1");await click("0");
 await change(inputFor("Εργαζόμενος"),"employee");await change(inputFor("Περίοδος μισθοδοσίας"),"2026-10");
 await change(inputFor("Τύπος πληρωμής"),kind);await change(inputFor("Αιτιολογία"),reason);
 if(kind==="OVERTIME")await change(inputFor("Ώρες υπερωρίας"),hours);
 await React.act(async()=>[...document.querySelectorAll('input[type="checkbox"]')].find(x=>x.parentElement.textContent.includes("Δήλωση ευθύνης")).click());
}
function payrollFixture(options={}){
 const f=fixture(options),original=f.api;
 f.props.api=async(path,request)=>path.endsWith("/payroll-employees")?{items:[{id:"employee",fullName:"LAB ΕΡΓΑΖΟΜΕΝΟΣ"}]}:original(path,request);
 return f;
}
test("standalone payroll entry supports rest-day, advance and overtime without categories, with full reason",async()=>{
 const Modal=await component("StorePosPaymentsModal");
 for(const [kind,label] of [["REST_DAY","Εξόφληση ρεπό"],["ADVANCE","Προκαταβολή"],["OVERTIME","Υπερωρία"]])await environment(async env=>{
  const {React,root,click}=env,f=payrollFixture();await React.act(async()=>root.render(React.createElement(Modal,f.props)));
  await payrollFilled(env,{kind});
  assert.equal(inputFor("Τύπος πληρωμής").options.length,3);
  assert.equal(document.body.textContent.includes("Επιστροφή χρημάτων / αρνητικό έξοδο"),false);
  assert.equal(document.body.textContent.includes("Κατηγορία εξόδου"),false);
  assert.equal(Boolean(document.querySelector('input[type="number"]')),kind==="OVERTIME");
  await click("Καταχώριση μισθοδοσίας");assert.equal(posted(f).length,1);const payload=JSON.parse(posted(f)[0].options.body);
  assert.equal(payload.type,"OTHER_EXPENSE");assert.equal(payload.amount,10);assert.equal(payload.subtractFromShift,true);assert.equal(payload.paymentSource,"CASH_SHIFT");assert.equal(payload.evidenceMode,"NO_DOCUMENT");
  for(const text of ["LAB ΕΡΓΑΖΟΜΕΝΟΣ","2026-10",label,"Αιτιολογία: Εικονική αιτιολογία"])assert.ok(payload.description.includes(text),text);
  assert.equal(payload.description.includes("Ώρες: 2.5"),kind==="OVERTIME");assert.equal(f.closes,1);
 });
});
test("payroll blocks missing reason, employee, period, hours and cash authority before any POST",async()=>{
 const Modal=await component("StorePosPaymentsModal");
 for(const missing of ["reason","employee","period","hours","cash"])await environment(async env=>{
  const {React,root,click,change}=env,f=payrollFixture();await React.act(async()=>root.render(React.createElement(Modal,f.props)));await payrollFilled(env,{kind:"OVERTIME"});
  if(missing==="reason")await change(inputFor("Αιτιολογία"),"  ");if(missing==="employee")await change(inputFor("Εργαζόμενος"),"");if(missing==="period")await change(inputFor("Περίοδος μισθοδοσίας"),"");if(missing==="hours")await change(inputFor("Ώρες υπερωρίας"),"0");
  if(missing==="cash")await React.act(async()=>root.render(React.createElement(Modal,{...f.props,runtimeAccess:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:false}})));
  await click("Καταχώριση μισθοδοσίας");assert.equal(posted(f).length,0,missing);assert.equal(f.closes,0);assert.ok(document.body.textContent.includes(missing==="reason"?"Συμπλήρωσε αιτιολογία":missing==="employee"?"Επίλεξε εργαζόμενο":missing==="period"?"Επίλεξε περίοδο":missing==="hours"?"οι ώρες είναι υποχρεωτικές":"Δεν έχεις δικαίωμα πληρωμής"),missing);
 });
});
test("overtime hours are cleared on advance/rest-day; refund does not leak into payroll",async()=>{
 const Modal=await component("StorePosPaymentsModal");await environment(async env=>{
 const {React,root,click,change}=env,f=payrollFixture();await React.act(async()=>root.render(React.createElement(Modal,f.props)));
 await click("Λοιπά έξοδα");await React.act(async()=>document.querySelector('input[type="checkbox"]').click());await payrollFilled(env,{kind:"OVERTIME"});
 await change(inputFor("Τύπος πληρωμής"),"ADVANCE");assert.equal(document.querySelector('input[type="number"]'),null);await change(inputFor("Τύπος πληρωμής"),"OVERTIME");assert.equal(inputFor("Ώρες υπερωρίας").value,"");await change(inputFor("Τύπος πληρωμής"),"REST_DAY");await click("Καταχώριση μισθοδοσίας");assert.equal(JSON.parse(posted(f)[0].options.body).amount,10);
 });
});
test("revoked third-party permission hides payroll and prevents its write; failed POST stays open",async()=>{
 const Modal=await component("StorePosPaymentsModal");
 for(const revoke of [false,true])await environment(async env=>{
 const {React,root,click}=env,f=payrollFixture({fail:revoke?null:"/own"});await React.act(async()=>root.render(React.createElement(Modal,f.props)));await payrollFilled(env);
 if(revoke){await React.act(async()=>root.render(React.createElement(Modal,{...f.props,runtimeAccess:{supplierPayment:true,thirdPartyPayment:false,sameShiftPayments:true}})));assert.equal([...document.querySelectorAll("button")].some(x=>x.textContent==="Μισθοδοσία"),false);assert.equal(posted(f).length,0);}else{await click("Καταχώριση μισθοδοσίας");assert.equal(f.closes,0);assert.ok(document.body.textContent.includes("fixture save failed"));}
 });
});
test("legacy payroll category remains available with difference option and mandatory reason",async()=>{
 const Modal=await component("StorePosPaymentsModal");await environment(async env=>{
 const {React,root,change}=env,f=payrollFixture(),api=f.props.api;f.props.api=async(p,o)=>p==="/api/management/expense-categories"?{items:[{id:"payroll",description:"Μισθοδοσία"}]}:api(p,o);
 await React.act(async()=>root.render(React.createElement(Modal,{...f.props,initialPaymentType:"OTHER_EXPENSE"})));
 await change(inputFor("Κατηγορία εξόδου"),"payroll");assert.equal(inputFor("Τύπος πληρωμής").options.length,4);assert.ok(document.body.textContent.includes("Διαφορά μισθοδοσίας"));assert.equal(inputFor("Αιτιολογία").required,true);
 });
});

test("Payments opens three ordered submenus on every open and keeps each existing form",async()=>{
 const Modal=await component("StorePosPaymentsModal");await environment(async env=>{
  const {React,root,click,change}=env,f=payrollFixture();
  await React.act(async()=>root.render(React.createElement(Modal,f.props)));
  const choices=()=>[...document.querySelectorAll('.pos-payments-menu button')].map(x=>x.textContent);
  assert.deepEqual(choices(),["Πληρωμή προμηθευτή","Λοιπά έξοδα","Μισθοδοσία"]);
  assert.equal(document.querySelector('.pos-payment-form'),null);
  await click("Πληρωμή προμηθευτή");assert.ok(document.body.textContent.includes("Πληρωμή ανοιχτών τιμολογίων"));await click("Νέο τιμολόγιο");
  const supplierInput=document.querySelector('.pos-payments-section input');assert.ok(supplierInput);
  await click("Όλες οι πληρωμές");await click("Πληρωμή προμηθευτή");assert.equal(document.querySelector('.pos-payments-section input'),supplierInput,"returning to same section keeps supplier draft mounted");
  const video=document.createElement("video");document.querySelector('.pos-payments-section').append(video);await click("Όλες οι πληρωμές");assert.equal(document.querySelector('.pos-payments-menu'),null,"live camera cannot be hidden by returning to menu");video.remove();
  await click("Όλες οι πληρωμές");await React.act(async()=>{const late=document.createElement("video");document.querySelector('.pos-payments-section').append(late);await Promise.resolve()});assert.equal(document.querySelector('.pos-payments-menu'),null,"late camera activation reveals its section");document.querySelector('.pos-payments-section video').remove();
  await click("Όλες οι πληρωμές");await click("Λοιπά έξοδα");assert.ok(document.body.textContent.includes("Επιστροφή χρημάτων / αρνητικό έξοδο"));
  await click("Κατάθεση Τράπεζας");assert.ok(document.querySelector('.pos-payments-section'));await click("Όλες οι πληρωμές");await click("Λοιπά έξοδα");assert.equal([...document.querySelectorAll('.pos-payment-types button')].find(x=>x.textContent==="Κατάθεση Τράπεζας").getAttribute('aria-pressed'),'true');
  await click("Όλες οι πληρωμές");await click("Μισθοδοσία");await change(inputFor("Τύπος πληρωμής"),"OVERTIME");await change(inputFor("Ώρες υπερωρίας"),"3");
  await click("Όλες οι πληρωμές");await click("Μισθοδοσία");assert.equal(inputFor("Τύπος πληρωμής").value,"OVERTIME");assert.equal(inputFor("Ώρες υπερωρίας").value,"3");
  await React.act(async()=>root.render(null));await React.act(async()=>root.render(React.createElement(Modal,f.props)));assert.deepEqual(choices(),["Πληρωμή προμηθευτή","Λοιπά έξοδα","Μισθοδοσία"]);
  assert.equal(f.calls.filter(c=>c.options?.method==="POST").length,0,"navigation performs no payment or invoice write");
 });
});
test("submenu visibility preserves current rights and existing bank-deposit access",async()=>{
 const Modal=await component("StorePosPaymentsModal");
 for(const [supplierPayment,thirdPartyPayment] of [[false,false],[false,true],[true,false]])await environment(async env=>{
  const {React,root,click}=env,f=fixture();await React.act(async()=>root.render(React.createElement(Modal,{...f.props,runtimeAccess:{supplierPayment,thirdPartyPayment,sameShiftPayments:false}})));
  const choices=[...document.querySelectorAll('.pos-payments-menu button')].map(x=>x.textContent);
  assert.equal(choices.includes("Πληρωμή προμηθευτή"),supplierPayment);assert.equal(choices.includes("Μισθοδοσία"),thirdPartyPayment);
  if(!supplierPayment&&!thirdPartyPayment){assert.equal(choices.length,0);assert.match(document.body.textContent,/Δεν έχεις ενεργό δικαίωμα/)}
  if(supplierPayment&&!thirdPartyPayment){await click("Λοιπά έξοδα");assert.ok(document.body.textContent.includes("Κατάθεση Τράπεζας"));assert.equal([...document.querySelectorAll("button")].some(x=>x.textContent==="Καταχώριση εξόδου"),false);assert.equal(document.body.textContent.includes("Επιστροφή χρημάτων / αρνητικό έξοδο"),false)}
  assert.equal(f.calls.filter(c=>c.options?.method==="POST").length,0);
 });
});
