// Actual POS and existing invoice editor with isolated DOM/API. No production actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('permission-gated invoice entry keeps actual POS cart mounted and saves the existing draft',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/store/A'});
 const keys=['window','document','navigator','localStorage','sessionStorage','HTMLElement','Event','MutationObserver','FormData','IS_REACT_ACT_ENVIRONMENT','fetch'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const Panel=module.exports.default,root=createRoot(document.getElementById('root')),calls=[];
 let allowed=true,finishPreview;
 const preview=new Promise(resolve=>finishPreview=resolve);
 const product={id:'p',name:'CART CONTROL',sku:'CONTROL',salePrice:2,vatRate:24,currentStock:20};
 const order={id:'one',storeId:'A',storeName:'Store A',status:'NEW',sourceType:'POS_OCR_DRAFT',invoiceNumber:'TEST-ONE',supplierId:'sup',supplierName:'Supplier'};
 const line={id:'line',orderId:'one',productId:'p',description:'Invoice row',quantity:3,unitCost:1,discount1:0,discount2:0,discount3:0,vatRate:24,netAmount:3,grossAmount:3.72};
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/access'))return {access:{purchaseOrders:allowed}};
  if(path.endsWith('/invoice-assistant/source'))return {document:{totalGross:3.72,supplierTaxId:'123456789'},pages:[]};
  if(path.endsWith('/invoice-assistant/preview'))return preview;
  if(path.startsWith('/api/purchase-orders/report?')){return {stores:[{id:'A',name:'Store A'}],suppliers:[{id:'sup',name:'Supplier'}],orders:[order],summary:{count:1}};}
  if(path==='/api/purchase-orders/one/detail')return {order,lines:[line],totals:{quantity:3,net:3,gross:3.72}};
  if(path==='/api/purchase-orders/one/lines/line'&&options.method==='PATCH'){Object.assign(line,JSON.parse(options.body));return {ok:true};}
  if(path.startsWith('/api/commerce/products?'))return [product];
  if(path==='/api/purchase-orders'&&options.method==='POST')return {id:'one'};
  if(path.startsWith('/api/purchase-orders/'))return {ok:true};
  if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('inactive');
  if(path==='/api/store-pos/stores/A')return {products:[product],access:{leftKeys:true},layout:{title:'POS',quickKeys:[{id:'quick',visible:true,label:'CART CONTROL',productQuery:'CONTROL',color:'#087a52'}],categories:[]}};
  if(path.endsWith('/holds'))return {rows:[]};if(path.endsWith('/audience-discounts'))return {items:[]};
  if(path.endsWith('/online-radio'))return {moduleActive:false,enabled:false};
  if(path.endsWith('/pending'))return {requests:[]};return {};
 };
 const props={api,store:{id:'A',name:'Store A'},operator:{id:'op',fullName:'Operator'},company:{name:'Fixture'},canRegisterBarcode:false};
 const render=async right=>act(async()=>{root.render(React.createElement(Panel,{...props,canPurchaseOrders:right}));await new Promise(r=>setTimeout(r,15));});
 const click=async el=>{assert.ok(el,'click target exists');await act(async()=>{el.click();await new Promise(r=>setTimeout(r,10))})};
 const find=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 try{
  await render(false);assert.equal(find('Τιμολόγια / Παραλαβές'),undefined);
  await render(true);await click(document.querySelector('.standard-quick button:not([disabled])'));
  assert.match(document.querySelector('.standard-lines').textContent,/CART CONTROL/);
  const cartBefore=document.querySelector('.standard-lines').textContent,posBefore=document.querySelector('.store-pos-top');
  await click(find('Τιμολόγια / Παραλαβές'));
  assert.ok(document.querySelector('.pos-invoice-window'));assert.equal(document.querySelector('.store-pos-top'),posBefore);
  assert.equal(document.querySelector('[data-po-store]').disabled,true);assert.equal(document.querySelector('[data-po-store]').options.length,1);
  await click(document.querySelector('[data-po-new]'));
  const newForm=document.querySelector('[data-new-order]');newForm.elements.invoiceNumber.value='TEST-NEW';
  await act(async()=>{newForm.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,15))});
  const creation=calls.find(c=>c.path==='/api/purchase-orders'&&c.options.method==='POST');assert.equal(JSON.parse(creation.options.body).storeId,'A');
  await click(find('Επιστροφή στο POS'));await click(find('Τιμολόγια / Παραλαβές'));
  await click(document.querySelector('[data-po-open="one"]'));assert.ok(document.querySelector('.pos-po-modal'));assert.equal(document.querySelector('.po-modal'),null);
  await click(document.querySelector('[data-invoice-assistant]'));
  const assistant=document.querySelector('[data-minimize]').closest('[data-pos-invoice-modal]'),message=assistant.querySelector('[data-message]');message.value='BACKGROUND READ';
  await click(assistant.querySelector('[data-ask]'));await click(assistant.querySelector('[data-minimize]'));
  assert.equal(document.querySelector('[data-invoice-assistant-restore]').parentElement.hasAttribute('data-invoice-assistant-dock-host'),true);assert.equal(document.querySelector('.pos-invoice-overlay').style.display,'none');assert.equal(document.querySelector('.pos-po-modal').parentElement.style.display,'none');assert.equal(document.querySelector('.store-pos-top'),posBefore);assert.equal(document.querySelector('.standard-lines').textContent,cartBefore);
  await act(async()=>{finishPreview({pagesComplete:false,pageWarning:'FIXTURE REVIEW',assistantMessage:'BACKGROUND RESULT',printedLines:[],corrections:[]});await new Promise(r=>setTimeout(r,10))});
  assert.equal(assistant.style.display,'none');await click(document.querySelector('[data-invoice-assistant-restore]'));
  assert.equal(assistant.style.display,'block');assert.equal(document.querySelector('.pos-invoice-overlay').style.display,'');assert.equal(message.value,'BACKGROUND READ');assert.equal(assistant.querySelector('[data-answer]').textContent,'BACKGROUND RESULT');
  await click(assistant.querySelector('[data-minimize]'));await click(find('Τιμολόγια / Παραλαβές'));assert.equal(assistant.style.display,'block');
  await click(assistant.querySelector('[data-close]'));assert.equal(document.querySelector('[data-invoice-assistant-restore]'),null);assert.equal(calls.filter(c=>c.path.endsWith('/invoice-assistant/preview')).length,1);
  await click(document.querySelector('[data-line-edit="line"]'));
  const field=document.querySelector('.pos-po-modal input[name="quantity"]');field.value='4';
  const form=field.closest('form'),submit=form.querySelector('button.primary[type="submit"]');
  await act(async()=>{form.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:submit}));await new Promise(r=>setTimeout(r,10))});
  assert.equal(line.quantity,4);assert.equal(calls.filter(c=>c.path==='/api/purchase-orders/one/lines/line'&&c.options.method==='PATCH').length,1);
  await click(document.querySelector('[data-add-line]'));
  await click(document.querySelector('[data-product-search]'));
  const addForm=document.querySelector('[data-add-form]');addForm.elements.productId.value='p';
  await act(async()=>{addForm.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:addForm.querySelector('button.primary[type="submit"]')}));await new Promise(r=>setTimeout(r,10))});
  assert.equal(calls.filter(c=>c.path==='/api/purchase-orders/one/lines'&&c.options.method==='POST').length,1);
  await click(find('Επιστροφή στο POS'));assert.equal(document.querySelector('.pos-invoice-window'),null);assert.equal(document.querySelectorAll('[data-pos-invoice-modal]').length,0);assert.equal(document.querySelector('.standard-lines').textContent,cartBefore);
  // Revocation also closes an already opened overlay without clearing the cart.
  await click(find('Τιμολόγια / Παραλαβές'));await click(document.querySelector('[data-po-open="one"]'));await click(document.querySelector('[data-invoice-assistant]'));await click(document.querySelector('[data-minimize]'));await render(false);assert.equal(document.querySelector('[data-invoice-assistant-restore]'),null);assert.equal(document.querySelector('.pos-invoice-window'),null);assert.equal(find('Τιμολόγια / Παραλαβές'),undefined);assert.equal(document.querySelector('.standard-lines').textContent,cartBefore);
  // Cached/incorrect UI grant cannot load invoices after server revalidation denies it.
  allowed=false;await render(true);const before=calls.filter(c=>c.path.startsWith('/api/purchase-orders')).length;
  await click(find('Τιμολόγια / Παραλαβές'));assert.match(document.querySelector('[role="alert"]').textContent,/Παραγγελίες/);assert.equal(calls.filter(c=>c.path.startsWith('/api/purchase-orders')).length,before);await click(find('Επιστροφή στο POS'));
  assert.equal(calls.some(c=>/sales|checkout|sessions\/open|finalize|fast-recover|\/email/.test(c.path)),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
