import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {withMountedPos} from './helpers/pos-modern-fixture.mjs';

const options={taxonomy:{categories:[{id:'category',name:'Food'}],subcategories:[{id:'subcategory',categoryId:'category',name:'Snacks'}]},brands:[{id:'brand',name:'Brand'}],suppliers:[{id:'supplier',name:'Supplier'}],vatDepartments:[{id:'vat13',description:'Food13',vatRate:13,cashRegisterDepartment:5},{id:'other13',description:'Other13',vatRate:13,cashRegisterDepartment:9}]};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryNewProductCard.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
async function withCard(api,run){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,module={exports:{}},require=createRequire(import.meta.url),realReact=require('react'),callbacks=[];
 const observedReact={...realReact,createElement(type,props,...children){if(type==='button'&&children.some(child=>child==='Καταχώρηση'||child==='Αποθήκευση…'))callbacks.push({kind:'save',callback:props.onClick});if(typeof type==='function'&&type.name==='InventoryBarcodeLookup')callbacks.push({kind:'apply',callback:props.onApply});return realReact.createElement(type,props,...children)}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='react'?observedReact:require(name),module,module.exports);
 const root=createRoot(document.getElementById('root')),saved=[];
 const render=(props={})=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:'A',initialOptions:options,onSaved:result=>saved.push(result),onClose(){},...props})));
 const click=async element=>{assert.ok(element);await act(async()=>element.click())};
 const change=async(element,value)=>{assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))})};
 const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
 const field=text=>[...document.querySelectorAll('.ia-form-grid.edit label')].find(x=>x.firstChild?.textContent===text)?.querySelector('input,select');
 try{await render();await run({dom,act,render,click,change,button,field,saved,callbacks})}finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
}

test('shared full creator sends every BackOffice field, exact department and row arrays once through its supplied POS endpoint',async()=>{
 const calls=[];let resolveSave;
 await withCard(async(path,request)=>{calls.push({path,request});return new Promise(resolve=>{resolveSave=resolve})},async({render,click,change,button,field,act,saved})=>{
  await render({createPath:'/api/store-pos/stores/A/new-product',lookupAllowed:false});
  assert.equal(document.querySelector('[role="dialog"]').getAttribute('aria-modal'),'true');
  for(const label of ['Βασικά στοιχεία','Barcodes','Κωδικοί προμηθευτών','Στατιστικά','Αγορές'])assert.ok(button(label),label);
  await change(field('Περιγραφή'),'Full POS product');await change(field('Κωδικός / SKU'),'NEW-SKU');await change(field('Κατηγορία'),'category');await change(field('Υποκατηγορία'),'subcategory');await change(field('Εταιρεία / Brand'),'brand');
  for(const[label,value]of [['Περιεκτικότητα','0.75'],['Τιμή αγοράς','1.25'],['Λιανική καταστήματος','2.5'],['Τιμή προσωπικού','1.5'],['Τιμή delivery','2.8'],['Αρχικό απόθεμα','3.25'],['Ελάχιστη παραγγελία','4'],['Έκπτωση Α %','5'],['Έκπτωση Β %','6'],['Έκπτωση Γ %','7'],['Περιγραφή / Σχόλιο','Comment']])await change(field(label),value);
  await change(field('Μονάδα'),'KG');assert.equal(field('Margin %').value,'50.00');assert.equal(field('Markup %').value,'100.00');
  assert.equal(field('% ΦΠΑ').readOnly,true);await click(button('Καταχώρηση'));assert.equal(calls.length,0);await change(field('Τμήμα ΦΠΑ'),'other13');assert.equal(field('% ΦΠΑ').value,'13');
  for(const label of ['Ειδοποίηση αρνητικού stock','Αλλαγή τιμής στο POS','Ελεύθερη τιμή στο POS'])await click([...document.querySelectorAll('.ia-card-switches label')].find(x=>x.textContent===label).querySelector('input'));
  await click(button('Barcodes'));await click(button('+ Νέο barcode'));let row=[...document.querySelectorAll('.ia-card-table input')];for(const[index,value]of ['520000000001','2','3.3','Package'].entries())await change(row[index],value);
  await click(button('Κωδικοί προμηθευτών'));await click(button('+ Νέος κωδικός προμηθευτή'));await change(document.querySelector('.suppliers select'),'supplier');await change(document.querySelector('.suppliers input'),'SUP-ITEM');
  await click(button('Στατιστικά'));assert.match(document.body.textContent,/—/);await click(button('Αγορές'));assert.equal(document.querySelectorAll('.purchases>div:not(.head)').length,0);
  await click(button('Βασικά στοιχεία'));await click([...document.querySelectorAll('.ia-card-switches label')].find(x=>x.textContent==='SET').querySelector('input'));assert.match(document.body.textContent,/Καταχώρησε πρώτα/);await click(button('Βασικά στοιχεία'));
  await click(button('Καταχώρηση'));await click(button('Αποθήκευση…'));assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/store-pos/stores/A/new-product');
  const payload=JSON.parse(calls[0].request.body);assert.deepEqual(Object.fromEntries(['name','sku','description','categoryId','subcategoryId','productCompanyId','unit','capacity','costPrice','salePrice','staffPrice','deliveryPrice','vatDepartmentId','vatRate','openingStock','minOrderQuantity','discountA','discountB','discountC'].map(k=>[k,payload[k]])),{name:'Full POS product',sku:'NEW-SKU',description:'Comment',categoryId:'category',subcategoryId:'subcategory',productCompanyId:'brand',unit:'KG',capacity:.75,costPrice:1.25,salePrice:2.5,staffPrice:1.5,deliveryPrice:2.8,vatDepartmentId:'other13',vatRate:13,openingStock:3.25,minOrderQuantity:4,discountA:5,discountB:6,discountC:7});
  for(const key of ['active','trackStock','allowDiscount','allowPosPriceChange','freeSalePrice','negativeStockWarning','isSet'])assert.equal(payload[key],true,key);assert.equal(payload.isRecipe,false);assert.equal(payload.vatVerified,true);
  assert.deepEqual(payload.barcodes,[{barcode:'520000000001',unitMultiplier:2,salePrice:3.3,name:'Package'}]);assert.deepEqual(payload.supplierCodes,[{supplierId:'supplier',supplierCode:'SUP-ITEM'}]);assert.match(payload.requestId,/^[0-9a-f-]{36}$/);
  await act(async()=>resolveSave({id:'new-product',sku:'NEW-SKU'}));assert.equal(saved.length,1);assert.equal(saved[0].storeId,'A');
 });
});

test('shared creator drops old A-B-A save completion without spending the new save busy state or identity',async()=>{
 const saves=[];
 await withCard(async(path,request)=>new Promise(resolve=>saves.push({resolve,payload:JSON.parse(request.body)})),async({render,click,change,button,field,act,saved})=>{
  const fill=async name=>{await change(field('Περιγραφή'),name);await change(field('Τμήμα ΦΠΑ'),'vat13')};
  await fill('Old A');await click(button('Καταχώρηση'));await render({storeId:'B'});await render({storeId:'A'});assert.equal(field('Περιγραφή').value,'');
  await fill('Current A');await click(button('Καταχώρηση'));assert.notEqual(saves[0].payload.requestId,saves[1].payload.requestId);
  await act(async()=>saves[0].resolve({id:'old',sku:'OLD'}));assert.equal(saved.length,0);assert.equal(button('Αποθήκευση…').disabled,true);
  await act(async()=>saves[1].resolve({id:'current',sku:'CURRENT'}));assert.equal(saved.length,1);assert.equal(saved[0].id,'current');
 });
});

test('revoking online lookup discards pending preview and keeps manual full-card fields',async()=>{
 let resolveLookup;
 const api=async()=>new Promise(resolve=>{resolveLookup=resolve});
 await withCard(api,async({render,change,field,click,button,act})=>{
  await change(field('Περιγραφή'),'Manual value');await change(field('Γραμμωτός κώδικας'),'520000000001');await click(button('Αναζήτηση online'));
  await render({lookupAllowed:false});await act(async()=>resolveLookup({found:true,source:'MASTER_CATALOG',product:{name:'Revoked result'}}));
  assert.doesNotMatch(document.body.textContent,/Revoked result/);assert.equal(button('Αναζήτηση online').disabled,true);assert.equal(field('Περιγραφή').value,'Manual value');
 });
});

test('retained old render callbacks cannot initiate a write or apply old preview after store change or close',async()=>{
 const calls=[];
 await withCard(async(path,request)=>{calls.push({path,request});return {id:'unexpected',sku:'UNEXPECTED'}},async({render,change,field,callbacks,act,click,button})=>{
  await change(field('Περιγραφή'),'Old A');await change(field('Τμήμα ΦΠΑ'),'vat13');
  const oldSave=callbacks.filter(row=>row.kind==='save').at(-1).callback,oldApply=callbacks.filter(row=>row.kind==='apply').at(-1).callback;
  await render({storeId:'B'});await change(field('Περιγραφή'),'Current B');await change(field('Τμήμα ΦΠΑ'),'vat13');
  await act(async()=>{await oldSave();oldApply({name:'Stale preview'})});assert.equal(calls.length,0);assert.equal(field('Περιγραφή').value,'Current B');
  const currentSave=callbacks.filter(row=>row.kind==='save').at(-1).callback;await click(button('Επιστροφή'));await act(async()=>currentSave());assert.equal(calls.length,0);
 });
});

for(const allowed of [false,true])test('actual POS '+(allowed?'opens same full creator and retains basket after save':'hides new product without explicit access'),()=>{
 let created=false;
 const product={id:'p0',sku:'SKU0',name:'Existing basket product',salePrice:2.2,currentStock:10,barcodes:['5200000000000']};
 return withMountedPos({apiOverride:async(path,request)=>{
  if(/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return {products:[product,...(created?[{...product,id:'new-product',name:'New product',sku:'NEW'}]:[])],access:{newProduct:allowed,onlineProductSearch:false},layout:{quickKeys:[{id:'q0',label:product.name,productCodes:['p0'],visible:true,price:2.2}],categories:[]}};
  if(path.endsWith('/new-product/options'))return options;
  if(path.endsWith('/new-product')&&request?.method==='POST'){created=true;return {id:'new-product',sku:'NEW',storeId:'A'}};
 },run:async({calls,click,act,dom})=>{
  const launch=document.querySelector('[data-pos-new-product]');if(!allowed){assert.equal(launch,null);return}
  assert.ok(launch);assert.equal(launch.disabled,false);await click(document.querySelector('.standard-quick>div>button'));assert.equal(document.querySelectorAll('.standard-line').length,1);
  await click(launch);assert.equal(document.querySelector('[role="dialog"]').getAttribute('aria-modal'),'true');
  const field=label=>[...document.querySelectorAll('.ia-form-grid.edit label')].find(x=>x.firstChild?.textContent===label).querySelector('input,select');
  const change=async(element,value)=>act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))});
  await change(field('Περιγραφή'),'New product');await change(field('Τμήμα ΦΠΑ'),'vat13');await click([...document.querySelectorAll('.ia-modal-actions button')].find(x=>x.textContent==='Καταχώρηση'));
  assert.equal(document.querySelectorAll('.standard-line').length,1);assert.match(document.querySelector('.standard-line').textContent,/Existing basket product/);assert.match(document.body.textContent,/Το καλάθι διατηρήθηκε/);
  assert.equal(calls.filter(x=>x.path.endsWith('/new-product')&&x.options.method==='POST').length,1);assert.equal(calls.some(x=>x.path.startsWith('/api/owner-products')),false);assert.equal(calls.some(x=>x.path.endsWith('/checkout')||x.path.endsWith('/finalize')),false);
  Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});await act(async()=>dom.window.dispatchEvent(new dom.window.Event('offline')));assert.equal(document.querySelector('[data-pos-new-product]').disabled,true);
 }});
});
