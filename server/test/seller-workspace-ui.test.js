import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const unusedCustomers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const unusedLists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/../field-sales/SellerWorkspace.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run,initialProps={}){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  let props={api,activeStoreId:"",...initialProps};
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{...props})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,input:async(element,value)=>act(async()=>{const proto=element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))}),rerender:async(next)=>{props={...props,...next};await render()},remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const context={user:{id:'seller-a',fullName:'Own seller'},companyId:'company-a',actorId:'seller:seller-a',stores:[{id:'store-a',name:'Own store'},{id:'store-b',name:'Second store'}]};
const product={id:'product-a',name:'Assigned product',sku:'SKU',unit:'PIECE'};
const quote={quoteId:'a'.repeat(64),customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',name:'Assigned product',unit:'PIECE',quantity:'1.0000',sourceUnitPrice:'10.1234',sourcePriceBasis:'NET',netTotal:'10.00',vatTotal:'2.40',grossTotal:'12.40'}],totals:{net:'10.00',vat:'2.40',gross:'12.40'}};
const fail=(status,code)=>Object.assign(Error('Rejected'),{status,code});
const read=path=>path.endsWith('/context')?context:path.includes('/customers?')?{items:[{id:'customer-a',name:'Assigned customer'}],total:1}:path.includes('/catalog?')?{items:[product],total:1}:path.includes('/orders?')?{items:[],total:0}:path.endsWith('/quotes')?quote:Promise.reject(Error(path));
async function prepare(ctx){await ctx.change(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),'store-a');await ctx.change(document.querySelector('[aria-label="Πελάτης πωλητή"]'),'customer-a');await ctx.click('Εύρεση προϊόντων');await ctx.click('Προσθήκη · Assigned product');await ctx.click('Υπολογισμός τιμών')}

test('seller starts with blank explicit scopes, only calls seller APIs, quotes exact quantity and submits shared request',async()=>{
 const calls=[];const api=async(path,options)=>{calls.push({path,options});if(path.endsWith('/orders')&&options?.method==='POST'){const body=JSON.parse(options.body);return {orderId:'seller-order',status:'SUBMITTED',order:{id:'seller-order',clientOrderId:body.clientOrderId,snapshot:quote}}}return read(path)};
 await mounted(api,async ctx=>{assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]').value,'');assert.equal(calls.length,1);await prepare(ctx);assert.equal(calls.every(call=>call.path.startsWith('/api/wholesale/sellers/')),true);const asked=JSON.parse(calls.find(call=>call.path.endsWith('/quotes')).options.body);assert.deepEqual(asked,{storeId:'store-a',customerId:'customer-a',items:[{productId:'product-a',quantity:'1'}]});assert.match(document.querySelector('[aria-label="Υπολογισμός πωλητή"]').textContent,/10,1234 € · Χωρίς ΦΠΑ/);await ctx.click('Υποβολή προς έγκριση');assert.match(document.body.textContent,/Προς έγκριση · seller-order/);const body=JSON.parse(calls.find(call=>call.path.endsWith('/orders')&&call.options?.method==='POST').options.body);assert.deepEqual(Object.keys(body).sort(),['clientOrderId','customerId','items','notes','quoteId','storeId'])});
});

test('seller uncertain request freezes parent/navigation and reuses body only after original actor and company return',async()=>{
 const writes=[],locks=[];let identity=context,attempt=0;const api=async(path,options)=>{if(path.endsWith('/context'))return identity;if(path.endsWith('/orders')&&options?.method==='POST'){writes.push(options.body);if(++attempt===1)throw fail(401);return {orderId:'original',status:'SUBMITTED',replayed:true,order:{id:'original',clientOrderId:JSON.parse(options.body).clientOrderId,snapshot:quote}}}return read(path)};
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.click('Υποβολή προς έγκριση');assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),null);assert.equal(locks.at(-1),true);await ctx.rerender({suspended:true});assert.equal(document.querySelector('.seller-workspace'),null);assert.equal(writes.length,1);await ctx.rerender({suspended:false});assert.equal(writes.length,1,'resuming access never posts automatically');identity={...context,user:{id:'other',fullName:'Other seller'},actorId:'seller:other'};await ctx.click('Επανέλεγχος πρόσβασης');assert.match(document.body.textContent,/αρχικού λογαριασμού/);await ctx.click('Επιβεβαίωση ίδιου αιτήματος');assert.equal(writes.length,1);identity=context;await ctx.click('Επανέλεγχος πρόσβασης');assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]').closest('fieldset').disabled,true);await ctx.click('Επιβεβαίωση ίδιου αιτήματος');assert.equal(writes[0],writes[1]);assert.equal(locks.at(-1),false);assert.match(document.body.textContent,/Προς έγκριση · original/)} ,{onSubmissionLockChange:locked=>locks.push(locked)});
});

test('context revalidation clears operational private data even for same identity and late catalog is discarded',async()=>{
 const late=deferred();const api=async(path)=>path.includes('/catalog?')?late.promise:read(path);
 await mounted(api,async ctx=>{await ctx.change(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),'store-a');await ctx.change(document.querySelector('[aria-label="Πελάτης πωλητή"]'),'customer-a');await ctx.click('Εύρεση προϊόντων');await ctx.settle(()=>window.dispatchEvent(new ctx.dom.window.Event('focus')));assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]').value,'');await ctx.settle(()=>late.resolve({items:[product],total:1}));assert.doesNotMatch(document.body.textContent,/Assigned product/);await ctx.change(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),'store-a');assert.match(document.body.textContent,/Assigned customer/)});
});

test('changing store discards delayed old quote and revoked current context clears private views',async()=>{
 const pending=deferred();let revoked=false;const api=async(path)=>{if(path.endsWith('/context')&&revoked)throw fail(403);if(path.endsWith('/quotes'))return pending.promise;return read(path)};
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.change(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),'store-b');await ctx.settle(()=>pending.resolve(quote));assert.equal(document.querySelector('[aria-label="Υπολογισμός πωλητή"]'),null);revoked=true;await ctx.click('Επανέλεγχος πρόσβασης');assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),null);assert.doesNotMatch(document.body.textContent,/Assigned product|Assigned customer/)});
});

test('selected BackOffice store restricts seller choices, prop changes clear scope and foreign scope never falls back',async()=>{
 const calls=[],late=deferred();const api=async(path)=>{calls.push(path);if(path.endsWith('/quotes'))return late.promise;return read(path)};
 await mounted(api,async ctx=>{let select=document.querySelector('[aria-label="Κατάστημα πωλητή"]');assert.deepEqual([...select.options].map(option=>option.value),['','store-a']);await prepare(ctx);await ctx.rerender({activeStoreId:'store-b'});select=document.querySelector('[aria-label="Κατάστημα πωλητή"]');assert.equal(select.value,'');assert.deepEqual([...select.options].map(option=>option.value),['','store-b']);assert.doesNotMatch(document.body.textContent,/Assigned product/);await ctx.settle(()=>late.resolve(quote));assert.equal(document.querySelector('[aria-label="Υπολογισμός πωλητή"]'),null);await ctx.rerender({activeStoreId:'foreign-store'});select=document.querySelector('[aria-label="Κατάστημα πωλητή"]');assert.deepEqual([...select.options].map(option=>option.value),['']);const count=calls.length;await ctx.click('Εύρεση πελατών');assert.equal(calls.length,count)}, {activeStoreId:'store-a'});
});

test('uncertain503 and later400 retain frozen request; malformed acknowledgement cannot unlock; expiry clears private data',async()=>{
 const writes=[],locks=[];let step=0;const api=async(path,options)=>{if(path.endsWith('/orders')&&options?.method==='POST'){writes.push(options.body);if(step++===0)throw fail(503);if(step===2)throw fail(400);if(step===3)return {orderId:'wrong',status:'SUBMITTED',order:{id:'wrong',clientOrderId:'wrong',snapshot:quote}};return {orderId:'correct',status:'SUBMITTED',order:{id:'correct',clientOrderId:JSON.parse(options.body).clientOrderId,snapshot:quote}}}return read(path)};
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.click('Υποβολή προς έγκριση');for(let i=0;i<2;i++){await ctx.click('Επιβεβαίωση ίδιου αιτήματος');assert.equal(locks.at(-1),true)}await ctx.click('Επιβεβαίωση ίδιου αιτήματος');assert.equal(locks.at(-1),false);assert.equal(new Set(writes).size,1)}, {onSubmissionLockChange:lock=>locks.push(lock)});
 const expired=async path=>path.endsWith('/context')?{...context,expiresAt:new Date(Date.now()-1000).toISOString()}:read(path);
 await mounted(expired,async ctx=>{await ctx.settle(()=>new Promise(resolve=>setTimeout(resolve,10)));assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),null);assert.match(document.body.textContent,/Η συνεδρία έληξε/)});
});

test('revocation detected during focus revalidation cannot be cancelled by editing a draft',async()=>{
 const pending=deferred();let contexts=0;const api=async path=>path.endsWith('/context')?(++contexts===1?context:pending.promise):read(path);
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.settle(()=>window.dispatchEvent(new ctx.dom.window.Event('focus')));await ctx.input(document.querySelector('[aria-label="Ποσότητα · Assigned product"]'),'2.2500');await ctx.settle(()=>pending.reject(fail(403)));assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),null);assert.doesNotMatch(document.body.textContent,/Assigned product|Assigned customer/)});
});

test('seller quote preserves exact large authoritative decimal amounts',async()=>{
 const huge={...quote,totals:{net:'9999999999999999.99',vat:'0.00',gross:'9999999999999999.99'}};const api=async path=>path.endsWith('/quotes')?huge:read(path);
 await mounted(api,async ctx=>{await prepare(ctx);assert.match(document.querySelector('[aria-label="Υπολογισμός πωλητή"]').textContent,/9\.999\.999\.999\.999\.999,99/)});
});
