import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {exactScanBarcode,barcodeCartProduct,scannerCanFocus} from '../../client/src/utils/pos-scanner.js';

test('automatic barcode lookup requires unique complete stored barcode, never SKU/name or a longer-code prefix',()=>{
 const product={id:'p',sku:'52101588',name:'test',barcodes:['52101588']};
 assert.equal(exactScanBarcode([product],'52101588'),product);
 assert.equal(exactScanBarcode([{...product,barcodes:[]}],'52101588'),null);
 assert.equal(exactScanBarcode([product,{id:'long',barcodes:['5210158812345']}],'52101588'),null);
 assert.equal(exactScanBarcode([product,{...product,id:'duplicate'}],'52101588'),null);
 assert.equal(exactScanBarcode([product],'test'),null);
});


test('completed imported barcode resolves exact unique identity and preserves stored price/key, never first ambiguous result',()=>{
 const scan='5201222304692',product={id:'bronze',sku:'12227',name:'TEREA BRONZE',salePrice:4,barcodes:[' 05201222304692~5201222304692 '],barcodeOptions:[{barcode:' 5201222304692 ',salePrice:4.2}]};
 assert.equal(exactScanBarcode([product],scan),product);
 const longer={id:'longer',barcodes:[scan+'99']};
 assert.equal(exactScanBarcode([product,longer],scan),null,'short prefix waits for completion');
 assert.equal(exactScanBarcode([product,longer],scan,{complete:true}),product);
 assert.equal(exactScanBarcode([product],scan.slice(0,-1),{complete:true}),null,'partial barcode is never a match');
 assert.equal(exactScanBarcode([product,{...product,id:'duplicate'}],scan,{complete:true}),null);
 assert.equal(exactScanBarcode([product,{id:'option-only',barcodeOptions:[{barcode:scan}]}],scan,{complete:true,manual:true}),null,'Enter cannot fall back to first search match for ambiguous barcode');
 assert.equal(exactScanBarcode([product],'12227',{complete:true,manual:true}),product,'explicit SKU Enter remains supported');
 assert.equal(exactScanBarcode([{...product,barcodes:[],barcodeOptions:[],sku:scan}],scan,{complete:true}),null);
 const master={...product,barcodes:[],barcodeOptions:[],masterCode:scan,sourceCode:scan};assert.equal(exactScanBarcode([master],scan),master,'numeric catalog barcode is recognized even without ProductBarcode rows');
 assert.equal(exactScanBarcode([{...master,masterCode:null,sourceCode:scan,sku:scan}],scan),null,'sourceCode fallback to SKU is not an automatic barcode');
 assert.equal(barcodeCartProduct({...product,barcodeOptions:[{barcode:'0'+scan,salePrice:5},{barcode:scan,salePrice:4}]},scan).salePrice,4,'exact barcode price takes precedence over normalized alias');
 assert.equal(barcodeCartProduct({...product,barcodeOptions:[{barcode:'ALPHA-1',salePrice:3}]},'ALPHA-1').salePrice,3,'manual alphanumeric barcode retains its price');
 const actual={id:'523d46e8-1393-47db-869a-1adab90d3db8',sku:'12237',name:'TEREA BRONZE',salePrice:4,barcodes:['5201222305620,5201222304692,5201222302988'],masterCode:null,sourceCode:'12237'};
 for(const code of ['5201222305620','5201222304692','5201222302988'])assert.equal(exactScanBarcode([actual],code),actual,'every comma-separated barcode position resolves');
 assert.equal(exactScanBarcode([actual,{id:'other',barcodes:[scan]}],scan),null,'a duplicate comma alias is not silently chosen');
 assert.equal(exactScanBarcode([actual],'520122230469'),null,'partial comma alias is not a match');
 const option={...actual,barcodeOptions:[{barcode:actual.barcodes[0],salePrice:4.2}]};assert.equal(barcodeCartProduct(option,scan).salePrice,4.2);assert.equal(barcodeCartProduct(option,scan).scannedBarcode,actual.barcodes[0],'stored option identity preserved');
 const cart=barcodeCartProduct(product,scan);assert.equal(cart.salePrice,4.2);assert.equal(cart.scannedBarcode,' 5201222304692 ');assert.equal(cart.cartKey,'bronze:: 5201222304692 ');
});

test('scanner focus respects disabled/detached inputs and visible dialogs, ignoring hidden minimized dialogs',()=>{
 const dom=new JSDOM('<input id="scan"><div aria-modal="true"><input></div>');
 const input=dom.window.document.getElementById('scan'),dialog=dom.window.document.querySelector('[aria-modal]');
 assert.equal(scannerCanFocus(input),false);
 dialog.style.display='none';assert.equal(scannerCanFocus(input),true);
 dialog.removeAttribute('aria-modal');dialog.className='operator-shift-popover';dialog.style.display='';assert.equal(scannerCanFocus(input),false);
 dialog.style.display='none';assert.equal(scannerCanFocus(input),true);
 input.disabled=true;assert.equal(scannerCanFocus(input),false);input.disabled=false;input.remove();assert.equal(scannerCanFocus(input),false);dom.window.close();
});

for(const fixture of [{name:'plain',scan:'52101588',stored:['52101588']},{name:'imported alias',scan:'5201222304692',stored:[' 05201222304692~5201222304692 '],option:' 5201222304692 '},{name:'shared prefix',scan:'5201222304692',stored:['5201222304692'],longer:true},{name:'numeric master code',scan:'5201222304692',stored:[],masterCode:'5201222304692',noOptions:true},{name:'actual comma list',scan:'5201222304692',stored:['5201222305620,5201222304692,5201222302988'],noOptions:true,price:4,sku:'12237',productName:'TEREA BRONZE'},{name:'5000-row rapid',scan:'5201222304692',stored:['5201222305620,5201222304692,5201222302988'],large:true}]){
test(`actual POS ${fixture.name} scans once with/without Enter and retains focus/payment guards`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[],product={id:'example',sku:fixture.sku||'SKU',name:fixture.productName||'Fixture product',currentStock:100,salePrice:fixture.noOptions?(fixture.price||1.2):1,barcodes:fixture.stored,masterCode:fixture.masterCode,sourceCode:fixture.masterCode,barcodeOptions:fixture.noOptions?[]:[{barcode:fixture.option||fixture.scan,salePrice:1.2}]};let checkout,fiscalRequest;
 const catalog=[product,...(fixture.longer?[{id:'longer',sku:'LONG',name:'Longer barcode',salePrice:2,barcodes:[fixture.scan+'99']}]:[]),...(fixture.large?Array.from({length:4999},(_,i)=>({id:'bulk-'+i,name:'ΕΙΔΟΣ '+i,sku:'BULK-'+i,salePrice:2,barcodes:[String(5210000000000+i)]})):[])];
 const api=async(path,options={})=>{calls.push({path,options});if(fiscalRequest&&path.endsWith('/rbs-capdriver-v1/pending-scan-test'))return {request:fiscalRequest};if(path.endsWith('/payment-terminals'))return {terminalPos:'MAIN',fiscalDisplayName:'Fixture register',choices:[{deviceCode:'A',displayName:'POS ΚΑΤΑΣΤΗΜΑΤΟΣ',operationChannel:'COUNTER',transactionMode:'IMMEDIATE'},{deviceCode:'B',displayName:'DELIVERY',operationChannel:'DELIVERY_DELAYED',transactionMode:'DEFERRED'}]};if(path.endsWith('/checkout'))return new Promise((resolve,reject)=>{checkout={resolve,reject}});if(path==='/api/store-pos/stores/A')return {products:[...catalog],layout:{quickKeys:[],categories:[]},access:{}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}}};
 const input=()=>document.querySelector('[data-pos-scanner]');
 const type=async value=>act(async()=>{input().focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 const enter=async()=>act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true})));
 const wait=async()=>act(async()=>new Promise(resolve=>setTimeout(resolve,230)));
 const reloadCatalog=async()=>{await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'B',name:'Other fixture store'}})));await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})))};
 const count=()=>calls.filter(c=>c.path.endsWith('/audit')&&JSON.parse(c.options.body).actionType==='CART_ITEM_ADD').length;
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})));
  assert.equal(document.activeElement,input());
  const idleButton=document.querySelector('button[title="Πλήρης ανανέωση POS"]');
  await act(async()=>{idleButton.focus();await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,idleButton,'keyboard button focus remains usable before activation');
  await act(async()=>{idleButton.dispatchEvent(new dom.window.Event('pointerup',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,input(),'completed POS tap returns to scanner');
  await act(async()=>{input().blur();document.querySelector('.standard-sale-panel').dispatchEvent(new dom.window.Event('pointerup',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,input(),'background tap leaves scanner ready');
  const editor=document.createElement('textarea');document.querySelector('.mws-standard-pos').appendChild(editor);
  await act(async()=>{editor.focus();await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,editor,'editing retains focus');
  await act(async()=>{editor.blur();await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,input(),'leaving an editor restores idle readiness');editor.remove();
  for(const tag of ['input','select','div']){
   const field=document.createElement(tag);if(tag==='div'){field.contentEditable='true';field.setAttribute('contenteditable','true');field.tabIndex=0}
   document.querySelector('.mws-standard-pos').appendChild(field);
   await act(async()=>{field.focus();field.dispatchEvent(new dom.window.Event('pointerup',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20))});
   assert.equal(document.activeElement,field,`${tag} editor retains focus after tap`);
   await act(async()=>{field.remove();await new Promise(resolve=>setTimeout(resolve,20))});
   assert.equal(document.activeElement,input(),'removed editor returns focus safely');
  }
  const modal=document.createElement('div');modal.className='shift-overlay';modal.innerHTML='<input>';
  await act(async()=>{document.body.appendChild(modal);modal.querySelector('input').focus();await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,modal.querySelector('input'));assert.equal(scannerCanFocus(input()),false);
  await act(async()=>{modal.remove();await new Promise(resolve=>setTimeout(resolve,20))});
  assert.equal(document.activeElement,input(),'closing external shift modal restores readiness');
  catalog.push({...product,id:'ambiguous',barcodes:[],barcodeOptions:[{barcode:fixture.scan,salePrice:8}]});
  await reloadCatalog();
  await type(fixture.scan);await act(async()=>new Promise(resolve=>setTimeout(resolve,650)));assert.equal(count(),0,'ambiguous barcode cannot auto-select a product');await enter();assert.equal(count(),0,'Enter cannot select the first ambiguous product');catalog.pop();await type('');
  await reloadCatalog();
  if(fixture.large){
   await type(fixture.scan);
   await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'B',name:'Other fixture store'}})));
   await act(async()=>new Promise(resolve=>setTimeout(resolve,120)));assert.equal(count(),0,'switching store cancels the previous pending scan');
   await type(fixture.scan);await act(async()=>new Promise(resolve=>setTimeout(resolve,120)));assert.equal(count(),0,'the other store cannot resolve a previous catalog barcode');
   await type('');await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})));
   await type(fixture.scan);await act(async()=>new Promise(resolve=>setTimeout(resolve,120)));assert.equal(count(),1,'unique scan is already added before the former180ms interval');
   await type(fixture.scan);await act(async()=>new Promise(resolve=>setTimeout(resolve,120)));assert.equal(count(),2);assert.equal(document.querySelector('.line-qty b').textContent,'2','successive rapid scans keep both quantities');
   await enter();await wait();assert.equal(count(),2,'late Enter never duplicates an automatic scan');
   await act(async()=>document.querySelector('.line-total button').click());calls.splice(0,calls.length);
  }
  if(fixture.longer){await type(fixture.scan);await wait();assert.equal(count(),0);await type(fixture.scan+'99');await wait();assert.equal(count(),1,'finishing a longer scan adds only the longer product');assert.match(document.querySelector('.standard-line').textContent,/Longer barcode/);await act(async()=>document.querySelector('.line-total button').click());calls.splice(0,calls.length)}
  await type(fixture.scan);await enter();assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(count(),1);assert.equal(input().value,'');assert.equal(document.activeElement,input());
  await wait();assert.equal(count(),1);
  await type(fixture.scan);await wait();if(fixture.longer){assert.equal(count(),1,'shared prefix does not add before completion');await act(async()=>new Promise(resolve=>setTimeout(resolve,450)))}assert.equal(count(),2);assert.equal(document.querySelector('.line-qty b').textContent,'2');if(fixture.price)assert.match(document.querySelector('.line-price-action').textContent,/4,00/,'actual TEREA price remains4EUR');await enter();assert.equal(count(),2);
  await type(fixture.scan.slice(0,-1));await act(async()=>new Promise(resolve=>setTimeout(resolve,650)));assert.equal(count(),2,'partial input never adds');
  await type(fixture.productName||'Fixture');await wait();assert.equal(count(),2);assert.equal(input().value,fixture.productName||'Fixture');
  const other=document.createElement('input');document.body.appendChild(other);other.focus();await wait();assert.equal(document.activeElement,other);
  await type('99999999');await enter();assert.match(document.querySelector('.standard-search-results').textContent,/δεν υπάρχει/);assert.equal(count(),2);assert.equal(input().value,'','unknown code consumed before another action');await type('manual pending search');
  const cash=document.querySelector('button.cash');await act(async()=>{cash.focus();cash.click()});assert.equal(input().disabled,true);assert.equal(calls.filter(c=>c.path.endsWith('/checkout')).length,1);
  await act(async()=>checkout.reject(Error('payment rejected')));assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(input().value,'manual pending search');assert.match(document.querySelector('.store-pos-alert.error').textContent,/payment rejected/);
  await act(async()=>cash.click());await act(async()=>checkout.resolve({total:2*(fixture.price||1.2)}));assert.equal(document.querySelectorAll('.standard-line').length,0);assert.equal(input().value,'');assert.equal(document.activeElement,input());
  const body=JSON.parse(calls.find(c=>c.path.endsWith('/checkout')).options.body);assert.equal(body.items[0].productId,'example');assert.equal(body.items[0].quantity,2);assert.equal(body.items[0].barcode,fixture.noOptions?null:fixture.option||fixture.scan);
  await type(fixture.scan);await enter();assert.equal(count(),3);assert.equal(document.querySelectorAll('.standard-line').length,1);
  await act(async()=>document.querySelector('button.card').click());assert.ok(document.querySelector('.pos-card-terminal-picker'));assert.equal(scannerCanFocus(input()),false);
  await enter();assert.equal(count(),3);
  await act(async()=>document.querySelector('.pos-card-terminal-picker button:not(.pos-primary-inline)').click());
  fiscalRequest={id:'pending-scan-test',status:'PENDING',paymentMethod:'CASH',total:1.2};await act(async()=>cash.click());await act(async()=>checkout.resolve({fiscalPending:true,request:fiscalRequest}));assert.equal(document.querySelectorAll('.standard-line').length,1);assert.equal(input().disabled,true);assert.ok(document.querySelector('.pos-price-modal'));assert.equal(count(),3);assert.equal(calls.filter(c=>c.path.endsWith('/checkout')).length,3);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});

}

test('unknown POS scan is consumed synchronously and the next scan starts empty while audit is pending',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const known='5201222304692',unknown='5201004000001',second='5201004000002',calls=[];
 let releaseAudit;const heldAudit=new Promise(resolve=>{releaseAudit=resolve});
 const api=async(path,options={})=>{calls.push({path,options});
  if(path.endsWith('/audit')&&JSON.parse(options.body||'{}').actionType==='UNKNOWN_PRODUCT_SCAN')return heldAudit;
  if(path==='/api/store-pos/stores/A')return {products:[{id:'p',name:'Fixture product',sku:'SKU',salePrice:2,currentStock:100,barcodes:[known]}],layout:{quickKeys:[],categories:[]},access:{onlineProductSearch:true}};
  if(path.includes('/online-product-search?'))return {rows:[{id:'master',name:'Master result',barcodes:[unknown]}]};
  if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');
  return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}};
 };
 const input=()=>document.querySelector('[data-pos-scanner]');
 const append=value=>{const field=input();field.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(field,field.value+value);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
 const enter=()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
 const audits=action=>calls.filter(c=>c.path.endsWith('/audit')&&JSON.parse(c.options.body).actionType===action);
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})));
  let afterEnter;
  await act(async()=>{append(unknown);enter();afterEnter=input().value;enter();enter()});
  assert.equal(afterEnter,'','consume the submitted miss before React commit or audit completion');
  assert.equal(input().value,'');assert.equal(document.activeElement,input());
  assert.equal(audits('UNKNOWN_PRODUCT_SCAN').length,1,'empty Enter cannot repeat the same miss');
  assert.equal(audits('UNKNOWN_PRODUCT_SCAN')[0].options.body.includes(unknown),true);
  assert.match(document.querySelector('.standard-search-results').textContent,new RegExp(unknown),'warning keeps separate failed code');
  const online=[...document.querySelectorAll('button')].find(b=>b.textContent==='Online αναζήτηση');assert.ok(online);
  await act(async()=>online.click());
  assert.ok(calls.some(c=>c.path.endsWith('/online-product-search?q='+unknown)));
  await act(async()=>{append(second);enter()});
  assert.equal(input().value,'');
  assert.deepEqual(audits('UNKNOWN_PRODUCT_SCAN').map(c=>JSON.parse(c.options.body).details.query),[unknown,second],'successive misses are distinct codes, never concatenated');
  assert.match(document.querySelector('.standard-search-results').textContent,new RegExp(second));
  assert.doesNotMatch(document.querySelector('.standard-search-results').textContent,/Master result/);
  await act(async()=>{append(known);enter()});
  await act(async()=>enter());
  assert.equal(input().value,'');assert.equal(document.activeElement,input());
  assert.equal(audits('CART_ITEM_ADD').length,1,'next known code adds exactly once');
  assert.equal(audits('UNKNOWN_PRODUCT_SCAN').length,2);
  assert.equal(document.querySelector('.standard-search-results'),null,'successful scan dismisses old unknown');
  await act(async()=>{releaseAudit();await heldAudit});
  assert.equal(input().value,'');assert.equal(audits('CART_ITEM_ADD').length,1,'late audit cannot restore a consumed code');
  assert.equal(calls.some(c=>/checkout|product.*create/.test(c.path)),false);
 }finally{
  releaseAudit();await act(async()=>root.unmount());dom.window.close();
  for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
 }
});
