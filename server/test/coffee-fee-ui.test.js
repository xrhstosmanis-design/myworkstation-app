import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const pause=()=>new Promise(r=>setTimeout(r,15));
async function until(fn){for(let i=0;i<400;i++){const value=fn();if(value)return value;await pause()}assert.fail('Rendered state unavailable')}
const button=(w,text)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const labelInput=(w,text)=>[...w.document.querySelectorAll('label')].find(l=>l.textContent.includes(text))?.querySelector('input');
function value(w,input,value){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));input.dispatchEvent(new w.Event('change',{bubbles:true}))}
test('actual inventory bulk SET requires reviewed selection and explicit confirmation; store change clears draft',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Component from './client/src/components/commerce/InventoryArchivePanel.jsx';window.root=createRoot(document.getElementById('root'));window.renderFixture=props=>window.root.render(React.createElement(Component,{api:window.fixtureApi,...props}));`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'}),w=dom.window,calls=[];
 const coffees=[{productId:'a',sku:'COFFEE-A',name:'Synthetic Coffee A',salePrice:1.65},{productId:'b',sku:'COFFEE-B',name:'Synthetic Coffee B',salePrice:2}];
 w.fixtureApi=async(path,options={})=>{calls.push({path,options});if(options.method==='PATCH')return {changed:2};const q=new URL(path,'https://isolated.test').searchParams;return {items:q.get('q')==='FEE'?[{productId:'fee',sku:'FEE',name:'Synthetic Fee',salePrice:.05}]:coffees,total:2,page:1,pages:1,categories:[],subcategories:[],taxonomy:{categories:[],subcategories:[]},vatDepartments:[],totals:{}}};
 w.eval(bundle.outputFiles[0].text);w.renderFixture({storeId:'A',stores:[{id:'A',name:'Store A'},{id:'B',name:'Store B'}],onClose:()=>{}});
 try{
  await until(()=>w.document.querySelectorAll('.ia-row.data').length===2);w.document.querySelector('.ia-row.head input[type="checkbox"]').click();
  await until(()=>!button(w,'Ομαδική διόρθωση').disabled);button(w,'Ομαδική διόρθωση').click();
  (await until(()=>labelInput(w,'Προσθήκη συνοδευτικού SET'))).click();await pause();
  button(w,'Καταχώρηση').click();await pause();assert.equal(calls.filter(c=>c.options.method==='PATCH').length,0);
  value(w,w.document.getElementById('ia-set-product-search'),'FEE');
  (await until(()=>[...w.document.querySelectorAll('.ia-set-search-results button')].find(b=>b.textContent.includes('Synthetic Fee')))).click();
  await pause();value(w,labelInput(w,'Τιμή συνοδευτικού'),'0.05');await pause();labelInput(w,'Αφαίρεση ίδιας').click();await pause();
  assert.match(w.document.body.textContent,/Synthetic Coffee A/);assert.match(w.document.body.textContent,/Synthetic Coffee B/);
  button(w,'Καταχώρηση').click();await pause();assert.equal(calls.filter(c=>c.options.method==='PATCH').length,0);
  labelInput(w,'Επιβεβαιώνω το συνοδευτικό').click();await pause();button(w,'Καταχώρηση').click();
  await until(()=>calls.some(c=>c.options.method==='PATCH'));
  const payload=JSON.parse(calls.find(c=>c.options.method==='PATCH').options.body);
  assert.equal(payload.storeId,'A');assert.deepEqual(payload.productIds,['a','b']);assert.deepEqual(payload.setItem,{confirmed:true,relatedProductId:'fee',quantity:1,salePrice:.05,clearPreparationFee:true});assert.equal(payload.priceMode,undefined);assert.equal(payload.vatDepartmentId,undefined);assert.equal(payload.active,undefined);
  await until(()=>!w.document.querySelector('.ia-modal-backdrop'));w.renderFixture({storeId:'B',stores:[{id:'B',name:'Store B'}],onClose:()=>{}});await pause();await pause();assert.equal(w.document.querySelector('.ia-modal-backdrop'),null);assert.equal(calls.filter(c=>c.options.method==='PATCH').length,1);
 }finally{w.root.unmount();w.close()}
});
test('actual mounted POS adds separate fee, scales quantity, protects child and removes only its parent fees',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/store/A'}),keys=['window','document','navigator','localStorage','sessionStorage','HTMLElement','Event','MutationObserver','FormData','IS_REACT_ACT_ENVIRONMENT','fetch'];const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>({ok:true}):dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logLevel:'silent'});const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const fee={id:'fee',name:'ENVIRONMENTAL FEE',sku:'FEE',salePrice:.05,quantity:1,currentStock:0};const coffees=[{id:'a',name:'COFFEE A',sku:'A',salePrice:1.65,currentStock:0,isSet:true,setItems:[fee],barcodes:[]},{id:'b',name:'COFFEE B',sku:'B',salePrice:2,currentStock:0,isSet:true,setItems:[fee],barcodes:[]}],calls=[];
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(path==='/api/store-pos/stores/A')return {products:[...coffees,fee],access:{},layout:{quickKeys:coffees.map(p=>({id:p.id,visible:true,label:p.name,productQuery:p.sku})),categories:[]}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('inactive');if(path.endsWith('/holds'))return {rows:[]};if(path.endsWith('/audience-discounts'))return {items:[]};if(path.endsWith('/pending'))return {requests:[]};return {}};
 const root=createRoot(document.getElementById('root'));const click=async el=>{assert.ok(el);await act(async()=>{el.click();await pause()})};const line=name=>[...document.querySelectorAll('.standard-line')].find(l=>l.querySelector('.line-name b')?.textContent===name);const qty=row=>row.querySelector('.line-qty b').textContent;
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,{api,store:{id:'A',name:'Store A'},operator:{id:'op'},runtimeAccess:{confirmDeleteSale:false,deleteSaleReason:false}}));await pause()});await act(async()=>{await pause()});
  await click([...document.querySelectorAll('.standard-quick button')].find(b=>b.textContent==='COFFEE A'));
  assert.equal(document.querySelectorAll('.standard-line').length,2);assert.equal(qty(line('ENVIRONMENTAL FEE')),'1');assert.match(line('COFFEE A').querySelector('.line-price-action').textContent,/1,65/);
  await click(line('COFFEE A').querySelectorAll('.line-qty button')[1]);assert.equal(qty(line('ENVIRONMENTAL FEE')),'2');assert.equal(line('ENVIRONMENTAL FEE').querySelector('.line-total button').disabled,true);assert.equal(line('ENVIRONMENTAL FEE').querySelector('.line-qty button').disabled,true);
  await click([...document.querySelectorAll('.standard-quick button')].find(b=>b.textContent==='COFFEE B'));assert.equal(document.querySelectorAll('.standard-line').length,3);
  await click(line('COFFEE A').querySelector('.line-total button'));assert.equal(document.querySelectorAll('.standard-line').length,2);assert.equal(qty(line('ENVIRONMENTAL FEE')),'1');assert.ok(line('COFFEE B'));
  const quickA=[...document.querySelectorAll('.standard-quick button')].find(b=>b.textContent==='COFFEE A');
  await act(async()=>{quickA.click();quickA.click();await pause()});
  assert.equal(qty(line('COFFEE A')),'2');assert.equal([...document.querySelectorAll('.standard-line')].filter(l=>l.querySelector('.line-name b')?.textContent==='ENVIRONMENTAL FEE').reduce((n,l)=>n+Number(qty(l)),0),3);
  assert.equal(calls.some(c=>c.path.endsWith('/checkout')),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k]}
});

test('mobile waiter keeps SET coffee with cleared embedded fee in the POS-only flow',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Component from './client/src/components/store/StoreMobileWaiter.jsx';window.root=createRoot(document.getElementById('root'));window.root.render(React.createElement(Component,{api:window.fixtureApi,store:{id:'A',name:'Synthetic Store'}}));`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'}),w=dom.window,calls=[];
 w.fixtureApi=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/table-service'))return {areas:[],tables:[{id:'table',name:'Synthetic Table'}],orders:[]};if(path.includes('/modifiers?'))return {settings:{environmentalFee:0},groups:[]};return {products:[{id:'coffee',name:'Synthetic Coffee',sku:'COFFEE',salePrice:1.65,isSet:true}]}};
 try{w.eval(bundle.outputFiles[0].text);(await until(()=>w.document.querySelector('.mobile-waiter-tables button'))).click();await until(()=>w.document.querySelector('input'));value(w,w.document.querySelector('input'),'COFFEE');(await until(()=>w.document.querySelector('.mobile-waiter-results button'))).click();await until(()=>w.document.body.textContent.includes('συνοδευτικά SET'));assert.equal(w.document.querySelector('footer button').disabled,true);assert.equal(calls.some(c=>c.options.method==='POST'),false)}finally{w.root?.unmount();w.close()}
});
