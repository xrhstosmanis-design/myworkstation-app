import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const unusedCustomers=[{id:"customer-a",name:"Assigned customer",priceListId:"list-b",creditLimit:0,paymentTermsDays:0}];
const unusedLists=[{id:"list-a",code:"A",name:"List A",discountPercent:0},{id:"list-b",code:"B",name:"List B",discountPercent:5}];
const compiled=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/commerce/WholesalePortalAdmin.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
const component={exports:{}};
new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(api,run,initialProps={}){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/"});
  const keys=["window","document","navigator","HTMLElement","Node","Event","FormData","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  let root=createRoot(document.getElementById("root"));
  let props={api,customers:[{id:"customer-a",name:"Own customer"}],stores:[{id:"store-a",name:"Own store"},{id:"store-b",name:"Second store"}],activeStoreId:"store-a",...initialProps};
  const render=()=>act(async()=>root.render(React.createElement(component.exports.default,{...props})));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll("button")].find(el=>el.textContent===text);assert.ok(button,`button ${text}`);button.click()});
  const change=(element,value)=>act(async()=>{assert.ok(element);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
  const submit=form=>act(async()=>{assert.ok(form);form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}))});
  const settle=work=>act(async()=>work());
  const unmount=async()=>{if(root){await act(async()=>root.unmount());root=null}};
  try{await render();await run({dom,act,click,change,submit,settle,unmount,input:async(element,value)=>act(async()=>{const proto=element.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));element.dispatchEvent(new dom.window.Event("change",{bubbles:true}))}),rerender:async(next)=>{props={...props,...next};await render()},remount:async()=>{await unmount();root=createRoot(document.getElementById("root"));await render()}})}
  finally{await unmount();dom.window.close();for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

const site={slug:'own-site',name:'Own site',enabled:false};
const read=path=>path==='/api/wholesale/portal/site'?{site}:path.startsWith('/api/wholesale/portal/accounts?')?{items:[{id:'account-a',login:'buyer',customerId:'customer-a',storeId:'store-a',active:true}]}:path.startsWith('/api/wholesale/portal/products?')?{items:[{id:'product-a',name:'Own product',unit:'PIECE',sku:'SKU',published:false}],total:1}:Promise.reject(Error(path));
test('admin provisions explicit customer/store account, clears password only on acknowledgement and cannot reassign existing bindings',async()=>{
 const writes=[],wait=deferred();const api=async(path,options)=>{if(options?.method){writes.push({path,body:JSON.parse(options.body),method:options.method});if(options.method==='POST')return wait.promise;return {account:{}}}return read(path)};
 await mounted(api,async ctx=>{const form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');form.elements.namedItem('login').value='newbuyer';form.elements.namedItem('password').value='strong-password-12';form.elements.namedItem('customerId').value='customer-a';form.elements.namedItem('storeId').value='store-a';await ctx.submit(form);assert.equal(form.elements.namedItem('password').value,'strong-password-12');assert.deepEqual(writes[0].body,{login:'newbuyer',password:'strong-password-12',customerId:'customer-a',storeId:'store-a',active:true});await ctx.settle(()=>wait.resolve({account:{id:'created'}}));assert.equal(form.elements.namedItem('password').value,'');await ctx.click('Απενεργοποίηση · buyer');assert.deepEqual(writes[1].body,{active:false});assert.equal(document.querySelector('[aria-label="Λογαριασμοί πύλης"] select'),null);const reset=document.querySelector('[aria-label="Νέος κωδικός · buyer"]');reset.elements.namedItem('password').value='replacement-strong-pass';await ctx.submit(reset);assert.deepEqual(writes[2].body,{password:'replacement-strong-pass'});assert.equal(reset.elements.namedItem('password').value,'')});
});
test('admin site/publication use explicit store, stale old-store results are ignored and publication is explicitly store-scoped',async()=>{
 const writes=[],old=deferred();let searches=0;const api=async(path,options)=>{if(options?.method){writes.push({path,body:JSON.parse(options.body)});return {site}}if(path.startsWith('/api/wholesale/portal/products?')){searches++;return path.includes('store-a')?old.promise:{items:[{id:'product-b',name:'Second product',unit:'PIECE',published:false}],total:1}}return read(path)};
 await mounted(api,async ctx=>{assert.equal(searches,0);assert.match(document.body.textContent,/μόνο για το επιλεγμένο κατάστημα/);await ctx.change(document.querySelector('[aria-label="Κατάστημα δημοσίευσης"]'),'store-a');await ctx.click('Εύρεση ειδών πύλης');await ctx.change(document.querySelector('[aria-label="Κατάστημα δημοσίευσης"]'),'store-b');await ctx.click('Εύρεση ειδών πύλης');await ctx.settle(()=>old.resolve({items:[{id:'old',name:'Stale product'}],total:1}));assert.doesNotMatch(document.body.textContent,/Stale product/);await ctx.click('Δημοσίευση · Second product');assert.deepEqual(writes[0].body,{storeId:'store-b',published:true});assert.match(document.body.textContent,/Απόσυρση · Second product/)},{activeStoreId:''});
});
test('admin rejects short passwords and failed writes retain password input',async()=>{
 let writes=0;const api=async(path,options)=>{if(options?.method){writes++;throw Error('Denied')}return read(path)};
 await mounted(api,async ctx=>{const form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');form.elements.namedItem('login').value='buyer';form.elements.namedItem('password').value='short';form.elements.namedItem('customerId').value='customer-a';form.elements.namedItem('storeId').value='store-a';await ctx.submit(form);assert.equal(writes,0);form.elements.namedItem('password').value='long-enough-password';await ctx.submit(form);assert.equal(writes,1);assert.equal(form.elements.namedItem('password').value,'long-enough-password');assert.match(document.querySelector('[role="alert"]').textContent,/Denied/)});
});

test('account reads and both credential mutations carry the selected store, filtering sibling rows',async()=>{
 const calls=[];
 const api=async(path,options)=>{
  calls.push({path,options});
  if(options)return {account:{}};
  if(path.includes('/accounts?'))return {items:[{id:'own',login:'own-buyer',storeId:'store-a',customerId:'customer-a',active:true},{id:'sibling',login:'SIBLING PRIVATE',storeId:'store-b',active:true}]};
  return read(path);
 };
 await mounted(api,async ctx=>{
  assert.equal(calls.filter(c=>c.path.includes('/accounts')).length,1);
  assert.equal(calls.find(c=>c.path.includes('/accounts')).path,'/api/wholesale/portal/accounts?storeId=store-a');
  assert.doesNotMatch(document.body.textContent,/SIBLING PRIVATE/);
  assert.deepEqual([...document.querySelector('[aria-label="Κατάστημα λογαριασμών"]').options].map(o=>o.value),['','store-a']);
  await ctx.click('Απενεργοποίηση · own-buyer');
  let form=document.querySelector('[aria-label="Νέος κωδικός · own-buyer"]');form.elements.namedItem('password').value='store-bound-password';await ctx.submit(form);
  const writes=calls.filter(c=>c.options);
  assert.equal(writes.length,2);
  assert.ok(writes.every(c=>c.path==='/api/wholesale/portal/accounts/own?storeId=store-a'));
  assert.deepEqual(writes.map(c=>JSON.parse(c.options.body)),[{active:false},{password:'store-bound-password'}]);
 });
});

test('empty, foreign and inactive entry selections never request private accounts or silently pick a store',async()=>{
 for(const props of [{activeStoreId:''},{activeStoreId:'foreign'},{activeStoreId:'store-a',stores:[{id:'store-a',name:'Inactive',active:false},{id:'store-b',name:'Sibling'}]}]){
  const calls=[];await mounted(async(path,options)=>{calls.push({path,options});return read(path)},async ctx=>{
   assert.equal(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]').value,'');
   assert.equal(calls.filter(c=>c.path.includes('/accounts')).length,0);
   assert.equal(document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"] button').disabled,true);
   const form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');form.elements.namedItem('password').value='long-enough-password';await ctx.submit(form);
   assert.equal(calls.filter(c=>c.options).length,0);
   assert.equal(document.querySelector('[aria-label="Λογαριασμοί πύλης"]').textContent,'');
  },props);
 }
});

test('changing store clears account credentials and discards late old-scope list responses including an A-B-A switch',async()=>{
 const old=deferred(),requests=[];let count=0;
 const api=async path=>{requests.push(path);if(path.includes('/accounts?')){count++;if(count===1)return old.promise;const selected=new URL('https://test.invalid'+path).searchParams.get('storeId');return {items:[{id:'fresh-'+count,login:'Current '+selected,storeId:selected,active:true}]}}return read(path)};
 await mounted(api,async ctx=>{
  await ctx.change(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]'),'store-a');
  let form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');form.elements.namedItem('password').value='old-store-secret';form.elements.namedItem('login').value='old-login';
  await ctx.change(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]'),'store-b');
  form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');assert.equal(form.elements.namedItem('password').value,'');assert.equal(form.elements.namedItem('login').value,'');assert.equal(form.elements.namedItem('storeId').value,'store-b');
  assert.equal(document.querySelector('[aria-label="Κατάστημα δημοσίευσης"]').value,'store-b');
  await ctx.change(document.querySelector('[aria-label="Κατάστημα δημοσίευσης"]'),'store-a');
  await ctx.settle(()=>old.resolve({items:[{id:'stale',login:'OLD A PRIVATE',storeId:'store-a',active:true}]}));
  assert.doesNotMatch(document.body.textContent,/OLD A PRIVATE/);assert.match(document.body.textContent,/Current store-a/);
  assert.equal(requests.filter(p=>p.includes('/accounts?')).length,3);
 },{activeStoreId:''});
});

test('late old-store mutation acknowledgement or error cannot clear new credentials, refresh accounts or display an old error',async()=>{
 for(const reject of [false,true]){
  const pendingWrite=deferred(),calls=[];
  const api=async(path,options)=>{calls.push({path,options});if(options)return pendingWrite.promise;if(path.includes('/accounts?')){const selected=new URL('https://test.invalid'+path).searchParams.get('storeId');return {items:[{id:selected,login:'Buyer '+selected,storeId:selected,active:true}]}}return read(path)};
  await mounted(api,async ctx=>{
   await ctx.change(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]'),'store-a');
   let form=document.querySelector('[aria-label="Νέος κωδικός · Buyer store-a"]');form.elements.namedItem('password').value='old-valid-password';await ctx.submit(form);
   assert.equal(calls.find(c=>c.options).path,'/api/wholesale/portal/accounts/store-a?storeId=store-a');
   await ctx.change(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]'),'store-b');
   form=document.querySelector('[aria-label="Νέος κωδικός · Buyer store-b"]');form.elements.namedItem('password').value='new-store-secret';
   const before=calls.length;
   await ctx.settle(()=>reject?pendingWrite.reject(Error('OLD STORE ERROR')):pendingWrite.resolve({account:{}}));
   assert.equal(calls.length,before);assert.equal(form.elements.namedItem('password').value,'new-store-secret');assert.doesNotMatch(document.body.textContent,/OLD STORE ERROR/);
  },{activeStoreId:''});
 }
});

test('entry scope replacement and permission revocation unmount old private forms and ignore their outstanding reads',async()=>{
 const old=deferred();const api=async path=>path.includes('/accounts?')?(path.includes('store-a')?old.promise:{items:[{id:'b',login:'New entry buyer',storeId:'store-b',active:true}]}):read(path);
 await mounted(api,async ctx=>{
  const form=document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"]');form.elements.namedItem('password').value='old-entry-secret';
  await ctx.rerender({activeStoreId:'store-b'});
  assert.equal(form.isConnected,false);assert.equal(document.querySelector('[aria-label="Νέος λογαριασμός πελάτη"] input[type="password"]').value,'');
  await ctx.settle(()=>old.resolve({items:[{id:'stale',login:'OLD ENTRY',storeId:'store-a'}]}));assert.doesNotMatch(document.body.textContent,/OLD ENTRY/);assert.match(document.body.textContent,/New entry buyer/);
  await ctx.rerender({stores:[{id:'store-b',name:'Revoked',active:false}]});assert.doesNotMatch(document.body.textContent,/New entry buyer/);assert.equal(document.querySelector('[aria-label="Κατάστημα λογαριασμών"]').value,'');
 });
});
