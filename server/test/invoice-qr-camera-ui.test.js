import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

async function component(name){
  const compiled=await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/store/${name}.jsx`,import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"},plugins:[{name:"mock-invoice-camera",setup(b){b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"fixture"}));b.onLoad({filter:/^icons$/,namespace:"fixture"},()=>({contents:"export const X=()=>null,Camera=()=>null,FileUp=()=>null,Wallet=()=>null;"}));b.onResolve({filter:/^@zxing\/browser$/},()=>({path:"camera",namespace:"fixture"}));b.onLoad({filter:/^camera$/,namespace:"fixture"},()=>({contents:'export class BrowserQRCodeReader { decodeFromConstraints(...args){return globalThis.__invoiceCameraFixture(...args)} }'}));}}]});
  const m={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
async function environment(run){
  const dom=new JSDOM("<div id='root'></div>");
  const keys=["window","document","navigator","HTMLElement","File","IS_REACT_ACT_ENVIRONMENT","__invoiceCameraFixture"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  dom.window.HTMLMediaElement.prototype.play=async()=>{};
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
  try{await run({React,root,dom})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
}
const fixture={filename:"virtual-invoice.pdf",dataUrl:"data:application/pdf;base64,"+Buffer.from("%PDF-fixture").toString("base64"),pageCount:2,header:{supplierTaxId:"123456789",supplierName:"LAB SUPPLIER",documentNumber:"A-0012",documentDate:"2026-10-11",totalGross:11.3,documentType:"INVOICE"}};

test("QR camera reads once and ignores late download after close/store change",async()=>{
  const Camera=await component("InvoiceQrCamera");
  await environment(async({React,root})=>{
    let callback,resolveControls,resolveDownload,stops=0,calls=0;const reads=[];
    globalThis.__invoiceCameraFixture=(constraints,video,cb)=>{assert.equal(constraints.audio,false);assert.equal(video.tagName,"VIDEO");callback=cb;return new Promise(done=>resolveControls=done)};
    const api=async(path,options)=>{calls++;assert.equal(path,"/api/commerce/documents/qr-read");assert.equal(JSON.parse(options.body).storeId,"own");return new Promise(done=>resolveDownload=done)};
    const render=id=>React.act(async()=>root.render(React.createElement(Camera,{api,store:{id,name:"LAB"},onRead:x=>reads.push(x),onClose:()=>{}})));
    await render("own");await React.act(async()=>{callback({getText:()=>"https://qr"});callback({getText:()=>"second"});});assert.equal(calls,1);
    await React.act(async()=>resolveControls({stop:()=>stops++}));assert.equal(stops,1);
    await React.act(async()=>root.render(null));await React.act(async()=>resolveDownload(fixture));assert.equal(reads.length,0);
    await render("own");await React.act(async()=>{callback({getText:()=>"https://qr"});});const oldResult=resolveDownload,oldControls=resolveControls;
    await render("other");await React.act(async()=>{oldResult(fixture);oldControls({stop:()=>stops++})});assert.equal(reads.length,0,"previous selected-store response cannot fill the new store");
    await React.act(async()=>root.render(null));const before=stops;await React.act(async()=>resolveControls({stop:()=>stops++}));assert.equal(stops,before+1,"late camera startup releases tracks");
  });
});

test("QR camera preserves fallback on unsupported QR and permission failure",async()=>{
  const Camera=await component("InvoiceQrCamera");
  await environment(async({React,root})=>{
    let callback;globalThis.__invoiceCameraFixture=async(_c,_v,cb)=>{callback=cb;return {stop(){}}};
    const render=api=>React.act(async()=>root.render(React.createElement(Camera,{api,store:{id:"own",name:"LAB"},onRead:()=>assert.fail("no unsafe fill"),onClose:()=>{}})));
    await render(async()=>{throw Error("Χρησιμοποίησε φωτογραφία ή PDF.")});await React.act(async()=>callback({getText:()=>"unsupported"}));assert.match(document.querySelector('[role="alert"]').textContent,/φωτογραφία ή PDF/);
    await React.act(async()=>root.render(null));globalThis.__invoiceCameraFixture=async()=>{throw Object.assign(Error("denied"),{name:"NotAllowedError"})};await render(async()=>assert.fail("no request without camera"));assert.match(document.querySelector('[role="alert"]').textContent,/Δεν δόθηκε άδεια κάμερας/);
  });
});

test("Basic/Premium camera intake fills reviewed fields and original PDF without any payment",async()=>{
  for(const name of ["StoreSupplierInvoiceFast","StoreSupplierInvoicePremiumFast"]){
    const Form=await component(name);
    await environment(async({React,root})=>{
      let callback,stops=0;const calls=[],messages=[];
      Object.defineProperty(navigator,"mediaDevices",{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})},configurable:true});
      globalThis.__invoiceCameraFixture=async(_c,_v,cb)=>{callback=cb;return {stop:()=>stops++}};
      const api=async(path,options)=>{calls.push({path,options});assert.equal(path,"/api/commerce/documents/qr-read","scan must not submit payment/handoff/job");return fixture};
      await React.act(async()=>root.render(React.createElement(Form,{api,store:{id:"own",name:"LAB"},suppliers:[{id:"supplier",name:"LAB SUPPLIER",taxId:"123456789"}],setMessage:x=>messages.push(x)})));
      const button=text=>[...document.querySelectorAll("button")].find(x=>x.textContent.includes(text));
      await React.act(async()=>button(name.endsWith("PremiumFast")?"Λήψη σελίδας από κάμερα":"Λήψη από κάμερα").click());
      assert.ok(button("Φωτογράφιση"),"ordinary photo action remains available");
      await React.act(async()=>button("Σάρωση QR τιμολογίου").click());
      await React.act(async()=>{await callback({getText:()=>"https://provider-qr"});await callback({getText:()=>"repeat"})});
      assert.equal(calls.length,1);assert.ok(stops>=1);assert.equal(document.querySelector('[aria-label="Σάρωση QR τιμολογίου"]'),null);
      assert.equal(document.querySelector("select").value,"supplier");
      const inputs=[...document.querySelectorAll("input")];assert.ok(inputs.some(x=>x.value==="11,30"));assert.ok(inputs.some(x=>x.value==="A-0012"));assert.ok(inputs.some(x=>x.value==="2026-10-11"));
      assert.ok(document.body.textContent.includes("virtual-invoice.pdf"));assert.equal(button("ΠΛΗΡΩΜΕΝΟ").getAttribute("aria-pressed"),"false");assert.equal(button("ΜΕ ΠΙΣΤΩΣΗ").getAttribute("aria-pressed"),"false");assert.equal(document.querySelector(".pos-primary-action").disabled,true);
    });
  }
});


test("scanner in both payment forms reads exact URL once without camera or payment",async()=>{
  for(const name of ["StoreSupplierInvoiceFast","StoreSupplierInvoicePremiumFast"]){
    const Form=await component(name);
    await environment(async({React,root,dom})=>{
      const calls=[];let resolve;
      globalThis.__invoiceCameraFixture=()=>assert.fail("scanner must not start camera");
      const api=async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});assert.equal(path,"/api/commerce/documents/qr-read");return new Promise(done=>resolve=done)};
      await React.act(async()=>root.render(React.createElement(Form,{api,store:{id:"own",name:"LAB"},suppliers:[{id:"supplier",taxId:"123456789",name:"LAB SUPPLIER"}]})));
      const button=text=>[...document.querySelectorAll("button")].find(x=>x.textContent.includes(text));
      await React.act(async()=>button("Σάρωση QR με scanner").click());
      const input=document.querySelector('[aria-label="QR / σύνδεσμος τιμολογίου"]');assert.equal(document.activeElement,input);
      const url="https://einvoice.impact.gr/p/EL123456789/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
      await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,url);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
      let bubbled=0;const listener=()=>bubbled++;document.addEventListener("keydown",listener);
      await React.act(async()=>{for(let i=0;i<2;i++){const event=new dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true});input.dispatchEvent(event);assert.equal(event.defaultPrevented,true)}});
      document.removeEventListener("keydown",listener);assert.equal(bubbled,0);assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{storeId:"own",url});
      await React.act(async()=>resolve(fixture));assert.equal(document.querySelector('[aria-label="QR τιμολογίου με scanner"]'),null);
      assert.ok(document.body.textContent.includes("virtual-invoice.pdf"));assert.equal(document.querySelector("select").value,"supplier");assert.equal(button("ΠΛΗΡΩΜΕΝΟ").getAttribute("aria-pressed"),"false");assert.equal(document.querySelector(".pos-primary-action").disabled,true);
    });
  }
});

test("scanner rejects unsafe response, retries and discards closed or previous-store results",async()=>{
 const Scanner=await component("InvoiceQrScanner");
 await environment(async({React,root,dom})=>{
   let resolve,calls=0;const reads=[];
   const api=async()=>{calls++;return new Promise(done=>resolve=done)};
   const render=id=>React.act(async()=>root.render(React.createElement(Scanner,{api,store:{id,name:"LAB"},onRead:x=>reads.push(x),onClose:()=>root.render(null)})));
   const scan=async()=>React.act(async()=>{const input=document.querySelector("input");Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,"https://einvoice.impact.gr/p/EL123456789/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));input.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));});
   await render("own");await scan();await React.act(async()=>resolve({header:{},dataUrl:"data:text/html;base64,AA=="}));assert.match(document.querySelector('[role="alert"]').textContent,/ασφαλές PDF/);assert.equal(reads.length,0);
   await scan();const old=resolve;await render("other");await React.act(async()=>old(fixture));assert.equal(reads.length,0);assert.equal(document.querySelector("input").value,"");
   await scan();await React.act(async()=>document.querySelector('[aria-label="Κλείσιμο scanner"]').click());await React.act(async()=>resolve(fixture));assert.equal(reads.length,0);assert.equal(calls,3);
 });
});


test("scanner preserves native rapid input through rerenders, Greek keys and Tab suffix",async()=>{
 const Scanner=await component("InvoiceQrScanner");
 await environment(async({React,root,dom})=>{
  const calls=[];const api=async(path,options)=>{calls.push(JSON.parse(options.body));return fixture};
  const render=()=>React.act(async()=>root.render(React.createElement(Scanner,{api,store:{id:"own",name:"LAB"},onRead:()=>{},onClose:()=>{}})));
  await render();const input=document.querySelector("input");assert.equal(input.dataset.keyboard,"off");
  // The browser may deliver native input before a React render observes it.
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set;
  setter.call(input,"https://einvoice.impact.gr/p/EL123456789/");await render();assert.equal(input.value,"https://einvoice.impact.gr/p/EL123456789/");
  const greek={A:"Α",B:"Β",C:"Ψ",D:"Δ",E:"Ε",F:"Φ"};
  const token="ABCDEF".repeat(6)+"ABCD";
  await React.act(async()=>{for(const char of token){const event=new dom.window.KeyboardEvent("keydown",{key:greek[char],code:"Key"+char,bubbles:true,cancelable:true});input.dispatchEvent(event);assert.equal(event.defaultPrevented,true)}});
  await React.act(async()=>{setter.call(input,input.value+"/"+"B".repeat(32));input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
  await React.act(async()=>{const event=new dom.window.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true});input.dispatchEvent(event);assert.equal(event.defaultPrevented,true)});
  assert.equal(calls.length,1);assert.equal(calls[0].url,"https://einvoice.impact.gr/p/EL123456789/"+token+"/"+"B".repeat(32));
 });
});

test("numeric/truncated scanner input makes no request and explicit clear allows exact pasted URL",async()=>{
 const Scanner=await component("InvoiceQrScanner");
 await environment(async({React,root,dom})=>{
  const calls=[];const api=async(path,options)=>{calls.push(JSON.parse(options.body));return fixture};
  await React.act(async()=>root.render(React.createElement(Scanner,{api,store:{id:"own",name:"LAB"},onRead:()=>{},onClose:()=>{}})));
  const input=document.querySelector("input"),setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set;
  const enter=()=>input.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
  for(const value of ["6225119","https://einvoice.impact.gr/p/EL123456789/ABCD"]){await React.act(async()=>{setter.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));enter()});assert.equal(calls.length,0);assert.ok(document.querySelector('[role="alert"]'));assert.equal(input.value,value);}
  await React.act(async()=>[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Καθαρισμός")).click());assert.equal(input.value,"");assert.equal(document.activeElement,input);
  const url="https://einvoice.impact.gr/p/EL123456789/"+"a".repeat(40)+"/"+"B".repeat(32);
  await React.act(async()=>{setter.call(input,url);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));enter()});assert.equal(calls.length,1);assert.equal(calls[0].url,url);
 });
});


test("Greek physical key recovery is scoped and preserves Latin, paste and modifier shortcuts",async()=>{
 const {invoiceScannerAsciiKey:key,invoiceScannerInputError:error}=await import("../../client/src/lib/invoice-scanner-input.js");
 assert.equal(key({key:"η",code:"KeyH"}),"h");assert.equal(key({key:"Ψ",code:"KeyC"}),"C");assert.equal(key({key:";",code:"KeyQ"}),"q");assert.equal(key({key:"Dead",code:"Semicolon",shiftKey:true}),":");
 for(const e of [{key:"C",code:"KeyC"},{key:"/",code:"Slash"},{key:"ψ",code:"KeyC",ctrlKey:true},{key:"ψ",code:"KeyC",isComposing:true},{key:"ψ",code:"Unidentified"}])assert.equal(key(e),null);
 assert.match(error("6225119"),/μόνο αριθμό/);assert.match(error("https://εινvoice.impact.gr/p/test"),/ελληνικούς/);assert.match(error("https://einvoice.impact.gr/p/EL123456789/"+"A".repeat(40)),/ελλιπής/);
 assert.equal(error("https://einvoice.s1ecos.gr/p/EL123456789/"+"a".repeat(40)+"/"+"B".repeat(32)),"");assert.equal(error("https://einvoice.impact.gr/v/EL123456789-123-"+"A".repeat(40)+"-"+"B".repeat(32)),"");
});
