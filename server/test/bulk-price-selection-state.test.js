// Actual product center and preview installer, isolated DOM/API only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('bulk preview preserves selected references across search/filter and clears React state on reset',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','localStorage','sessionStorage','HTMLElement','Node','Event','FormData','IS_REACT_ACT_ENVIRONMENT','fetch','alert','confirm'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const requests=[],alerts=[];
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async(path,options)=>{requests.push({path,payload:JSON.parse(options.body)});return {ok:true,json:async()=>({counts:{total:2,changed:2},canCommit:true,previewHash:'a'.repeat(64),rows:[]})}}:key==='alert'?message=>alerts.push(message):key==='confirm'?()=>false:dom.window[key]});
 sessionStorage.setItem('mws:owner-products-tab','bulk');
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/OwnerProductCenter.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root'));
 const products=[{id:'p1',name:'One',sku:'SKU-1',salePrice:2,categoryName:'A'},{id:'p2',name:'Two',sku:'SKU-2',salePrice:3,categoryName:'B'}];
 const calls=[];
 const api=async path=>{calls.push(path);return path.includes('q=Two')?[products[1]]:products};
 const click=async el=>{assert.ok(el);await act(async()=>{el.click();await new Promise(r=>setTimeout(r,5))})};
 const input=async(el,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));})};
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,stores:[{id:'s',name:'LAB',active:true}]})));
  assert.equal(calls.length,0,'bulk opening must not fetch entire catalog');
  const query=document.querySelector('.bulk-product-search input'),search=document.querySelector('.bulk-product-search button');
  await input(query,'One');await click(search);
  await click(document.querySelector('.bulk-check-list input'));
  await input(query,'Two');await click(search);
  assert.equal(document.querySelectorAll('.bulk-check-list input').length,1);
  assert.match(document.querySelector('.bulk-selected-products').textContent,/One/);
  await click(document.querySelector('.bulk-check-list input'));
  await click(document.querySelectorAll('fieldset')[1].querySelector('input'));
  const form=document.querySelector('.bulk-price-workflow');form.elements.value.value='4';
  let selection=JSON.parse(form.elements.bulkSelection.value);
  assert.deepEqual(selection,{productRefs:[{name:'One',sku:'SKU-1'},{name:'Two',sku:'SKU-2'}],storeNames:['LAB']});
  const category=document.querySelector('.bulk-product-filters select');await act(async()=>{category.value='B';category.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  assert.deepEqual(JSON.parse(form.elements.bulkSelection.value),selection);
  const {installBulkPricePreview}=await import('../../client/src/components/commerce/installBulkPricePreview.js');installBulkPricePreview();
  await act(async()=>{form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10))});
  assert.equal(alerts.length,0);
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/owner-products/prices/bulk/preview');
  assert.deepEqual(requests[0].payload,{...selection,mode:'SET',value:4});
  await click(document.querySelector('[data-bpp-commit]'));
  assert.equal(requests.length,1,'cancelled final confirmation must not submit prices');
  await click(document.querySelector('[data-bpp-close]'));
  await click(document.querySelector('.bulk-selected-products button'));
  assert.deepEqual(JSON.parse(form.elements.bulkSelection.value).productRefs,[{name:'Two',sku:'SKU-2'}]);
  await act(async()=>{form.reset()});
  assert.deepEqual(JSON.parse(form.elements.bulkSelection.value),{productRefs:[],storeNames:[]});
  assert.equal(document.querySelectorAll('input[type="checkbox"]:checked').length,0);
  assert.match(form.querySelector('button.primary').textContent,/0 προϊόντα × 0/);
  // A subsequent render must not resurrect the cleared checkboxes.
  await input(query,'One');await click(search);
  assert.equal(document.querySelectorAll('input[type="checkbox"]:checked').length,0);
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
 }
});
