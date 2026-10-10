import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('actual mobile inventory opens a new-product form and returns to the same draft after one save',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/inventory/take'});
 const names=['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','Node','Event','CustomEvent','FormData','fetch','addEventListener','removeEventListener','IS_REACT_ACT_ENVIRONMENT'];
 const before=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of names)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:['addEventListener','removeEventListener'].includes(key)?dom.window[key].bind(dom.window):dom.window[key]});
 sessionStorage.setItem('inventory:take','isolated-token');
 let lines=[{id:'original',productId:'p1',name:'Original',sku:'OLD',barcode:'111111',barcodes:['111111','222222'],expectedQuantity:4,countedQuantity:4,countVersion:1}],created=false,failReadback=false,createRelease=null;
 const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,options});let result;
 if(path.endsWith('/new-product-options'))result={categories:[{id:'cat',name:'Category'}],vats:[{id:'vat',description:'VAT13',vatRate:13}]};
 else if(path.endsWith('/products')){if(createRelease)await createRelease;created=true;const b=JSON.parse(options.body);lines=[...lines,{id:'new-line',productId:'p2',name:b.name,sku:'10002',barcode:b.barcode,barcodes:[b.barcode],expectedQuantity:0,countedQuantity:null,countVersion:0}];result={id:'p2',sku:'10002',lineId:'new-line'};}
 else {if(failReadback)throw Error('isolated readback failure');result={id:'take',name:'Same inventory',storeId:'store',storeName:'LAB',status:'DRAFT',lines};}
 return {ok:true,json:async()=>result};};
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryMobileApp.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root'));
 const input=async(el,value)=>{assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));})};
 const click=async(el)=>{assert.ok(el);await act(async()=>{el.click();await new Promise(r=>setTimeout(r,1))})};
 const find=async(code)=>{await input(document.querySelector('input[placeholder="Barcode, SKU ή προϊόν"]'),code);await act(async()=>document.querySelector('.inv-mobile-fast form').dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true})))};
 try{
 await act(async()=>root.render(React.createElement(module.exports.default,{stocktakeId:'take'})));
 await find('999999');await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Δημιουργία νέου είδους')));
 const form=document.querySelector('.inv-new-product form');assert.ok(form,'mobile new-entry button must mount a working form in this standalone app');
 assert.equal(form.elements.barcode.value,'999999');
 await input(form.elements.name,'New virtual item');await input(form.elements.salePrice,'1.20');
 await act(async()=>form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true})));
 assert.equal(created,true);assert.equal(document.querySelector('.inv-new-product'),null);
 assert.match(document.querySelector('h1').textContent,/Same inventory/);
 assert.match(document.body.textContent,/New virtual item/);
 assert.match(document.body.textContent,/1\/2 μετρήθηκαν/);
 const posts=calls.filter(c=>c.options?.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/inventory-v2/stocktakes/take/products');
 const payload=JSON.parse(posts[0].options.body);assert.equal(payload.barcode,'999999');assert.equal(payload.categoryId,'cat');assert.equal(payload.vatDepartmentId,'vat');assert.equal(payload.storeIds,undefined);assert.equal(payload.initialStock,undefined);
 assert.equal(lines[0].countedQuantity,4);
 await find('222222');assert.equal(document.querySelector('.inv-unknown-barcode'),null,'additional barcode already attached must select the original item');assert.match(document.querySelector('.inv-mobile-selected').textContent,/Original/);
 assert.equal(posts.length,1,'selection must not save a count');
 await find('333333');await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Δημιουργία νέου είδους')));
 await click(document.querySelector('[aria-label="Ακύρωση νέου είδους"]'));assert.equal(document.querySelector('.inv-new-product'),null);assert.equal(calls.filter(c=>c.options?.method==='POST').length,1);
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Δημιουργία νέου είδους')));
 const retryForm=document.querySelector('.inv-new-product form');await input(retryForm.elements.name,'Second virtual item');await input(retryForm.elements.salePrice,'2');
 failReadback=true;
 await act(async()=>retryForm.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true})));
 assert.match(document.querySelector('.inv-new-product').textContent,/Το είδος αποθηκεύτηκε/);assert.equal(calls.filter(c=>c.options?.method==='POST').length,2);
 failReadback=false;
 await act(async()=>retryForm.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,2,'readback retry never re-creates the saved product');assert.equal(document.querySelector('.inv-new-product'),null);
 assert.match(document.querySelector('h1').textContent,/Same inventory/);

 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of before){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
