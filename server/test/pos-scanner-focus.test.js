import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {exactScanBarcode,scannerCanFocus} from '../../client/src/utils/pos-scanner.js';

test('automatic barcode lookup requires unique complete stored barcode, never SKU/name or a longer-code prefix',()=>{
 const product={id:'p',sku:'52101588',name:'test',barcodes:['52101588']};
 assert.equal(exactScanBarcode([product],'52101588'),product);
 assert.equal(exactScanBarcode([{...product,barcodes:[]}],'52101588'),null);
 assert.equal(exactScanBarcode([product,{id:'long',barcodes:['5210158812345']}],'52101588'),null);
 assert.equal(exactScanBarcode([product,{...product,id:'duplicate'}],'52101588'),null);
 assert.equal(exactScanBarcode([product],'test'),null);
});

test('scanner focus respects disabled/detached inputs and visible dialogs, ignoring hidden minimized dialogs',()=>{
 const dom=new JSDOM('<input id="scan"><div aria-modal="true"><input></div>');
 const input=dom.window.document.getElementById('scan'),dialog=dom.window.document.querySelector('[aria-modal]');
 assert.equal(scannerCanFocus(input),false);
 dialog.style.display='none';assert.equal(scannerCanFocus(input),true);
 input.disabled=true;assert.equal(scannerCanFocus(input),false);input.disabled=false;input.remove();assert.equal(scannerCanFocus(input),false);dom.window.close();
});

test('actual POS scans once with/without Enter and returns focus after successful checkout while preserving pending/rejected cart',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[],product={id:'example',sku:'SKU',name:'Fixture product',currentStock:100,salePrice:1,barcodes:['52101588'],barcodeOptions:[{barcode:'52101588',salePrice:1.2}]};let checkout,fiscalRequest;
 const api=async(path,options={})=>{calls.push({path,options});if(fiscalRequest&&path.endsWith('/rbs-capdriver-v1/pending-scan-test'))return {request:fiscalRequest};if(path.endsWith('/checkout'))return new Promise((resolve,reject)=>{checkout={resolve,reject}});if(path==='/api/store-pos/stores/A')return {products:[product],layout:{quickKeys:[],categories:[]},access:{}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}}};
 const input=()=>document.querySelector('[data-pos-scanner]');
 const type=async value=>act(async()=>{input().focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 const enter=async()=>act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true})));
 const wait=async()=>act(async()=>new Promise(resolve=>setTimeout(resolve,230)));
 const count=()=>calls.filter(c=>c.path.endsWith('/audit')&&JSON.parse(c.options.body).actionType==='CART_ITEM_ADD').length;
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})));
  assert.equal(document.activeElement,input());
  await type('52101588');await enter();assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(count(),1);assert.equal(input().value,'');assert.equal(document.activeElement,input());
  await wait();assert.equal(count(),1);
  await type('52101588');await wait();assert.equal(count(),2);assert.equal(document.querySelector('.line-qty b').textContent,'2');await enter();assert.equal(count(),2);
  await type('Fixture');await wait();assert.equal(count(),2);assert.equal(input().value,'Fixture');
  const other=document.createElement('input');document.body.appendChild(other);other.focus();await wait();assert.equal(document.activeElement,other);
  await type('99999999');await enter();assert.match(document.querySelector('.standard-search-results').textContent,/δεν υπάρχει/);assert.equal(count(),2);
  const cash=document.querySelector('button.cash');await act(async()=>{cash.focus();cash.click()});assert.equal(input().disabled,true);assert.equal(calls.filter(c=>c.path.endsWith('/checkout')).length,1);
  await act(async()=>checkout.reject(Error('payment rejected')));assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(input().value,'99999999');assert.match(document.querySelector('.store-pos-alert.error').textContent,/payment rejected/);
  await act(async()=>cash.click());await act(async()=>checkout.resolve({total:2.4}));assert.equal(document.querySelectorAll('.standard-line').length,0);assert.equal(input().value,'');assert.equal(document.activeElement,input());
  const body=JSON.parse(calls.find(c=>c.path.endsWith('/checkout')).options.body);assert.equal(body.items[0].productId,'example');assert.equal(body.items[0].quantity,2);assert.equal(body.items[0].barcode,'52101588');
  await type('52101588');await enter();assert.equal(count(),3);assert.equal(document.querySelectorAll('.standard-line').length,1);
  await act(async()=>document.querySelector('button.card').click());assert.ok(document.querySelector('.pos-card-terminal-picker'));assert.equal(scannerCanFocus(input()),false);
  await enter();assert.equal(count(),3);
  await act(async()=>document.querySelector('.pos-card-terminal-picker button:not(.pos-primary-inline)').click());
  fiscalRequest={id:'pending-scan-test',status:'PENDING',paymentMethod:'CASH',total:1.2};await act(async()=>cash.click());await act(async()=>checkout.resolve({fiscalPending:true,request:fiscalRequest}));assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(input().disabled,true);assert.ok(document.querySelector('.pos-price-modal'));assert.equal(count(),3);assert.equal(calls.filter(c=>c.path.endsWith('/checkout')).length,3);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
