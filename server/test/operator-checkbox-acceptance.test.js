import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('current profile display rights refresh on catalog and access, never on unrelated responses',()=>{
 const src=fs.readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');
 const body=src.match(/function exposeStorePosRuntimeAccess\(req,res,rights\)\{[\s\S]*?\n\}/)[0];
 const expose=vm.runInNewContext('('+body+')');
 for(const path of ['/api/store-pos/stores/A','/api/store-pos/stores/A/access?refresh=1']){
  let result;const res={json:x=>{result=x}};
  expose({method:'GET',originalUrl:path},res,{stockPos:true,hidePrinter:true,confirmDeleteSale:true});
  res.json({access:{purchaseOrders:true,stockPos:false},shiftClosePolicy:{showExpectedAmounts:false}});
  assert.equal(result.access.stockPos,true);assert.equal(result.access.purchaseOrders,true);assert.equal(result.access.hidePrinter,true);
  assert.equal(result.shiftClosePolicy.showExpectedAmounts,false);
  const nextRes={json:x=>{result=x}};expose({method:'GET',originalUrl:path},nextRes,{stockPos:false,hidePrinter:false});
  nextRes.json({access:{purchaseOrders:false}});assert.equal(result.access.stockPos,false);assert.equal(result.access.hidePrinter,false);
 }
 for(const path of ['/api/store-pos/stores/A/customers','/api/store-pos/stores/A/sales/recent']){
  const res={json:x=>x},send=res.json;expose({method:'GET',originalUrl:path},res,{cash:true});assert.equal(res.json,send);
 }
});

test('payment and customer visibility target every actual entry while supplier dispatch stays available',()=>{
 const src=fs.readFileSync(new URL('../../client/src/components/store/StoreOperatorApp.jsx',import.meta.url),'utf8');
 const body=src.match(/function applyPosPermissionStyle\(access\)\{[\s\S]*?\n\}/)[0];
 const dom=new JSDOM('<head></head><body><div class="compact-store-mode"><div class="standard-action-bar"><button>CLEAR</button><button>HOLD</button><button>RETURN</button><button>DISPATCH</button><button class="pos-payments-action">PAYMENTS</button><button class="card">CARD</button><div class="standard-payment-end"><button class="iris">IRIS</button><button class="cash">CASH</button></div></div></div></body>');
 const apply=vm.runInNewContext('('+body+')',{document:dom.window.document,POS_PERMISSION_STYLE_ID:'test-rights'});
 apply({});const buttons=[...dom.window.document.querySelectorAll('button')];
 assert.notEqual(dom.window.getComputedStyle(buttons[3]).display,'none');
 for(const b of buttons.slice(4))assert.equal(dom.window.getComputedStyle(b).display,'none');
 apply({supplierPayment:true,cards:true,cash:true});for(const b of buttons.slice(3))assert.notEqual(dom.window.getComputedStyle(b).display,'none');
 const customerButton=dom.window.document.createElement('button');customerButton.className='customer-button';
 const customerDropdown=dom.window.document.createElement('div');customerDropdown.className='pos-credit-customer';
 dom.window.document.querySelector('.compact-store-mode').append(customerButton,customerDropdown);
 apply({customersPos:false});
 for(const entry of [customerButton,customerDropdown])assert.equal(dom.window.getComputedStyle(entry).display,'none');
 apply({customersPos:true});
 for(const entry of [customerButton,customerDropdown])assert.notEqual(dom.window.getComputedStyle(entry).display,'none');
 dom.window.close();
});

test('actual operator editor toggles every retained checkbox and preserves removed legacy values',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/OperatorManagementPanel.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const row={employeeId:'employee',displayName:'Fixture',role:'EMPLOYEE',active:true,posAccess:true,permissions:{stockBackoffice:true,mixedPaymentChange:true,centralCashPos:true},backofficeMenu:{reports:true},backofficeTabs:{events:true},customerDisplay:{doubleScreen:true},backofficeAccess:true,powerUser:true};
 const saves=[];const api=async(path,options={})=>{if(options.method==='PATCH'){saves.push(JSON.parse(options.body));return {ok:true}}return {operators:[row]}};
 const root=createRoot(document.getElementById('root'));
 const click=async el=>act(async()=>{assert.ok(el);el.click();await new Promise(r=>setTimeout(r,5))});
 const find=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes(text));
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,{api,store:{id:'A'},onClose(){}}));await new Promise(r=>setTimeout(r,10))});
  await click(document.querySelector('[title="Διόρθωση"]'));
  const boxes=[...document.querySelectorAll('.om-modal input[type="checkbox"]')];assert.equal(boxes.length,24);
  for(const b of boxes.slice(2))await click(b);
  await click(find('Δικαιώματα πρόσβασης'));assert.equal(document.querySelectorAll('.om-modal input[type="checkbox"]').length,1);
  await click(document.querySelector('.om-modal input[type="checkbox"]'));
  await click(find('Λοιπά'));assert.equal(document.querySelectorAll('.om-modal input[type="checkbox"]').length,0);
  await click(find('Καταχώρηση'));assert.equal(saves.length,1);
  assert.equal(Object.entries(saves[0].permissions).filter(([k,v])=>v&& !['stockBackoffice','mixedPaymentChange','centralCashPos'].includes(k)).length,22);
  assert.equal(saves[0].permissions.centralCashPos,true);assert.equal(saves[0].backofficeMenu.orders,true);assert.equal(saves[0].backofficeMenu.reports,true);
  assert.equal(saves[0].backofficeTabs.events,true);assert.equal(saves[0].customerDisplay.doubleScreen,true);
  assert.equal(saves[0].backofficeAccess,true);assert.equal(saves[0].powerUser,true);
  assert.equal(saves[0].posAccess,true);assert.equal(saves[0].active,true);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
