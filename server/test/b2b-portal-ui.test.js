import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const unusedCustomers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const unusedLists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/../b2b/B2BPortal.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run,initialProps={}){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  let props={slug:"own-site",request:api,...initialProps};
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{...props})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,input:async(element,value)=>act(async()=>{const proto=element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))}),rerender:async(next)=>{props={...props,...next};await render()},remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const identity={account:{id:'account-a',login:'customer',customerId:'customer-a',customerName:'My customer'},stores:[{id:'store-a',name:'Own store'}],site:{slug:'own-site',name:'Own wholesale'},csrfToken:'csrf-a'};
const product={id:'product-a',name:'Own product',sku:'SKU',unit:'PIECE'};
const quote={quoteId:'a'.repeat(64),currency:'EUR',customerId:'customer-a',storeId:'store-a',items:[{...product,productId:'product-a',quantity:'1.0000',sourceUnitPrice:'10.1234',sourcePriceBasis:'NET',netTotal:'10.00',vatTotal:'2.40',grossTotal:'12.40'}],totals:{net:'10.00',vat:'2.40',gross:'12.40'}};
const fail=(status,code)=>Object.assign(Error('Rejected'),{status,code});
const reads=path=>path==='/config'?{site:identity.site}:path==='/me'?identity:path.startsWith('/catalog?')?{items:[product],total:1}:path.startsWith('/orders?')?{items:[],total:0}:path==='/quotes'?quote:Promise.reject(Error('Unexpected '+path));
async function prepare(ctx){await ctx.change(document.querySelector('[aria-label="Κατάστημα"]'),'store-a');await ctx.click('Αναζήτηση');await ctx.click('Προσθήκη · Own product');await ctx.click('Υπολογισμός παραγγελίας')}

test('portal requires explicit store and sends only customer-safe cart fields, then shows exact accepted order',async()=>{
 const calls=[];let accepted=false;const api=async(path,options)=>{calls.push({path,options});if(path==='/orders'&&options){accepted=true;return {orderId:'order-a',status:'SUBMITTED',order:{id:'order-a',clientOrderId:JSON.parse(options.body).clientOrderId,snapshot:quote}}}if(path.startsWith('/orders?'))return {items:accepted?[{id:'order-a',snapshot:quote}]:[],total:accepted?1:0};if(path.startsWith('/orders/order-a?'))return {order:{id:'order-a',snapshot:quote,notes:'Saved note'}};return reads(path)};
 await mounted(api,async ctx=>{assert.equal(document.querySelector('[aria-label="Κατάστημα"]').value,'');assert.equal(calls.some(c=>c.path.startsWith('/catalog?')||c.path.startsWith('/orders?')),false);await prepare(ctx);const body=calls.find(c=>c.path==='/quotes').options.body;assert.deepEqual(body,{storeId:'store-a',items:[{productId:'product-a',quantity:'1'}]});assert.match(document.querySelector('[aria-label="Τιμές παραγγελίας"]').textContent,/12,40/);assert.match(document.querySelector('[aria-label="Τιμές παραγγελίας"]').textContent,/10,1234 € · Χωρίς ΦΠΑ/);await ctx.click('Υποβολή προς έγκριση');const sent=JSON.parse(calls.find(c=>c.path==='/orders').options.body);assert.deepEqual(Object.keys(sent).sort(),['clientOrderId','items','notes','quoteId','storeId']);assert.match(document.body.textContent,/Προς έγκριση · order-a/);await ctx.settle(()=>document.querySelector('.b2b-order-row').click());assert.match(document.querySelector('[aria-label="Λεπτομέρειες παραγγελίας"]').textContent,/Saved note/)});
});

test('portal anonymous login has no private catalog reads, logout removes rendered customer data',async()=>{
 const calls=[];let logged=false;const api=async(path,options)=>{calls.push({path,options});if(path==='/me'&&!logged)throw fail(401);if(path==='/session'&&options.method==='POST'){logged=true;return identity}if(path==='/session'&&options.method==='DELETE'){logged=false;return {ok:true}}return reads(path)};
 await mounted(api,async ctx=>{assert.ok(document.querySelector('[aria-label="Σύνδεση πελάτη"]'));assert.equal(calls.length,2);const form=document.querySelector('form');form.elements.namedItem('login').value='customer';form.elements.namedItem('password').value='private-password';await ctx.submit(form);assert.match(document.body.textContent,/My customer/);assert.equal(document.querySelector('[aria-label="Κατάστημα"]').value,'');await ctx.click('Αποσύνδεση');assert.doesNotMatch(document.body.textContent,/My customer/);assert.ok(document.querySelector('[aria-label="Σύνδεση πελάτη"]'))});
});

test('expired uncertain request requires same-account reauth and retries the exact frozen body',async()=>{
 const calls=[],writes=[];let logged=true,account=identity,attempt=0;
 const api=async(path,options)=>{calls.push({path,options});if(path==='/me'){if(!logged)throw fail(401);return account}if(path==='/session'){logged=true;return account}if(path==='/orders'&&options){writes.push(options.body);if(++attempt===1){logged=false;throw fail(401)}return {orderId:'original',status:'SUBMITTED',replayed:true,order:{id:'original',clientOrderId:JSON.parse(options.body).clientOrderId,snapshot:quote}}}return reads(path)};
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.click('Υποβολή προς έγκριση');assert.doesNotMatch(document.body.textContent,/My customer/);assert.ok(document.querySelector('form'));account={...identity,account:{...identity.account,id:'account-other',customerName:'Wrong customer'}};let form=document.querySelector('form');form.elements.namedItem('login').value='other';form.elements.namedItem('password').value='password';await ctx.submit(form);assert.match(document.body.textContent,/αρχικό λογαριασμό/);assert.equal(writes.length,1);account=identity;form=document.querySelector('form');form.elements.namedItem('login').value='customer';form.elements.namedItem('password').value='password';await ctx.submit(form);assert.equal(document.querySelector('[aria-label="Κατάστημα"]').disabled,true);await ctx.click('Επιβεβαίωση ίδιου αιτήματος');assert.equal(writes[0],writes[1]);assert.match(document.body.textContent,/Προς έγκριση · original/)});
});

test('portal store/customer privacy ignores delayed catalog after logout and delayed quote after cart edit',async()=>{
 const late=deferred(),lateQuote=deferred();let quotePending=true;const api=async(path,options)=>{if(path.startsWith('/catalog?'))return late.promise;if(path==='/quotes')return quotePending?lateQuote.promise:quote;if(path==='/session')return {ok:true};return reads(path)};
 await mounted(api,async ctx=>{await ctx.change(document.querySelector('[aria-label="Κατάστημα"]'),'store-a');await ctx.click('Αναζήτηση');await ctx.click('Αποσύνδεση');await ctx.settle(()=>late.resolve({items:[product],total:1}));assert.doesNotMatch(document.body.textContent,/Own product/);const form=document.querySelector('form');form.elements.namedItem('login').value='x';form.elements.namedItem('password').value='x';await ctx.submit(form);await ctx.change(document.querySelector('[aria-label="Κατάστημα"]'),'store-a');await ctx.click('Αναζήτηση');await ctx.click('Προσθήκη · Own product');await ctx.click('Υπολογισμός παραγγελίας');await ctx.input(document.querySelector('[aria-label="Ποσότητα · Own product"]'),'2.1234');await ctx.settle(()=>lateQuote.resolve(quote));assert.equal(document.querySelector('[aria-label="Τιμές παραγγελίας"]'),null);quotePending=false;await ctx.click('Υπολογισμός παραγγελίας');assert.ok(document.querySelector('[aria-label="Τιμές παραγγελίας"]'))});
});

test('portal exact large totals and PRICE_CHANGED require review without automatic resubmission',async()=>{
 const huge={...quote,totals:{net:'9999999999999999.99',vat:'0.00',gross:'9999999999999999.99'}};let writes=0;const api=async(path,options)=>{if(path==='/quotes')return huge;if(path==='/orders'){writes++;throw fail(409,'PRICE_CHANGED')}return reads(path)};
 await mounted(api,async ctx=>{await prepare(ctx);assert.match(document.querySelector('[aria-label="Τιμές παραγγελίας"]').textContent,/9\.999\.999\.999\.999\.999,99/);await ctx.click('Υποβολή προς έγκριση');assert.equal(writes,1);assert.match(document.body.textContent,/Οι τιμές άλλαξαν/);assert.equal(document.querySelector('[aria-label="Τιμές παραγγελίας"]'),null);assert.equal(document.querySelector('[aria-label="Κατάστημα"]').disabled,false)});
});

test('logout failure clears private UI immediately and retries server revocation before login is available',async()=>{
 let deletes=0,meReads=0;const wait=deferred();const api=async(path,options)=>{if(path==='/me'){meReads++;return identity}if(path==='/session'&&options?.method==='DELETE'){if(++deletes===1)throw fail(503);return wait.promise}return reads(path)};
 await mounted(api,async ctx=>{await ctx.click('Αποσύνδεση');assert.doesNotMatch(document.body.textContent,/My customer/);assert.equal(document.querySelector('form'),null);assert.match(document.body.textContent,/Επανάληψη αποσύνδεσης/);await ctx.settle(()=>window.dispatchEvent(new ctx.dom.window.Event('focus')));assert.equal(meReads,1);await ctx.click('Επανάληψη αποσύνδεσης');assert.equal(deletes,2);assert.equal(document.querySelector('form'),null);await ctx.settle(()=>wait.resolve({ok:true}));assert.ok(document.querySelector('form'))});
});

test('focus revalidation clears revoked session private content and expiry clears it without another click',async()=>{
 let meReads=0;const api=async path=>{if(path==='/me'){if(++meReads>1)throw fail(403);return identity}return reads(path)};
 await mounted(api,async ctx=>{await prepare(ctx);await ctx.settle(()=>window.dispatchEvent(new ctx.dom.window.Event('focus')));assert.doesNotMatch(document.body.textContent,/My customer|Own product/);assert.ok(document.querySelector('form'))});
 const expired=async path=>path==='/me'?{...identity,expiresAt:new Date(Date.now()-1000).toISOString()}:reads(path);
 await mounted(expired,async ctx=>{await ctx.settle(()=>new Promise(resolve=>setTimeout(resolve,10)));assert.doesNotMatch(document.body.textContent,/My customer/);assert.ok(document.querySelector('form'));assert.match(document.body.textContent,/Η συνεδρία έληξε/)});
});

test('changing portal slug/request clears old customer state and ignores its delayed catalog',async()=>{
 const late=deferred(),newConfig=deferred();const api=async path=>path.startsWith('/catalog?')?late.promise:reads(path),newApi=async path=>path==='/config'?newConfig.promise:Promise.reject(fail(401));
 await mounted(api,async ctx=>{await ctx.change(document.querySelector('[aria-label="Κατάστημα"]'),'store-a');await ctx.click('Αναζήτηση');await ctx.rerender({slug:'second-site',request:newApi});assert.doesNotMatch(document.body.textContent,/My customer/);await ctx.settle(()=>late.resolve({items:[product],total:1}));assert.doesNotMatch(document.body.textContent,/Own product/);await ctx.settle(()=>newConfig.resolve({site:{slug:'second-site',name:'Second site'}}));assert.match(document.body.textContent,/Second site/);assert.ok(document.querySelector('form'))});
});
