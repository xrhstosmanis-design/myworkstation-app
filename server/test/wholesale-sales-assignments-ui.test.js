import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const unusedCustomers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const unusedLists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/WholesaleSalesAssignments.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run,initialProps={}){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  let props={api,customers:[{id:"customer-a",name:"Own customer"}],stores:[{id:"store-a",name:"Own store"},{id:"store-b",name:"Second store"}],activeStoreId:"",...initialProps};
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{...props})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,input:async(element,value)=>act(async()=>{const proto=element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))}),rerender:async(next)=>{props={...props,...next};await render()},remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const user={id:'seller-a',fullName:'Own seller',email:'seller@example.invalid',memberActive:false,membershipRevision:0};
const assignment={id:'assignment-a',customerId:'customer-a',customerName:'Own customer',storeId:'store-a',storeName:'Own store',active:true,revision:3};
const read=path=>path.includes('/users?')?{items:[user],total:1}:path.includes('/assignments?')?{items:[assignment],total:1}:Promise.reject(Error(path));
test('manager membership uses expected revision; assignments require explicit store and immutable tuple',async()=>{
 const writes=[];let active=false;const api=async(path,options)=>{if(options?.method){writes.push({path,body:JSON.parse(options.body)});active=true;return {ok:true}}if(path.includes('/users?'))return {items:[{...user,memberActive:active,membershipRevision:active?1:0}],total:1};return read(path)};
 await mounted(api,async ctx=>{await ctx.click('Ενεργοποίηση πωλητή · Own seller');assert.deepEqual(writes[0].body,{active:true,expectedRevision:0});await ctx.click('Αναθέσεις · Own seller');assert.equal(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]').value,'');await ctx.change(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]'),'store-a');await ctx.click('Ανάκληση · Own customer');assert.deepEqual(writes[1].body,{customerId:'customer-a',storeId:'store-a',active:false,expectedRevision:3});assert.equal(document.querySelector('article select'),null)});
});
test('manager stale assignment409 reloads current revision without pretending a successful change',async()=>{
 let reads=0;const writes=[];const api=async(path,options)=>{if(options?.method){writes.push(JSON.parse(options.body));throw Object.assign(Error('stale'),{status:409})}if(path.includes('/assignments?')){reads++;return {items:[{...assignment,revision:reads===1?3:4}],total:1}}return read(path)};
 await mounted(api,async ctx=>{await ctx.click('Αναθέσεις · Own seller');await ctx.change(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]'),'store-a');await ctx.click('Ανάκληση · Own customer');assert.match(document.querySelector('[role="alert"]').textContent,/Η ανάθεση άλλαξε/);assert.equal(reads,2);assert.match(document.body.textContent,/αναθεώρηση 4/);assert.equal(writes[0].expectedRevision,3)});
});
test('manager selection changes ignore stale old-store assignments',async()=>{
 const old=deferred();const api=async path=>path.includes('/assignments?')?(path.includes('store-a')?old.promise:{items:[],total:0}):read(path);
 await mounted(api,async ctx=>{await ctx.click('Αναθέσεις · Own seller');await ctx.change(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]'),'store-a');await ctx.change(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]'),'store-b');await ctx.settle(()=>old.resolve({items:[assignment],total:1}));assert.doesNotMatch(document.body.textContent,/αναθεώρηση 3/);assert.equal(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]').value,'store-b')});
});

test('selected BackOffice store restricts manager assignment scope without an all-store fallback',async()=>{
 const calls=[];const api=async path=>{calls.push(path);return read(path)};
 await mounted(api,async ctx=>{await ctx.click('Αναθέσεις · Own seller');let select=document.querySelector('[aria-label="Κατάστημα ανάθεσης"]');assert.deepEqual([...select.options].map(option=>option.value),['','store-a']);assert.equal(select.value,'store-a');assert.ok(calls.some(path=>path.includes('storeId=store-a')));await ctx.rerender({activeStoreId:'foreign'});select=document.querySelector('[aria-label="Κατάστημα ανάθεσης"]');assert.deepEqual([...select.options].map(option=>option.value),['']);assert.equal(select.value,'');const count=calls.length;await ctx.click('Αναθέσεις · Own seller');assert.equal(calls.length,count)}, {activeStoreId:'store-a'});
});

test('new assignment activation uses immutable customer/store and revision zero',async()=>{
 const writes=[];const api=async(path,options)=>{if(options?.method){writes.push(JSON.parse(options.body));return {assignment:{...assignment,revision:1}}}if(path.includes('/users?'))return {items:[{...user,memberActive:true,membershipRevision:1}],total:1};if(path.includes('/assignments?'))return {items:[],total:0};return read(path)};
 await mounted(api,async ctx=>{await ctx.click('Αναθέσεις · Own seller');await ctx.change(document.querySelector('[aria-label="Κατάστημα ανάθεσης"]'),'store-a');const form=document.querySelector('[aria-label="Ανάθεση πελάτη"]');form.elements.namedItem('customerId').value='customer-a';await ctx.submit(form);assert.deepEqual(writes,[{customerId:'customer-a',storeId:'store-a',active:true,expectedRevision:0}])});
});
