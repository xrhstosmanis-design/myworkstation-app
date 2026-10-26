import {createCanvas,Image as CanvasImage} from "@napi-rs/canvas";
import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import mobileRouter,{mobileUploads} from "../src/routes/mobile-invoice-upload.js";
import {photoPagesPdf,validatePhotoSelection,bundleDocumentPhotos} from "../../client/src/lib/document-photo-pdf.js";

const invoke=(method,body={},token="token")=>{
  let status=200,result;
  const res={status:n=>(status=n,res),type:()=>res,json:x=>(result=x,res),send:x=>(result=x,res)};
  mobileRouter.stack.find(layer=>layer.route?.methods[method]).route.stack[0].handle({params:{id:"session",token},body},res);
  return {status,result};
};
const newSession=(maxFiles=5)=>mobileUploads.set("session",{companyId:"fixture",storeId:"own",token:"token",expires:Date.now()+600000,maxFiles});
const validJpeg=(i=0,width=1000,height=700)=>{const canvas=createCanvas(width,height),ctx=canvas.getContext("2d");ctx.fillStyle=`rgb(${50+i*20},100,150)`;ctx.fillRect(0,0,width,height);return canvas.toBuffer("image/jpeg")};
const photo=i=>({dataUrl:`data:image/jpeg;base64,${Buffer.from("synthetic photo "+i).toString("base64")}`,filename:`page-${i}.jpg`,mimeType:"image/jpeg"});

test("mobile five-photo publication is ordered, atomic and safe on identical retry",()=>{
  newSession();
  for(let index=0;index<5;index++){
    const response=invoke("post",{...photo(index),batchId:"batch-fixture",index,total:5});assert.equal(response.status,200);
    assert.equal(Boolean(mobileUploads.get("session").dataUrl),index===4,"never publish a partial collection");
  }
  const session=mobileUploads.get("session");assert.deepEqual(session.files.map(file=>file.filename),[0,1,2,3,4].map(i=>`page-${i}.jpg`));
  assert.equal(invoke("post",{...photo(2),batchId:"batch-fixture",index:2,total:5}).status,200);
  assert.equal(session.files.length,5);assert.equal(invoke("post",{...photo(2),batchId:"different-batch",index:0,total:1}).status,409);
  assert.equal(invoke("post",{...photo(20),batchId:"batch-fixture",index:2,total:5}).status,409);
  assert.equal(session.files[2].dataUrl,photo(2).dataUrl);
});
test("mobile rejects sixth, unsupported, oversized, mixed-PDF, stale/token and out-of-order uploads before publication",()=>{
  newSession();assert.equal(invoke("post",{...photo(0),batchId:"batch-fixture",index:0,total:6}).status,400);
  assert.equal(invoke("post",{...photo(0),batchId:"batch-fixture",index:1,total:5}).status,409);
  assert.equal(invoke("post",{...photo(0),dataUrl:"data:text/html;base64,AA=="}).status,400);
  assert.equal(invoke("post",{...photo(0),dataUrl:"data:image/jpeg;base64,"+"A".repeat(4600000)}).status,400);
  assert.equal(invoke("post",{dataUrl:"data:application/pdf;base64,AA==",batchId:"batch-fixture",index:0,total:2}).status,400);
  assert.equal(invoke("post",photo(0),"foreign-token").status,404);
  mobileUploads.get("session").expires=Date.now()-1;assert.equal(invoke("post",photo(0)).status,404);assert.equal(invoke("get").status,404);
});
test("mobile legacy single-file clients and one-file remaining capacity keep working",()=>{
  newSession(1);assert.equal(invoke("post",photo(0)).status,200);assert.equal(mobileUploads.get("session").dataUrl,photo(0).dataUrl);
  assert.equal(invoke("post",{...photo(0),batchId:"batch-fixture",index:0,total:2}).status,400);
});
test("actual mobile page collects camera/gallery photos, reorders/removes and sends all once",async()=>{
  newSession();const html=invoke("get").result,dom=new JSDOM(html,{url:"https://fixture.test/mobile-invoice-upload/session/token",runScripts:"dangerously"});
  const win=dom.window,calls=[];win.Image=CanvasImage;win.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);const r=invoke("post",payload);return {ok:r.status===200,status:r.status,json:async()=>r.result}};
  const add=(id,numbers)=>{const input=win.document.getElementById(id);Object.defineProperty(input,"files",{configurable:true,value:numbers.map(i=>new win.File([validJpeg(i)],`page-${i}.jpg`,{type:"image/jpeg"}))});input.dispatchEvent(new win.Event("change"))};
  try{
    add("f",[0]);add("f",[1]);add("gallery",[2,3,4]);assert.match(win.document.getElementById("pages").textContent,/5\/5/);
    add("gallery",[5]);assert.match(win.document.getElementById("s").textContent,/μέχρι 5/);assert.equal(win.document.querySelectorAll("#pages div").length,5);
    win.document.querySelectorAll("#pages div")[1].querySelector("button").click();
    win.document.querySelectorAll("#pages div")[4].querySelectorAll("button")[2].click();add("f",[5]);
    await win.go();assert.deepEqual(calls.map(file=>file.filename),["page-1.jpg","page-0.jpg","page-2.jpg","page-3.jpg","page-5.jpg"]);
    assert.equal(new Set(calls.map(file=>file.batchId)).size,1);assert.deepEqual(calls.map(file=>file.index),[0,1,2,3,4]);assert.equal(mobileUploads.get("session").files.length,5);
    await win.go();assert.equal(calls.length,5,"completed send is not repeated");assert.equal(win.document.getElementById("send").disabled,true);
  }finally{dom.window.close()}
});
test("actual mobile page retains photos and reuses the same batch after a dropped response",async()=>{
  newSession();const dom=new JSDOM(invoke("get").result,{url:"https://fixture.test/mobile-invoice-upload/session/token",runScripts:"dangerously"}),win=dom.window,calls=[];win.Image=CanvasImage;let drop=true;
  win.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);const r=invoke("post",payload);if(payload.index===1&&drop){drop=false;throw Error("connection dropped")}return {ok:r.status===200,status:r.status,json:async()=>r.result}};
  try{const input=win.document.getElementById("gallery");Object.defineProperty(input,"files",{value:[0,1,2].map(i=>new win.File([validJpeg(i)],`p${i}.jpg`,{type:"image/jpeg"}))});input.dispatchEvent(new win.Event("change"));await win.go();assert.equal(mobileUploads.get("session").files,undefined);assert.equal(win.document.querySelectorAll("#pages div").length,3);assert.equal(win.document.getElementById("send").disabled,false);await win.go();assert.equal(mobileUploads.get("session").files.length,3);assert.equal(new Set(calls.map(row=>row.batchId)).size,1)}finally{dom.window.close()}
});
test("actual mobile page rejects low decoded resolution without an upload",async()=>{
  newSession();const dom=new JSDOM(invoke("get").result,{url:"https://fixture.test/mobile-invoice-upload/session/token",runScripts:"dangerously"}),win=dom.window;win.Image=CanvasImage;let uploads=0;win.fetch=async()=>{uploads++;throw Error("must not upload")};
  try{const input=win.document.getElementById("f");Object.defineProperty(input,"files",{value:[new win.File([validJpeg(0,320,240)],"small.jpg",{type:"image/jpeg"})]});input.dispatchEvent(new win.Event("change"));await win.go();assert.equal(uploads,0);assert.match(win.document.getElementById("s").textContent,/χαμηλή ανάλυση/);assert.equal(win.document.querySelectorAll("#pages div").length,1)}finally{dom.window.close()}
});

test("bundled PDF parses as five ordered image pages and rejects invalid selection/oversize before submission",async()=>{
  const {createCanvas}=await import("@napi-rs/canvas");
  const pages=[0,1,2,3,4].map(index=>{const width=40+index,height=60+index,canvas=createCanvas(width,height),ctx=canvas.getContext("2d");ctx.fillStyle=["red","blue","green","yellow","purple"][index];ctx.fillRect(0,0,width,height);return {bytes:new Uint8Array(canvas.toBuffer("image/jpeg")),width,height}});
  const pdf=photoPagesPdf(pages);
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");const doc=await getDocument({data:pdf,disableFontFace:true,useSystemFonts:true}).promise;
  try{assert.equal(doc.numPages,5);for(let index=0;index<5;index++){const page=await doc.getPage(index+1),viewport=page.getViewport({scale:1});assert.ok(Math.abs(viewport.height/viewport.width-(60+index)/(40+index))<.001);const ops=await page.getOperatorList();assert.ok(ops.fnArray.length>0)}}finally{await doc.destroy()}
  assert.throws(()=>validatePhotoSelection(Array(5).fill({type:"image/jpeg"}),[{type:"image/jpeg"}]),/μέχρι 5/);
  assert.throws(()=>validatePhotoSelection([{type:"application/pdf"}],[{type:"image/jpeg"}]),/Δεν συνδυάζονται/);
  const one={size:200,type:"application/pdf"};assert.equal(await bundleDocumentPhotos([one]),one);await assert.rejects(bundleDocumentPhotos([one],{maxBytes:100}),/υπερβαίνουν/);
});

async function form(name,{bundled=false}={}){
  const result=await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/store/${name}.jsx`,import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"},plugins:[{name:"isolated-quality",setup(b){if(bundled){b.onResolve({filter:/document-photo-pdf\.js$/},args=>args.namespace==="fixture"?{path:args.path,namespace:"file"}:{path:"bundle",namespace:"fixture"});b.onLoad({filter:/^bundle$/,namespace:"fixture"},()=>({contents:"export {validatePhotoSelection} from "+JSON.stringify(fileURLToPath(new URL("../../client/src/lib/document-photo-pdf.js",import.meta.url)))+"; export const bundleDocumentPhotos=(files,options)=>globalThis.__bundlePhotos(files,options);"}))}b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"fixture"}));b.onLoad({filter:/^icons$/,namespace:"fixture"},()=>({contents:"export const X=()=>null,Camera=()=>null,FileUp=()=>null,Wallet=()=>null,FileText=()=>null,Upload=()=>null;"}));b.onResolve({filter:/document-image-quality\.js$/},()=>({path:"quality",namespace:"fixture"}));b.onLoad({filter:/^quality$/,namespace:"fixture"},()=>({contents:"export async function prepareDocumentFile(file){return {file,quality:{ok:true}}}"}))}}]});const m={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
test("actual Basic, Premium and open-payment forms retain/count/order five photos and block the sixth",async()=>{
  for(const name of ["StoreSupplierInvoiceFast","StoreSupplierInvoicePremiumFast","StoreSupplierOpenInvoicePayment"]){
    const Form=await form(name),dom=new JSDOM("<div id='root'></div>",{url:"https://fixture.test"}),keys=["window","document","navigator","HTMLElement","File","FileReader","IS_REACT_ACT_ENVIRONMENT"],saved=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
    for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
    const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),messages=[],calls=[];
    const api=async(path,options)=>{calls.push({path,options});return {supplierId:"supplier",supplierName:"LAB",supplierTaxId:"123456789",documentNumber:"A-001",documentDate:"2026-10-11",totalGross:10,documentType:"INVOICE",confidence:95}};
    const select=async numbers=>React.act(async()=>{const input=document.querySelector('input[type="file"]');Object.defineProperty(input,"files",{configurable:true,value:numbers.map(i=>new File([`fixture ${i}`],`p${i}.jpg`,{type:"image/jpeg"}))});input.dispatchEvent(new dom.window.Event("change",{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20))});
    try{
      await React.act(async()=>root.render(React.createElement(Form,{api,store:{id:"own"},suppliers:[{id:"supplier",name:"LAB",taxId:"123456789"}],setMessage:value=>messages.push(value)})));
      await select([0,1,2,3,4]);assert.equal(document.querySelectorAll('[title="Αφαίρεση σελίδας"]').length,5,name);assert.match(document.body.textContent,/5\/5/);
      assert.equal([...document.querySelectorAll("button")].find(button=>button.textContent.includes("Λήψη")&&button.textContent.includes("κάμερα")).disabled,true);
      await select([5]);assert.equal(document.querySelectorAll('[title="Αφαίρεση σελίδας"]').length,5);assert.ok(messages.some(message=>message.includes("μέχρι 5")));
      await React.act(async()=>document.querySelectorAll('[title="Μετακίνηση πάνω"]')[1].click());assert.ok(document.body.textContent.indexOf("p1.jpg")<document.body.textContent.indexOf("p0.jpg"));
      await React.act(async()=>document.querySelectorAll('[title="Αφαίρεση σελίδας"]')[4].click());await select([5]);assert.equal(document.querySelectorAll('[title="Αφαίρεση σελίδας"]').length,5);assert.ok(document.body.textContent.includes("p5.jpg"));
      assert.ok(calls.every(call=>call.path.endsWith("/fast-header")),"selection never writes payment, handoff, inbox or job");
    }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
  }
});

test("phone QR polling appends a whole batch once and ignores cancelled/foreign-store late responses",async()=>{
  const Form=await form("StoreSupplierInvoiceFast");
  for(const mode of ["accept","cancel","store","unmount"]){
    const dom=new JSDOM("<div id='root'></div>",{url:"https://fixture.test"}),keys=["window","document","navigator","HTMLElement","File","FileReader","IS_REACT_ACT_ENVIRONMENT","setInterval","clearInterval"],saved=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
    for(const key of keys.filter(k=>!k.includes("Interval")))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
    const timers=new Map();let nextTimer=0,ready;const timerReady=new Promise(resolve=>ready=resolve);globalThis.setInterval=fn=>{timers.set(++nextTimer,fn);ready();return nextTimer};globalThis.clearInterval=id=>timers.delete(id);
    const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));let receive;const calls=[];
    const api=async(path,options)=>{calls.push({path,options});if(options?.method==="POST")return {id:"session",url:"https://fixture.test/mobile-invoice-upload/session/token"};return new Promise(resolve=>receive=resolve)};
    const render=storeId=>React.act(async()=>root.render(React.createElement(Form,{api,store:{id:storeId},setMessage:()=>{}})));
    try{
      await render("own");await React.act(async()=>{[...document.querySelectorAll("button")].find(button=>button.textContent==="QR από κινητό").click();await Promise.race([timerReady,new Promise((_,reject)=>setTimeout(()=>reject(Error("QR timer not created")),2000))])});
      assert.equal(JSON.parse(calls[0].options.body).storeId,"own");assert.equal(JSON.parse(calls[0].options.body).maxFiles,5);assert.equal(timers.size,1);
      const poll=[...timers.values()][0];let receiving;await React.act(async()=>{receiving=poll();await Promise.resolve()});
      if(mode==="cancel")await React.act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="Ακύρωση QR").click());
      if(mode==="store")await render("foreign");if(mode==="unmount")await React.act(async()=>root.render(null));
      await React.act(async()=>{receive({files:[0,1,2,3,4].map(photo)});await receiving;await new Promise(resolve=>setTimeout(resolve,20))});
      assert.equal(document.querySelectorAll('[title="Αφαίρεση σελίδας"]').length,mode==="accept"?5:0);assert.equal(timers.size,0);
      assert.equal(calls.filter(call=>call.options?.method==="POST").length,1,"QR never writes payment/inbox/job");
      if(mode==="accept"){await React.act(async()=>poll());assert.equal(calls.length,2,"completed session is not fetched twice")}
    }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
  }
});

test("five selected photos use one existing supplier payment with all pages retained",async()=>{
  for(const name of ["StoreSupplierInvoiceFast","StoreSupplierInvoicePremiumFast","StoreSupplierOpenInvoicePayment"]){
    const Form=await form(name,{bundled:true}),dom=new JSDOM("<div id='root'></div>",{url:"https://fixture.test"}),keys=["window","document","navigator","HTMLElement","File","FileReader","CustomEvent","IS_REACT_ACT_ENVIRONMENT","__bundlePhotos","setTimeout"],saved=keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]),nativeTimeout=globalThis.setTimeout;
    for(const key of keys.filter(k=>k!=="setTimeout"))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
    globalThis.setTimeout=(fn,ms,...args)=>ms===2000?0:nativeTimeout(fn,ms,...args);
    const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),calls=[],bundles=[];let completed=0,done;const savedPayment=new Promise(resolve=>done=resolve);
    globalThis.__bundlePhotos=async(files,options)=>{bundles.push({files:[...files],options});return new File(["%PDF-1.4 synthetic-five-page-attachment"],"photos.pdf",{type:"application/pdf"})};
    const api=async(path,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({path,body,method:options?.method});
      if(path.endsWith("/fast-header"))return {supplierId:"supplier",supplierName:"LAB",supplierTaxId:"123456789",documentNumber:"A-001",documentDate:"2026-10-11",totalGross:10,documentType:"INVOICE",confidence:95};
      if(path.includes("/supplier-open-invoices?"))return {items:[{id:"invoice",documentNumber:"A-001",outstandingAmount:10,storeName:"LAB"}]};
      if(path.endsWith("/fast-duplicate-check"))return {};
      if(path.endsWith("/fast-handoff"))return {jobId:"job"};
      if(path.endsWith("/supplier-settlements"))return {transaction:{id:"payment"},status:"PENDING_REVIEW"};
      if(path.endsWith("/inbox"))return {id:"inbox"};
      if(path.endsWith("/jobs"))return {id:"job"};
      if(path.endsWith("/ai-recheck"))return {result:{productLines:[{description:"FIXTURE",quantity:1,unitCost:10,netAmount:10,vatRate:0,grossAmount:10}]}};
      return {id:"payment"};
    };
    const change=(el,value)=>React.act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new dom.window.Event("change",{bubbles:true}));el.dispatchEvent(new dom.window.Event("input",{bubbles:true}))});
    try{
      await React.act(async()=>root.render(React.createElement(Form,{api,store:{id:"own"},suppliers:[{id:"supplier",name:"LAB",taxId:"123456789"}],setMessage:()=>{},onCompleted:()=>{completed++;done()}})));
      await change(document.querySelector("select"),"supplier");
      if(name.endsWith("Payment"))await change(document.querySelector('[aria-label="Ποσό για A-001"]'),"10");
      else if(name.endsWith("InvoiceFast"))await change(document.querySelector('input[inputmode="decimal"]'),"10");
      await React.act(async()=>{const input=document.querySelector('input[type="file"]');Object.defineProperty(input,"files",{value:[0,1,2,3,4].map(i=>new File([`fixture ${i}`],`p${i}.jpg`,{type:"image/jpeg"}))});input.dispatchEvent(new dom.window.Event("change",{bubbles:true}));await new Promise(resolve=>nativeTimeout(resolve,20))});
      if(name.includes("Premium")){await change([...document.querySelectorAll("select")].find(select=>[...select.options].some(option=>option.value==="INVOICE")),"INVOICE")}
      if(!name.endsWith("Payment"))await React.act(async()=>[...document.querySelectorAll("button")].find(button=>button.textContent==="ΠΛΗΡΩΜΕΝΟ").click());
      assert.equal(document.querySelector(".pos-primary-action").disabled,false,name);
      await React.act(async()=>{document.querySelector(".pos-primary-action").click();await Promise.race([savedPayment,new Promise((_,reject)=>nativeTimeout(()=>reject(Error("payment fixture did not complete")),2000))])});
      const payments=calls.filter(call=>call.method==="POST"&&call.path.startsWith("/api/transactions/stores/own"));assert.equal(payments.length,1,name);assert.equal(payments[0].body.supplierId,"supplier");assert.equal(completed,1);
      if(name.includes("Premium")){const handoff=calls.find(call=>call.path.endsWith("/fast-handoff"));assert.equal(handoff.body.paymentTransactionId,"payment");assert.deepEqual(handoff.body.pages.map(page=>page.filename),[0,1,2,3,4].map(i=>`p${i}.jpg`));assert.equal(bundles.length,0)}
      else{assert.equal(bundles.length,1);assert.deepEqual(bundles[0].files.map(file=>file.name),[0,1,2,3,4].map(i=>`p${i}.jpg`));
        const evidence=name.endsWith("Payment")?payments[0].body.attachment:calls.find(call=>call.path.endsWith("/inbox")&&call.method==="POST").body.file;assert.equal(evidence.filename,"photos.pdf");assert.match(evidence.dataUrl,/^data:application\/pdf;/);
        if(name.endsWith("Payment")){assert.deepEqual(payments[0].body.allocations,[{purchaseDocumentId:"invoice",amount:10}]);assert.equal(bundles[0].options.maxBytes,1200000)}else{assert.equal(calls.filter(call=>call.path.endsWith("/jobs")&&call.method==="POST").length,1)}
      }
    }finally{await React.act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
  }
});
