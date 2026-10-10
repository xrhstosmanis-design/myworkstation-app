import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('barcode and Excel forms persist once, reset after delayed success and reject unknown barcode',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','localStorage','sessionStorage','HTMLElement','Node','Event','FormData','FileReader','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 sessionStorage.setItem('mws:owner-products-tab','promotion-import');
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/OwnerProductCenter.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root'));
 const calls=[]; let resolvePost;
 const product={id:'actual',name:'Actual barcode product',barcodes:[{barcode:'12345678'}]};
 const api=async(path,options)=>{calls.push({path,options});if(options?.method==='POST')return new Promise(resolve=>{resolvePost=()=>resolve(path.includes('import-excel')?{created:1,stores:1}:{created:1})});if(path.includes('/catalog?'))return path.includes('12345678')?[product]:[];return {items:[]}};
 const input=async(el,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})};
 const submit=async(form)=>act(async()=>form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true})));
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,stores:[{id:'s',name:'LAB',active:true}]})));
  const [barcodeForm,excelForm]=document.querySelectorAll('.promotion-import-workspace form');
  assert.equal(barcodeForm.elements.store_s.checked,false,'distribution requires explicit selection');
  await act(async()=>barcodeForm.elements.store_s.click());
  await input(barcodeForm.elements.barcode,'unknown');await input(barcodeForm.elements.name,'Named offer');await input(barcodeForm.elements.percentOff,'5');
  await submit(barcodeForm);assert.match(document.querySelector('.op-alert.error').textContent,/Δεν βρέθηκε/);assert.equal(calls.filter(x=>x.options?.method==='POST').length,0);
  await input(barcodeForm.elements.barcode,'12345678');await submit(barcodeForm);
  const request=calls.find(x=>x.options?.method==='POST');assert.equal(request.path,'/api/price-catalog/promotions/scoped/barcode');assert.deepEqual(JSON.parse(request.options.body).productIds,['actual']);assert.equal(JSON.parse(request.options.body).name,'Named offer');
  assert.equal(barcodeForm.querySelector('button.primary').disabled,true);
  await act(async()=>{resolvePost();await new Promise(r=>setTimeout(r,5))});
  assert.equal(barcodeForm.elements.barcode.value,'');assert.match(document.querySelector('.op-alert.success').textContent,/1 προϊόντα/);
  const fileInput=excelForm.querySelector('input[type=file]');
  Object.defineProperty(fileInput,'files',{configurable:true,value:[new dom.window.File(['fixture'],'offers.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})]});
  await act(async()=>fileInput.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
  await act(async()=>{excelForm.elements.sourceStoreId.value='s';excelForm.elements.sourceStoreId.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  await submit(excelForm);await act(async()=>new Promise(r=>setTimeout(r,20)));
  const excelRequest=calls.filter(x=>x.options?.method==='POST')[1];assert.equal(excelRequest.path,'/api/owner-products/promotions/import-excel');assert.deepEqual(JSON.parse(excelRequest.options.body).targetStoreIds,[]);
  await act(async()=>{resolvePost();await new Promise(r=>setTimeout(r,5))});
  assert.equal(excelForm.elements.sourceStoreId.value,'');assert.match(document.querySelector('.op-alert.success').textContent,/Εισήχθησαν 1 γραμμές.*1 καταστήματα/);assert.doesNotMatch(document.body.textContent,/Cannot read|reset/);assert.equal(calls.filter(x=>x.options?.method==='POST').length,2);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
