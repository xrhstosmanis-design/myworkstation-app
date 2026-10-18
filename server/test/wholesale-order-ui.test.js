import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const customers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const lists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/WholesaleB2BPanel.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run,initialProps={}){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  let props={stores:[{id:"store-a",name:"Store A"},{id:"store-b",name:"Store B"}],activeStoreId:"store-a",...initialProps};
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{api,...props})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,input:async(element,value)=>act(async()=>{const proto=element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))}),rerender:async(next)=>{props={...props,...next};await render()},remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const pathname=path=>path.split("?")[0];

function readApi(path){
  path=pathname(path);
  if(path==="/api/wholesale/customers")return {items:customers};
  if(path==="/api/wholesale/price-lists")return {items:lists};
  if(/^\/api\/wholesale\/price-lists\/[^/]+\/products$/.test(path))return {items:[],total:0,page:1,pageSize:50};
  throw Error(`Unexpected request: ${path}`);
}

const quote={quoteId:"a".repeat(64),currency:"EUR",customerId:"customer-a",customerName:"Assigned customer",storeId:"store-a",items:[{productId:"product-a",name:"Order product",sku:"SKU",unit:"PIECE",quantity:"1.0000",netTotal:"10.00",vatTotal:"2.40",grossTotal:"12.40"}],totals:{net:"10.00",vat:"2.40",gross:"12.40"},creditChecked:false};
const product={id:"product-a",name:"Order product",sku:"SKU",unit:"PIECE"};
const baseApi=path=>path.startsWith("/api/wholesale/orders?")?{items:[],total:0,page:1,pageSize:50}:path.startsWith("/api/wholesale/products?")?{items:[product]}:readApi(path);
async function prepare({click,change}){await click("Παραγγελίες");await change(document.querySelector('[aria-label="Πελάτης παραγγελίας"]'),"customer-a");await click("Εύρεση προϊόντων");await click("Προσθήκη · Order product (PIECE)");await click("Υπολογισμός τιμών")}

test("orders require explicit valid store, send quantities as strings and render authoritative totals/detail",async()=>{
 const calls=[];const order={id:"order-a",customerId:"customer-a",status:"SUBMITTED",snapshot:quote,grossTotal:"12.40",createdAt:"2026-10-18",notes:"Saved note"};let submitted=false;
 const api=async(path,options)=>{calls.push({path,options});if(path==="/api/wholesale/quotes")return quote;if(path==="/api/wholesale/orders"&&options){submitted=true;return {orderId:order.id,status:"SUBMITTED",order:{...order,...JSON.parse(options.body),id:order.id}}};if(path.startsWith("/api/wholesale/orders/order-a?"))return {order};if(path.startsWith("/api/wholesale/orders?"))return {items:submitted?[order]:[],total:submitted?1:0};return baseApi(path)};
 await mounted(api,async(ctx)=>{
  await ctx.click("Παραγγελίες");assert.equal(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]').value,"");assert.equal(calls.some(call=>call.path.startsWith("/api/wholesale/orders?")),false);
  await ctx.change(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]'),"store-a");await ctx.change(document.querySelector('[aria-label="Πελάτης παραγγελίας"]'),"customer-a");await ctx.click("Εύρεση προϊόντων");
  assert.equal(new URL(calls.find(call=>call.path.startsWith("/api/wholesale/products?")).path,"https://isolated.invalid").searchParams.get("storeId"),"store-a");
  await ctx.click("Προσθήκη · Order product (PIECE)");await ctx.input(document.querySelector('[aria-label="Ποσότητα · Order product"]'),"2.1250");await ctx.click("Υπολογισμός τιμών");
  const body=JSON.parse(calls.find(call=>call.path==="/api/wholesale/quotes").options.body);assert.deepEqual(body.items,[{productId:"product-a",quantity:"2.1250"}]);assert.equal(body.storeId,"store-a");assert.match(document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]').textContent,/12,40/);assert.match(document.body.textContent,/Δεν έχει γίνει έλεγχος πίστωσης/);
  await ctx.click("Υποβολή προς έγκριση");assert.match(document.body.textContent,/Προς έγκριση · order-a/);assert.equal(document.querySelector('[aria-label="Ποσότητα · Order product"]'),null);
  await ctx.settle(()=>document.querySelector(".wholesale-order-list-row").click());assert.match(document.querySelector('[aria-label="Λεπτομέρειες παραγγελίας"]').textContent,/Saved note/);
 },{activeStoreId:"missing"});
});

test("ambiguous order response freezes body and key, locks edits/navigation, retries exact original request",async()=>{
 const writes=[],locks=[];let attempt=0;
 const api=async(path,options)=>{if(path==="/api/wholesale/quotes")return quote;if(path==="/api/wholesale/orders"&&options){writes.push(options.body);if(++attempt===1)throw Object.assign(Error("lost response"),{status:503});return {orderId:"original-order",status:"SUBMITTED",replayed:true,order:{...JSON.parse(options.body),id:"original-order"}}}return baseApi(path)};
 await mounted(api,async(ctx)=>{
  await prepare(ctx);await ctx.click("Υποβολή προς έγκριση");assert.match(document.body.textContent,/Η έκβαση δεν έχει επιβεβαιωθεί/);assert.equal(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]').closest("fieldset").disabled,true);assert.equal([...document.querySelectorAll(".wholesale-tabs button")].every(button=>button.disabled),true);
  const event=new ctx.dom.window.Event("beforeunload",{cancelable:true});window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  await ctx.click("Επανάληψη ίδιου αιτήματος");assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);assert.match(JSON.parse(writes[0]).clientOrderId,/^[0-9a-f-]{36}$/);assert.deepEqual(locks,[true,true,false]);assert.match(document.body.textContent,/Επιβεβαιώθηκε η αρχική καταχώρηση/);
 },{onSubmissionLockChange:locked=>locks.push(locked)});
});

test("PRICE_CHANGED releases submit lock, retains cart, requires fresh quote and never auto resubmits",async()=>{
 let writes=0;const api=async(path,options)=>{if(path==="/api/wholesale/quotes")return quote;if(path==="/api/wholesale/orders"&&options){writes++;throw Object.assign(Error("changed"),{status:409,code:"PRICE_CHANGED"})}return baseApi(path)};
 await mounted(api,async(ctx)=>{await prepare(ctx);await ctx.click("Υποβολή προς έγκριση");assert.equal(writes,1);assert.match(document.body.textContent,/Οι τιμές άλλαξαν/);assert.ok(document.querySelector('[aria-label="Ποσότητα · Order product"]'));assert.equal(document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]'),null);assert.equal([...document.querySelectorAll(".wholesale-tabs button")].every(button=>!button.disabled),true)});
});

test("store changes discard delayed quote and old store order list/detail",async()=>{
 const pendingQuote=deferred(),pendingOrders=deferred(),pendingDetail=deferred();let listReads=0;
 const api=async(path,options)=>{if(path==="/api/wholesale/quotes")return pendingQuote.promise;if(path.startsWith("/api/wholesale/orders/order-old?"))return pendingDetail.promise;if(path.startsWith("/api/wholesale/orders?")){if(path.includes("store-b"))return {items:[],total:0};if(++listReads===1)return {items:[{id:"order-old",customerId:"customer-a",snapshot:quote,status:"SUBMITTED",grossTotal:"12.40"}],total:1};return pendingOrders.promise}return baseApi(path)};
 await mounted(api,async(ctx)=>{
  await prepare(ctx);await ctx.settle(()=>document.querySelector(".wholesale-order-list-row").click());await ctx.change(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]'),"store-b");await ctx.settle(()=>{pendingQuote.resolve(quote);pendingDetail.resolve({order:{id:"stale-detail",snapshot:quote}})});assert.equal(document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]'),null);assert.equal(document.querySelector('[aria-label="Λεπτομέρειες παραγγελίας"]'),null);assert.equal(document.querySelector(".wholesale-order-list-row"),null);
  await ctx.change(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]'),"store-a");await ctx.change(document.querySelector('[aria-label="Κατάστημα παραγγελίας"]'),"store-b");await ctx.settle(()=>pendingOrders.resolve({items:[{id:"late-order",snapshot:quote}],total:1}));assert.doesNotMatch(document.querySelector('[aria-label="Καταχωρισμένες παραγγελίες"]').textContent,/late-order/);
 });
});

test("cart/customer edits invalidate quote and invalid scale quantities cannot request quote",async()=>{
 let quotes=0;const api=async(path)=>{if(path==="/api/wholesale/quotes"){quotes++;return quote}return baseApi(path)};
 await mounted(api,async(ctx)=>{await prepare(ctx);assert.equal(quotes,1);await ctx.input(document.querySelector('[aria-label="Ποσότητα · Order product"]'),"1.12345");assert.equal(document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]'),null);assert.equal([...document.querySelectorAll("button")].find(button=>button.textContent==="Υπολογισμός τιμών").disabled,true);await ctx.input(document.querySelector('[aria-label="Ποσότητα · Order product"]'),"3.2500");await ctx.click("Υπολογισμός τιμών");assert.equal(quotes,2);await ctx.change(document.querySelector('[aria-label="Πελάτης παραγγελίας"]'),"");assert.equal(document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]'),null)});
});

test("uncertain submission stays frozen after auth errors or later400 and ignores mismatched success",async()=>{
 const writes=[];let step=0;const failures=[Object.assign(Error("lost"),{status:503}),Object.assign(Error("expired"),{status:401}),Object.assign(Error("bad request"),{status:400})];
 const api=async(path,options)=>{if(path==="/api/wholesale/quotes")return quote;if(path==="/api/wholesale/orders"&&options){writes.push(options.body);if(step<3)throw failures[step++];if(step++===3)return {orderId:"foreign",status:"SUBMITTED",order:{...JSON.parse(options.body),id:"foreign",storeId:"store-b"}};return {orderId:"actual",status:"SUBMITTED",replayed:true,order:{...JSON.parse(options.body),id:"actual"}}}return baseApi(path)};
 await mounted(api,async(ctx)=>{await prepare(ctx);await ctx.click("Υποβολή προς έγκριση");for(let attempt=0;attempt<3;attempt++){await ctx.click("Επανάληψη ίδιου αιτήματος");assert.equal([...document.querySelectorAll(".wholesale-tabs button")].every(button=>button.disabled),true)}await ctx.click("Επανάληψη ίδιου αιτήματος");assert.equal(new Set(writes).size,1);assert.equal(writes.length,5);assert.equal([...document.querySelectorAll(".wholesale-tabs button")].every(button=>!button.disabled),true);assert.match(document.body.textContent,/actual/)});
});

test("authoritative large decimal totals render exactly without floating point conversion",async()=>{
 const exact="9999999999999999.99",largeQuote={...quote,items:quote.items.map(item=>({...item,netTotal:exact,grossTotal:exact})),totals:{net:exact,vat:"0.00",gross:exact}};
 const api=async path=>path==="/api/wholesale/quotes"?largeQuote:baseApi(path);
 await mounted(api,async(ctx)=>{await prepare(ctx);const text=document.querySelector('[aria-label="Υπολογισμός παραγγελίας"]').textContent;assert.match(text,/9\.999\.999\.999\.999\.999,99/);assert.doesNotMatch(text,/10\.000\.000\.000\.000\.000/)});
});
