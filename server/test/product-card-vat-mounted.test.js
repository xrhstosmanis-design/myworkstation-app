import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('existing full card retains exact stored department, selects same-rate alternative and blocks missing mapping',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);

 const vats=[{id:'food',description:'Food',vatRate:13,cashRegisterDepartment:5},{id:'services',description:'Services',vatRate:13,cashRegisterDepartment:7}];
 const product={id:'p',sku:'P',name:'Product',vatDepartmentId:'services',vatRate:13,salePrice:2,costPrice:1,active:true,trackStock:true,barcodes:[],stores:[{storeId:'A',active:true,salePrice:2,currentStock:0}]};
 const archive={categories:[],subcategories:[],items:[{productId:'p',sku:'P',name:'Product',salePrice:2,currentStock:0}],taxonomy:{categories:[],subcategories:[]},page:1,pages:1,total:1,totals:{}};const calls=[];
 const api=async(path,options)=>{calls.push({path,options});if(path.startsWith('/api/inventory-archive?'))return archive;if(path.includes('/catalog?'))return [product];if(path.endsWith('/details'))return {supplierCodes:[],suppliers:[],purchases:[],statistics:{},vatDepartments:vats};if(path.endsWith('/card'))return {ok:true};throw Error(path)};
 const root=createRoot(document.getElementById('root'));
 const field=text=>[...document.querySelectorAll('.ia-form-grid.edit label')].find(x=>x.firstChild?.textContent===text)?.querySelector('input,select');
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:'A',stores:[{id:'A',name:'A'}],onClose(){}})));
  const open=async()=>act(async()=>document.querySelector('button[title="Διόρθωση είδους"]').click());
  await open();assert.equal(field('Τμήμα ΦΠΑ').value,'services');assert.equal(field('% ΦΠΑ').value,'13');
  await change(field('Τμήμα ΦΠΑ'),'food');await act(async()=>button('Καταχώρηση').click());
  const writes=calls.filter(x=>x.options?.method);assert.equal(writes.length,1);const payload=JSON.parse(writes[0].options.body);assert.equal(payload.vatDepartmentId,'food');assert.equal(payload.vatRate,13);assert.equal(payload.stores[0].storeId,'A');
  product.vatDepartmentId=null;await open();assert.equal(field('Τμήμα ΦΠΑ').value,'');await act(async()=>button('Καταχώρηση').click());assert.equal(calls.filter(x=>x.options?.method).length,1);assert.match(document.body.textContent,/Επίλεξε ενεργό Τμήμα ΦΠΑ/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
