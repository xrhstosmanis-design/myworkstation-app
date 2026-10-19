import test from "node:test";
import assert from "node:assert/strict";

test("owner buttons use IDs, reveal only linked stores and derive new groups from refreshed props",async()=>{
 const {build}=await import("esbuild"),{JSDOM}=await import("jsdom"),{createRequire}=await import("node:module"),{fileURLToPath}=await import("node:url");
 const result=await build({stdin:{contents:'export {default} from "./client/src/components/platform/PlatformCompanyWorkspace.jsx";',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom/client","react/jsx-runtime"]});
 const module={exports:{}};new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>'),keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
 const a={id:"a",fullName:"Ίδιο Όνομα",email:"a@example.invalid"},b={id:"b",fullName:"Ίδιο Όνομα",email:"b@example.invalid"};
 const c=(id,owner,name)=>({id,name:"Εταιρεία "+id,owner,active:true,stores:[{id:"store-"+id,name}]});
 let owners=[a,b],companies=[c("one",a,"Κατάστημα Άλφα"),c("two",a,"Κατάστημα Βήτα"),c("three",b,"Άλλο κατάστημα"),c("orphan",null,"Χωρίς σύνδεση")];
 const render=()=>act(async()=>root.render(React.createElement(module.exports.default,{owners,companies,renderManagement:company=>React.createElement("span",{"data-selected":company.id},company.name),onNewOwnerCompany:()=>{}})));
 const toggles=()=>[...document.querySelectorAll(".platform-owner-toggle")],click=el=>act(async()=>el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));
 const search=value=>act(async()=>{const input=document.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
 try{
  await render();assert.equal(toggles().length,3);assert.equal(document.querySelectorAll(".platform-company-card").length,0);
  await click(toggles()[0]);assert.equal(toggles()[0].getAttribute("aria-expanded"),"true");assert.equal(document.querySelectorAll(".platform-company-card").length,2);
  assert.match(document.querySelector(".platform-owner-companies").textContent,/Κατάστημα Άλφα/);assert.doesNotMatch(document.querySelector(".platform-owner-companies").textContent,/Άλλο κατάστημα/);
  await click(document.querySelector('[aria-label="Διαχείριση Εταιρεία two"]'));assert.equal(document.querySelector("[data-selected]").dataset.selected,"two");
  assert.match(toggles()[1].textContent,/1 εταιρεία · 1 κατάστημα/);
  await click(toggles()[1]);assert.equal(document.querySelector("[data-selected]"),null);assert.equal(document.querySelectorAll(".platform-company-card").length,1);assert.match(document.querySelector(".platform-owner-companies").textContent,/Άλλο κατάστημα/);
  await click(toggles()[1]);assert.equal(document.querySelectorAll(".platform-company-card").length,0);
  await search("αλφα");assert.equal(toggles().length,1);await click(toggles()[0]);assert.equal(document.querySelectorAll(".platform-company-card").length,1);
  await search("");await click(toggles()[2]);assert.match(document.querySelector(".platform-owner-companies").textContent,/Χωρίς σύνδεση/);
  const next={id:"new",fullName:"Νέος ιδιοκτήτης",email:"new@example.invalid"};owners=[...owners,next];companies=[...companies,c("newco",next,"Νέο κατάστημα")];await render();assert.equal(toggles().length,4);
  await click(toggles()[2]);assert.match(document.querySelector(".platform-owner-companies").textContent,/Νέο κατάστημα/);
  companies=companies.map(company=>company.id==="newco"?{...company,stores:[...company.stores,{id:"store-next",name:"Δεύτερο νέο"}]}:company);await render();assert.match(document.querySelector(".platform-owner-companies").textContent,/Δεύτερο νέο/);
  await click(document.querySelector('[aria-label="Διαχείριση Εταιρεία newco"]'));companies=companies.filter(company=>company.id!=="newco");await render();assert.equal(document.querySelector("[data-selected]"),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
