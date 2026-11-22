import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
test('actual mounted POS keeps fourteen defaults and exposes configured sixteenth/twentieth category without checkout',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logLevel:'silent'});
 const keys=['window','document','navigator','localStorage','sessionStorage','HTMLElement','Event','MutationObserver','FormData','IS_REACT_ACT_ENVIRONMENT','fetch'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const count of [14,16,20]){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/store/A'});
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>({ok:true}):dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
  const calls=[],api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(path==='/api/store-pos/stores/A')return {products:[{id:'p',name:'SYNTHETIC PRODUCT',sku:'P',barcodes:[],salePrice:1,currentStock:0}],access:{},layout:{catalogCompanyId:'company-A',quickKeys:[],categories:Array.from({length:count},(_,i)=>({id:`c${i}`,label:`Group ${i+1}`,visible:true,color:'#1597a5',productCodes:['p']}))}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('inactive');if(path.endsWith('/holds'))return {rows:[]};if(path.endsWith('/audience-discounts'))return {items:[]};if(path.endsWith('/pending'))return {requests:[]};return {}};
  const root=createRoot(document.getElementById('root'));
  try{
   await act(async()=>{root.render(React.createElement(m.exports.default,{api,store:{id:'A',name:'Synthetic Store'},operator:{id:'op'},runtimeAccess:{confirmDeleteSale:false,deleteSaleReason:false}}));await pause()});await act(async()=>{await pause()});
   const grid=document.querySelector('.standard-category-strip > div');assert.ok(grid);const buttons=[...grid.querySelectorAll(':scope > button')];assert.equal(buttons.length,count);assert.equal(document.querySelector('.pos-modern-quick-tab').getAttribute('aria-pressed'),'true');
   await act(async()=>{buttons.at(-1).click();await pause()});assert.equal(buttons.at(-1).getAttribute('aria-pressed'),'true');assert.match(document.querySelector('.pos-modern-catalog-title').textContent,new RegExp(`Group ${count}`));assert.ok(document.querySelector('.pos-modern-product-grid').textContent.includes('SYNTHETIC PRODUCT'));assert.equal(document.querySelector('.pos-category-products-modal'),null);assert.equal(document.querySelectorAll('.standard-line').length,0);assert.equal(calls.some(c=>/checkout|preparation-batches/.test(c.path)),false);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k]}
 }
});

test('actual designer import keeps the selected template palette while replacing company product assignments',async()=>{
 const code=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Component from './client/src/components/platform/PosDesignerPanel.jsx';window.root=createRoot(document.getElementById('root'));window.root.render(React.createElement(Component,{request:window.fixtureRequest,onClose:()=>{}}));`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.invalid'}),w=dom.window,calls=[];
 const quickKeys=Array.from({length:20},(_,i)=>({id:`q${i}`,label:'ΚΕΝΟ',productQuery:'',productCodes:[],color:'#1531a2',visible:true})),categories=Array.from({length:14},(_,i)=>({id:`c${i}`,label:`Group ${i}`,categoryName:`Group ${i}`,productCodes:[],color:'#81549a',visible:true}));
 w.fixtureRequest=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/prepare-company-layout'))return {layout:{quickKeys:quickKeys.map((q,i)=>({...q,label:i?'ΚΕΝΟ':'IMPORTED PRODUCT',productQuery:i?'':'p',productCodes:i?[]:['p'],color:'#dc7a27'})),categories:Array.from({length:16},(_,i)=>({...categories[0],id:`new${i}`,label:`Imported group ${i}`,color:'#dc7a27'}))}};return {draft:{catalogCompanyId:'company-A',title:'POS',quickKeys,categories,buttons:[]},companies:[],published:[]}};
 const until=async fn=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause()}throw Error('fixture did not render')};
 try{
  w.eval(code.outputFiles[0].text);const input=await until(()=>w.document.querySelector('textarea[aria-label="Λίστα προϊόντων POS"]'));
  Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(input,JSON.stringify({companyId:'company-A',quickKeys:[{productId:'p'}],categories:[{label:'New',productIds:['p']}]}));input.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Έλεγχος και φόρτωση λίστας').click();await until(()=>w.document.querySelector('.designer-standard-preview aside button')?.textContent.includes('IMPORTED PRODUCT'));
  assert.equal(w.document.querySelector('.designer-standard-preview aside button').style.background,'rgb(21, 49, 162)');const groupButtons=w.document.querySelectorAll('.designer-standard-preview main section button');assert.equal(groupButtons.length,16);assert.equal(groupButtons[0].style.background,'rgb(129, 84, 154)');assert.equal(groupButtons[15].style.background,'rgb(220, 122, 39)');assert.equal(calls.some(c=>c.options.method==='PUT'||c.path.endsWith('/publish-store-layout')||c.path.endsWith('/publish')),false);
 }finally{w.root?.unmount();w.close()}
});

test('actual button editor recognizes legacy aliases and saves canonical company product IDs for child groups',async()=>{
 const code=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Component from './client/src/components/store/StorePosButtonEditor.jsx';window.root=createRoot(document.getElementById('root'));window.root.render(React.createElement('div',{className:'mws-standard-pos'},React.createElement('span',{'data-pos-button-editor-store':'store-A'}),React.createElement(Component,window.fixtureProps)));`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.invalid'}),w=dom.window,calls=[];
 const layout={catalogCompanyId:'company-A',quickKeys:[],categories:[{id:'coffee',label:'Coffee',color:'#1597a5',children:[{id:'cold',label:'Cold',categoryName:'Cold',productCodes:['LEGACY-SKU']}]}]};
 w.fixtureProps={api:async(path,options)=>{calls.push({path,options});return {layout:JSON.parse(options.body).layout}},store:{id:'store-A'},layout,products:[{id:'product-id',name:'SYNTHETIC COFFEE',sku:'LEGACY-SKU',sourceCode:'LEGACY-SKU',barcodes:['BARCODE'],salePrice:1}],enabled:true,onSaved:()=>{}};
 const until=async fn=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause()}throw Error('fixture did not render')};
 try{
  w.eval(code.outputFiles[0].text);const opener=await until(()=>w.document.querySelector('[aria-label="Ρύθμιση πλήκτρων POS"]'));await pause();opener.click();const slot=await until(()=>w.document.querySelector('[data-pos-edit-kind="category"][data-pos-edit-index="0"]'));slot.click();
  let product=await until(()=>w.document.querySelector('.pos-button-children article button'));assert.equal(product.className,'selected');product.click();await pause();product=w.document.querySelector('.pos-button-children article button');assert.notEqual(product.className,'selected');product.click();await pause();[...w.document.querySelectorAll('button')].find(b=>b.textContent==='✓ Αποθήκευση').click();await until(()=>calls.length);
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/store-pos/stores/store-A/layout');assert.equal(calls[0].options.method,'PUT');const saved=JSON.parse(calls[0].options.body).layout;assert.deepEqual(saved.categories[0].children[0].productCodes,['product-id']);assert.equal(saved.catalogCompanyId,'company-A');assert.deepEqual(layout.categories[0].children[0].productCodes,['LEGACY-SKU']);
 }finally{w.root?.unmount();w.close()}
});
