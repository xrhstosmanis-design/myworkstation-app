import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('actual POS opens its existing scoped Archive, locks stock, preserves basket and never uses Owner context token',async()=>{
 const compiled=await build({stdin:{contents:`import '${fileURLToPath(new URL('../../client/src/components/commerce/inventoryProductActionsV2.js',import.meta.url))}';export {default} from '${fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))}';`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','sessionStorage','fetch','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const fetches=[];for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async(...args)=>{if(String(args[0]).startsWith('/api/health')||String(args[0]).startsWith('/health'))return{ok:true};fetches.push(args);throw Error('General token must never be used')}:dom.window[key]});
 localStorage.setItem('token','unrelated-owner-session');sessionStorage.setItem('storeOperatorToken','isolated-operator-session');
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 let catalogPrice=2;
 const calls=[],operator={id:'O',employeeId:'E',fullName:'Fixture operator'},store={id:'S',name:'Fixture store'};
 const rights={inventoryPos:true},capabilities={read:true,edit:false,prices:true,barcodes:true,create:true,lookup:false,print:true,stock:false};
 const product={id:'P',sku:'1',name:'Fixture item',salePrice:2,costPrice:1,vatRate:13,vatVerified:true,vatDepartmentId:'D',unit:'PIECE',active:true,isSet:true,barcodes:[],stores:[{storeId:'S',salePrice:2,currentStock:17,active:true,minStock:null}]};
 const archive={store,items:[{productId:'P',sku:'1',name:product.name,salePrice:2,currentStock:17}],categories:[],subcategories:[],taxonomy:{categories:[],subcategories:[]},page:1,pages:1,total:1,totals:{}};
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.includes('/inventory/')){
   let data={ok:true};if(path.includes('/archive?'))data=archive;if(path.includes('/products/catalog'))data=[product];if(path.endsWith('/products/P/details'))data={supplierCodes:[],suppliers:[],purchases:[],statistics:{currentStock:17},vatDepartments:[{id:'D',description:'Food13',vatRate:13}]};
   if(path.endsWith('/products/P/card'))catalogPrice=3;
   if(path.includes('/products/P/movements'))data={product:{currentStock:17},movements:[]};
   return{data,scope:{storeId:'S',actorId:'O'},capabilities,lifecycle:{generation:'0'}};
  }
  if(path==='/api/store-pos/stores/S')return{selectedStoreId:'S',products:[{...product,salePrice:catalogPrice}],layout:{quickKeys:[],categories:[]},access:rights};
  if(path.endsWith('/ftext-cash/capability'))return{storeId:'S',configured:false};
  if(path.includes('barcode-registration?countOnly=true'))return{missingCount:0};
  if(path.endsWith('/online-radio'))return{moduleActive:false,enabled:false,stations:[]};
  return{rows:[],items:[],requests:[],offers:[],stations:[],state:{},areas:[],tables:[],orders:[],products:[]};
 };
 const button=(selector,text)=>[...document.querySelectorAll(selector)].find(node=>node.textContent.includes(text));
 const click=async node=>{assert.ok(node);assert.equal(node.disabled,false);await act(async()=>node.click())};
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store,operator,runtimeAccess:rights})));
  const scanner=document.querySelector('[data-pos-scanner]');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(scanner,'Fixture');scanner.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
  await click(document.querySelector('.pos-modern-product'));const basket=document.querySelector('.standard-line')?.textContent;assert.ok(basket?.includes('Fixture item'));
  await click(document.querySelector('.pos-header-menu-trigger'));await click(button('.pos-aux-actions button','Αποθήκη'));
  assert.ok(document.querySelector('.pos-inventory-overlay'));assert.equal(document.querySelector('.ia-shell').dataset.posInventory,'true');
  assert.match(document.querySelector('.ia-row.data').textContent,/17/);assert.ok(button('.ia-toolbar button','Μεταφορά').disabled);assert.ok(button('.ia-toolbar button','Συγχώνευση').disabled);
  await act(async()=>document.querySelector('.ia-row.data').dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  assert.equal(document.querySelector('#mws-inv-menu'),null,'legacy menu must not capture operator rows');assert.ok(button('.ia-modal button','Καρτέλα είδους'));
  await click(document.querySelector('.ia-modal header button'));await click(document.querySelector('.ia-edit button'));
  const stock=[...document.querySelectorAll('.ia-modal label')].find(label=>label.textContent.startsWith('Stock καταστήματος'))?.querySelector('input');assert.ok(stock);assert.equal(stock.disabled,true);assert.equal(stock.value,'17');
  await click(button('.ia-card-tabs button','SET'));assert.ok(document.querySelector('.ia-modal.set-editor > .ia-composition'),'capability checks retain the original flex child and visible SET footer layout');assert.ok(button('.ia-set-composition-form button','Νέα συσχέτιση').disabled,'read-only metadata cannot mutate composition');await click(button('.ia-card-tabs button','Βασικά στοιχεία'));
  await click(button('.ia-modal-actions button','Καταχώρηση'));assert.ok(calls.some(call=>call.path.endsWith('/inventory/products/P/card')));assert.equal(calls.filter(call=>/stock-adjustment|destruction|stock-transfer/.test(call.path)).length,0);
  await click(button('.pos-inventory-overlay>section>header button','Κλείσιμο'));assert.equal(document.querySelector('.pos-inventory-overlay'),null);assert.equal(document.querySelector('.standard-line')?.textContent,basket,'the existing basket survives archive editing and closing');assert.equal(calls.filter(call=>call.path==='/api/store-pos/stores/S').length,2,'closing refreshes current-store POS catalog through its original read API');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(scanner,'Fixture');scanner.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});assert.match(document.querySelector('.pos-modern-product').textContent,/3[,.]00/,'subsequent catalog reads show the updated retail');assert.equal(calls.filter(call=>/checkout|consumption|stock-adjustment/.test(call.path)).length,0);assert.equal(fetches.length,0);assert.equal(calls.filter(call=>call.path.startsWith('/api/owner-products')||call.path.startsWith('/api/inventory-archive')).length,0);
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store,operator,runtimeAccess:{inventoryPos:false}})));await click(document.querySelector('.pos-header-menu-trigger'));assert.equal(button('.pos-aux-actions button','Αποθήκη'),undefined);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
