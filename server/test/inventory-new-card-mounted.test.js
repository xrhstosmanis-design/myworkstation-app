import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('actual Archive New item reuses full card, scoped single save and explicit lookup preview with stale result rejection',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const calls=[],pending=[],archive={items:[],categories:[],subcategories:[],taxonomy:{categories:[{id:'cat',name:'Food'}],subcategories:[{id:'sub',categoryId:'cat',name:'Snacks'}]},page:1,pages:1,total:0,totals:{}};
 let saveResolve;
 const api=async(path,options)=>{calls.push({path,options});if(path.startsWith('/api/inventory-archive?'))return archive;if(path.includes('/new-card/options'))return {brands:[{id:'brand',name:'Brand'}],suppliers:[{id:'supplier',name:'Supplier'}]};if(path.includes('/smart-entry/barcode/'))return new Promise(resolve=>pending.push({path,resolve}));if(path==='/api/owner-products/new-card')return new Promise(resolve=>{saveResolve=resolve});throw Error(path)};
 const root=createRoot(document.getElementById('root')),render=storeId=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId,stores:[{id:storeId,name:storeId}],onClose(){}})));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const field=text=>[...document.querySelectorAll('.ia-form-grid.edit label')].find(x=>x.firstChild?.textContent===text)?.querySelector('input,select');
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))});
 try{
  await render('A');await act(async()=>button('Νέο είδος').click());
  assert.match(document.body.textContent,/Νέο είδος · Πλήρης καρτέλα/);for(const label of ['Περιεκτικότητα','Τιμή προσωπικού','Τιμή delivery','Ελάχιστη παραγγελία','Κωδικοί προμηθευτών','Στατιστικά','Αγορές'])assert.ok(document.body.textContent.includes(label),label);
  await change(field('Γραμμωτός κώδικας'),'520000000001');await act(async()=>button('Αναζήτηση online').click());assert.equal(new URL(pending[0].path,'https://test.invalid').searchParams.get('storeId'),'A');
  await change(field('Γραμμωτός κώδικας'),'520000000002');await act(async()=>button('Αναζήτηση online').click());
  await act(async()=>pending[0].resolve({found:true,source:'OPEN_FOOD_FACTS',product:{name:'Stale'}}));assert.doesNotMatch(document.body.textContent,/Stale/);
  await act(async()=>pending[1].resolve({found:true,source:'OPEN_FOOD_FACTS',product:{name:'Online name',brandName:'Brand',categoryName:'Food',subcategoryName:'Snacks',vatRate:99}}));
  assert.equal(field('Περιγραφή').value,'');await act(async()=>button('Χρήση διαθέσιμων στοιχείων').click());assert.equal(field('Περιγραφή').value,'Online name');assert.equal(field('% ΦΠΑ').value,'24');assert.equal(field('Κατηγορία').value,'cat');
  await change(field('Τιμή προσωπικού'),'1.4');await change(field('Τιμή delivery'),'1.8');await change(field('Αρχικό απόθεμα'),'0');
  const saveButton=button('Καταχώρηση');await act(async()=>saveButton.click());assert.equal(saveButton.disabled,true);await act(async()=>saveButton.click());
  const saves=calls.filter(x=>x.options?.method==='POST');assert.equal(saves.length,1);const payload=JSON.parse(saves[0].options.body);assert.equal(payload.storeId,'A');assert.equal(payload.staffPrice,1.4);assert.equal(payload.deliveryPrice,1.8);assert.equal(payload.productCompanyId,'brand');assert.equal(payload.barcodes[0].barcode,'520000000002');assert.ok(payload.requestId);
  await act(async()=>saveResolve({id:'new',sku:'10001'}));assert.match(document.body.textContent,/10001/);
  await act(async()=>button('Νέο είδος').click());await change(field('Γραμμωτός κώδικας'),'520000000003');await act(async()=>button('Αναζήτηση online').click());await render('B');await act(async()=>pending[2].resolve({found:true,source:'OPEN_FOOD_FACTS',product:{name:'Wrong store'}}));assert.doesNotMatch(document.body.textContent,/Wrong store/);
  assert.equal(calls.filter(x=>x.options?.method==='POST').length,1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
