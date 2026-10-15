import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted Archive selects dependent taxonomy/real VAT, store price payload, horizontal control and explicit merge preview',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const rows=[{productId:'p1',sku:'1',name:'ONE',salePrice:2,currentStock:0,vatDepartmentName:'Food13'},{productId:'p2',sku:'2',name:'TWO',salePrice:3,currentStock:-1}];
 const archive={items:rows,categories:[],subcategories:[],taxonomy:{categories:[{id:'cat',name:'Food'},{id:'other',name:'Other'}],subcategories:[{id:'sub',categoryId:'cat',name:'Snacks'},{id:'foreign',categoryId:'other',name:'Wrong'}]},vatDepartments:[{id:'dep',description:'Food13',vatRate:13,cashRegisterDepartment:5}],page:1,pages:1,total:2,totals:{}};
 const calls=[],api=async(path,options)=>{calls.push({path,options});if(path.startsWith('/api/inventory-archive?'))return archive;if(path.endsWith('/bulk-card'))return {changed:2};if(path.endsWith('/merge/preview'))return {rows:rows.map(r=>({...r,id:r.productId})),barcodes:[{barcode:'123'}],combinedStock:-1,blockers:['Κλείσε πρώτα τις βάρδιες POS'],previewHash:'a'.repeat(64)};throw Error(path)};
 const root=createRoot(document.getElementById('root')),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),field=text=>[...document.querySelectorAll('.ia-modal label')].find(l=>l.firstChild?.textContent===text)?.querySelector('select,input');
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));if(el.tagName==='INPUT')el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 try{
 await act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:'A',stores:[{id:'A',name:'LAB'}],onClose(){}})));
 assert.ok(document.querySelector('input[aria-label="Οριζόντια κύλιση ειδών"]'));assert.match(document.querySelector('.ia-row.head').textContent,/Τμήμα ΦΠΑ/);assert.match(document.querySelector('.ia-row.data').textContent,/Food13/);
 await act(async()=>document.querySelector('.ia-row.head input[type=checkbox]').click());await act(async()=>button('Ομαδική διόρθωση').click());
 await change(field('Κατηγορία'),'cat');assert.ok([...field('Υποκατηγορία').options].some(o=>o.value==='sub'));assert.ok(![...field('Υποκατηγορία').options].some(o=>o.value==='foreign'));
 await change(field('Υποκατηγορία'),'sub');await change(field('Τμήμα ΦΠΑ'),'dep');await change(field('Αλλαγή λιανικής'),'INCREASE_PERCENT');await change(field('Ποσοστό %'),'10');await act(async()=>button('Καταχώρηση').click());
 const payload=JSON.parse(calls.find(c=>c.path.endsWith('/bulk-card')).options.body);assert.equal(payload.storeId,'A');assert.equal(payload.categoryId,'cat');assert.equal(payload.subcategoryId,'sub');assert.equal(payload.vatDepartmentId,'dep');assert.equal(payload.vatRate,13);assert.equal(payload.priceMode,'INCREASE_PERCENT');assert.equal(payload.priceValue,10);assert.deepEqual(payload.expectedPrices,{p1:2,p2:3});assert.match(payload.requestId,/^[a-f0-9-]{36}$/);
 await act(async()=>button('Συγχώνευση ειδών').click());await change(field('Είδος που θα κρατηθεί'),'p1');assert.equal(button('Επιβεβαίωση συγχώνευσης').disabled,true);await act(async()=>button('Προεπισκόπηση συγχώνευσης').click());assert.match(document.querySelector('.ia-merge-body').textContent,/Τελικό απόθεμα: -1/);assert.equal(button('Επιβεβαίωση συγχώνευσης').disabled,true);assert.equal(calls.some(c=>c.path.endsWith('/merge/confirm')),false);
 await act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:'B',stores:[{id:'B',name:'CONTROL'}],onClose(){}})));assert.equal(document.querySelector('.ia-modal'),null);assert.equal(button('Συγχώνευση ειδών').disabled,true);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
