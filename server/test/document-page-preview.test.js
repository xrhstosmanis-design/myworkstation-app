import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {existsSync} from "node:fs";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const original="data:image/png;base64,iVBORw0KGgo=",processed="data:image/jpeg;base64,/9j/2Q==";
test("mounted original-image preview is explicit, local, bounded and scope/source fenced",async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/store/DocumentPagePreview.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"}});
  const module={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const Preview=module.exports.default;
  const dom=new JSDOM("<div id=root></div>",{url:"https://myworkstation-app.onrender.com"}),saved=new Map();let calls=0;
  for(const name of ["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT","fetch"]){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==="IS_REACT_ACT_ENVIRONMENT"?true:name==="fetch"?()=>{calls++;throw Error("Preview cannot call a backend")}:dom.window[name]})}
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
  const page=Object.freeze({originalDataUrl:original,dataUrl:processed,file:Object.freeze({name:"clean.jpg"})});
  const render=async(page,scopeKey="A")=>React.act(async()=>root.render(React.createElement(Preview,{page,index:0,scopeKey})));
  const click=async text=>React.act(async()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent===text||b.getAttribute("aria-label")===text);assert.ok(b,text);b.click()});
  try{
    await render(page);assert.equal(document.querySelector("img"),null);assert.equal(document.querySelector("button").getAttribute("aria-expanded"),"false");
    await click("Προεπισκόπηση σελίδας 1");assert.equal(document.querySelector("img").getAttribute("src"),original);assert.equal(document.querySelector("img").style.width,"100%");
    await click("Μεγέθυνση εικόνας");assert.equal(document.querySelector("img").style.width,"150%");
    for(let i=0;i<12;i++)await click("Μεγέθυνση εικόνας");assert.equal(document.querySelector("img").style.width,"400%");
    await click("Προσαρμογή πλάτους");assert.equal(document.querySelector("img").style.width,"100%");
    for(let i=0;i<5;i++)await click("Σμίκρυνση εικόνας");assert.equal(document.querySelector("img").style.width,"50%");
    await render(page,"B");assert.equal(document.querySelector("img"),null);
    await click("Προεπισκόπηση σελίδας 1");await render({dataUrl:processed},"B");assert.equal(document.querySelector("img"),null);
    await click("Προεπισκόπηση σελίδας 1");assert.equal(document.querySelector("img").getAttribute("src"),processed);
    await React.act(async()=>document.querySelector("img").dispatchEvent(new dom.window.Event("error")));assert.match(document.querySelector('[role="alert"]').textContent,/παραμένει στη φόρμα/);
    await click("Κλείσιμο προεπισκόπησης");assert.equal(document.querySelector("img"),null);
    for(const dataUrl of ["https://example.com/image.jpg","data:application/pdf;base64,JVBERg==","data:image/svg+xml;base64,PHN2Zz4=","javascript:alert(1)"]){await render({dataUrl});assert.equal(document.querySelector("button"),null)}
    await render({originalDataUrl:"https://example.com/private.jpg",dataUrl:processed});assert.equal(document.querySelector("button"),null,"Unsupported original cannot silently show the processed image");
    assert.equal(page.originalDataUrl,original);assert.equal(page.dataUrl,processed);assert.equal(calls,0);await React.act(async()=>root.unmount());assert.equal(document.querySelector("img"),null);
  }finally{dom.window.close();for(const [name,prior] of saved){if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name]}}
});

test("actual Premium Fast parent previews its retained page without repeating header or payment calls",async()=>{
  const entry=fileURLToPath(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url));
  const output=await build({entryPoints:[entry],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"},plugins:[{name:"isolated-media-and-reader",setup(b){
    b.onResolve({filter:/^\./},args=>args.importer===entry&&args.path!=="./DocumentPagePreview.jsx"?{path:args.path,namespace:"fixture"}:undefined);
    b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>{
      let contents="export default function Stub(){return null}";
      if(args.path.includes("useCameraAcquisition"))contents="export default()=>({cancel(){},checkpoint(){return 0},current(){return true}})";
      else if(args.path.includes("camera-acquisition"))contents="export const captureCameraFrame=()=>{throw Error('No scan in preview test')}";
      else if(args.path.includes("DocumentScanButton"))contents="import React from 'react';export default({onFiles})=>React.createElement('button',{type:'button',onClick:()=>onFiles([globalThis.previewFixtureFile])},'Synthetic scanner page')";
      else if(args.path.includes("useMobileDocumentPhotos"))contents="export default()=>({pending:false})";
      else if(args.path.includes("document-image-quality"))contents="export const prepareDocumentFile=async file=>({file,changed:false,quality:{}})";
      else if(args.path.includes("invoice-fast-header-merge"))contents="export const mergeFastInvoiceHeaders=()=>({confidence:100})";
      else if(args.path.includes("invoice-fast-supplier-match"))contents="export const knownSupplierFromFastHeaders=()=>null";
      else if(args.path.includes("pos-uploaded-credit-cash"))contents="export const settleUploadedCredit=()=>{throw Error('No payment in preview test')}";
      else if(args.path==="icons")contents="export const Camera=()=>null,FileUp=()=>null,Wallet=()=>null";
      return{contents,loader:"js",resolveDir:fileURLToPath(new URL("../../client/src/components/store/",import.meta.url))};
    });
  }}]});
  const module={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const Parent=module.exports.default;
  const dom=new JSDOM("<div id=root></div>",{url:"https://myworkstation-app.onrender.com"}),saved=new Map();
  for(const name of ["window","document","navigator","HTMLElement","File","FileReader","IS_REACT_ACT_ENVIRONMENT","previewFixtureFile"]){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[name]})}
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),calls=[];
  globalThis.previewFixtureFile=new File([new Uint8Array([137,80,78,71])],"scanned-page.png",{type:"image/png"});
  const api=async(url)=>{calls.push(url);assert.equal(url,"/api/commerce/ai-reader/fast-header");return{}};
  const render=async id=>React.act(async()=>root.render(React.createElement(Parent,{key:id,store:{id},api,suppliers:[]})));
  const click=async text=>React.act(async()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent===text||b.getAttribute("aria-label")===text);assert.ok(b,text);b.click();await new Promise(r=>setTimeout(r,20))});
  try{
    await render("A");assert.equal(calls.length,0);await click("Synthetic scanner page");
    for(let i=0;i<50&&!document.querySelector('.document-page-preview');i++)await React.act(async()=>new Promise(r=>setTimeout(r,10)));
    assert.equal(calls.length,1);assert.match(document.body.textContent,/scanned-page.png/);assert.equal(document.querySelector("img"),null);
    await click("Προεπισκόπηση σελίδας 1");assert.equal(document.querySelector("img").getAttribute("src"),"data:image/png;base64,iVBORw==");
    await click("Μεγέθυνση εικόνας");await click("Κλείσιμο προεπισκόπησης");assert.equal(calls.length,1,"Viewing must not replay the existing header read or submit any payment");assert.match(document.body.textContent,/scanned-page.png/);
    await render("B");assert.equal(document.querySelector("img"),null);assert.equal(document.querySelector('.document-page-preview'),null);assert.equal(calls.length,1);await React.act(async()=>root.unmount());
  }finally{dom.window.close();for(const [name,prior]of saved){if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name]}}
});

const chrome=[process.env.CHROME_BIN,"/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].find(p=>p&&existsSync(p));
test("actual Chromium preview preserves full image and pointer access at desktop and narrow sizes",{skip:!chrome,timeout:60000},async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL("../e2e/document-page-preview-flow.mjs",import.meta.url))],{env:{...process.env,CHROME_BIN:chrome},timeout:55000,maxBuffer:1024*1024});
  assert.match(stdout,/Document page preview actual Chromium PASS 4 cases/);
});
