import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {reportRecipientListSchema} from "../src/services/report-recipients.js";

test("recipient form adds/removes validated addresses, saves existing API format and isolates stores",async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/platform/ReportRecipientFields.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
  const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const root=createRoot(document.getElementById("root"));
  const render=(store,value,disabled=false)=>act(async()=>root.render(React.createElement("form",null,React.createElement(module.exports.default,{key:store,defaultValue:value,disabled}))));
  const inputs=()=>[...document.querySelectorAll('input[type="email"]')];
  const button=label=>[...document.querySelectorAll("button")].find(b=>b.textContent===label);
  const serialized=()=>new dom.window.FormData(document.querySelector("form")).get("responsibleEmail");
  const change=async(index,value)=>act(async()=>{
    const input=inputs()[index];Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);
    input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  });
  try{
    await render("companyA:storeA"," OWNER@example.gr, manager@example.gr ");
    assert.equal(inputs().length,2);assert.equal(serialized(),"OWNER@example.gr, manager@example.gr");
    await act(async()=>button("+ Προσθήκη email").click());
    await change(2,"third@example.gr");
    assert.equal(reportRecipientListSchema.parse(serialized()),"owner@example.gr, manager@example.gr, third@example.gr");
    await act(async()=>document.querySelector('[aria-label="Αφαίρεση παραλήπτη 2"]').click());
    assert.equal(serialized(),"OWNER@example.gr, third@example.gr");
    await change(1,"not-an-email");assert.equal(document.querySelector("form").checkValidity(),false);
    await change(1,"OWNER@example.gr");assert.equal(reportRecipientListSchema.parse(serialized()),"owner@example.gr");
    // Reopening uses saved normalized values; another store must discard unsaved recipients.
    await render("companyA:storeB","");assert.equal(inputs().length,1);assert.equal(serialized(),"");
    assert.doesNotMatch(document.body.textContent,/third@example/);
    for(let i=1;i<10;i++)await act(async()=>button("+ Προσθήκη email").click());
    assert.equal(inputs().length,10);assert.equal(button("+ Προσθήκη email").disabled,true);
    await render("companyA:storeB","",true);
    assert.equal(document.querySelector("fieldset").disabled,true);
    assert.equal(inputs()[0].matches(":disabled"),true);
    await render("companyA:storeA-reopened","owner@example.gr, third@example.gr");
    assert.equal(inputs().length,2);assert.equal(serialized(),"owner@example.gr, third@example.gr");
    await act(async()=>document.querySelector('[aria-label="Αφαίρεση παραλήπτη 2"]').click());
    await act(async()=>document.querySelector('[aria-label="Αφαίρεση παραλήπτη 1"]').click());
    assert.equal(inputs().length,1);assert.equal(serialized(),"");
    assert.equal(dom.window.localStorage.length,0);
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
});

test("existing store save keeps the same selected-company/store API and recipient field",async()=>{
  const source=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
  assert.match(source,/ReportRecipientFields key=\{`\$\{storeCompany.id\}:\$\{storeEdit.id\}`\}/);
  assert.match(source,/responsibleEmail:form.get\("responsibleEmail"\)/);
  assert.match(source,/\/api\/platform\/companies\/\$\{storeCompany.id\}\/stores\/\$\{storeEdit.id\}/);
});
