import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function mounted(request,body){
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/EfoodEventPreview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{url:'/api/platform/companies/company/stores/'+store+'/efood',request})));
 const click=label=>act(async()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent===label);assert.ok(button,label);button.click()});
 const input=async id=>act(async()=>{const el=document.querySelector('.efood-manual-mapping input:not([type=checkbox])');el.value=id;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 const confirm=()=>act(async()=>document.querySelector('.efood-mapping-confirm input').click());
 try{await body({render,click,input,confirm,act,dom,root})}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
}
const preview=matched=>({eventId:'event-A',providerStoreId:'9344842',status:'READY_FOR_PICKUP',mode:'LAB_WEBHOOK_TEST',preparationOnly:true,commercialExecutionReady:false,mappingComplete:matched,items:[{line:1,name:'<img src=x>',externalProductId:'SLL45E',externalSku:'SLL45E',barcodes:['05201050130791'],quantity:1,mappingStatus:matched?'MATCHED':'UNMATCHED',reason:matched?null:'MAPPING_MISSING',product:matched?{id:'fixture-id',name:'LAB EFOOD Fixture'}:null}]});
const list={events:[{id:'event-A',externalOrderId:'order-A',externalStatus:'READY_FOR_PICKUP'}]};

test('native manual mapping requires explicit identity confirmation, saves once and refreshes archived event only',async()=>{
 const calls=[];let mapped=false,release;
 const request=async(url,options={})=>{calls.push({url,options});if(options.method==='PUT')return new Promise(resolve=>release=()=>{mapped=true;resolve({ok:true,mapping:{productId:'fixture-id',status:'MATCHED'}})});return url.endsWith('/event-previews')?list:preview(mapped)};
 await mounted(request,async({render,click,input,confirm,act})=>{
  await render('A');await click('Εμφάνιση αποθηκευμένων events');await click('Προεπισκόπηση προϊόντων');
  const panel=document.querySelector('.efood-manual-mapping');assert.ok(panel);assert.equal(panel.closest('form'),null);assert.equal(document.querySelector('img'),null);
  await input(' fixture-id ');let button=[...panel.querySelectorAll('button')][0];assert.equal(button.disabled,true);await confirm();assert.equal(button.disabled,false);
  await input('fixture-id');assert.equal(panel.querySelector('[type=checkbox]').checked,false);assert.equal(button.disabled,true);await confirm();
  await act(async()=>{button.click();button.click()});assert.equal(calls.filter(x=>x.options.method==='PUT').length,1);
  const write=calls.find(x=>x.options.method==='PUT');assert.equal(write.url,'/api/platform/companies/company/stores/A/efood/product-mappings');
  const payload=JSON.parse(write.options.body);assert.deepEqual(Object.keys(payload).sort(),['externalProductId','externalSku','notes','productId','providerName']);assert.equal(payload.productId,'fixture-id');assert.equal(payload.externalProductId,'SLL45E');assert.equal(payload.externalSku,'SLL45E');
  await act(async()=>release());assert.match(document.body.textContent,/Αντιστοίχιση: LAB EFOOD Fixture/);assert.equal(document.querySelector('.efood-manual-mapping'),null);
  assert.equal(calls.length,4);assert.equal(calls[3].url,'/api/platform/companies/company/stores/A/efood/events/event-A/preview');assert.ok(!calls[3].options.method);assert.equal(document.querySelectorAll('form').length,0);
 });
});

test('successful mapping with failed readback never resubmits PUT and tells user to read again',async()=>{
 const calls=[];let reads=0;
 const request=async(url,options={})=>{calls.push({url,options});if(options.method==='PUT')return {ok:true,mapping:{productId:'fixture-id',status:'MATCHED'}};if(url.endsWith('/event-previews'))return list;if(++reads===2)throw Error('readback unavailable');return preview(reads>2)};
 await mounted(request,async({render,click,input,confirm})=>{
  await render('A');await click('Εμφάνιση αποθηκευμένων events');await click('Προεπισκόπηση προϊόντων');await input('fixture-id');await confirm();await click('Αποθήκευση αντιστοίχισης LAB');
  assert.match(document.querySelector('[role=alert]').textContent,/αντιστοίχιση αποθηκεύτηκε/);assert.equal(calls.filter(x=>x.options.method==='PUT').length,1);assert.equal(document.querySelector('.efood-manual-mapping'),null);
  await click('Προεπισκόπηση προϊόντων');assert.match(document.body.textContent,/LAB EFOOD Fixture/);assert.equal(calls.filter(x=>x.options.method==='PUT').length,1);
 });
});

test('late mapping result for previous store is ignored and cannot refresh or display into a new scope',async()=>{
 const calls=[];let release;
 const request=async(url,options={})=>{calls.push({url,options});if(options.method==='PUT')return new Promise(resolve=>release=()=>resolve({ok:true,mapping:{productId:'fixture-id',status:'MATCHED'}}));return url.endsWith('/event-previews')?list:preview(false)};
 await mounted(request,async({render,click,input,confirm,act})=>{
  await render('A');await click('Εμφάνιση αποθηκευμένων events');await click('Προεπισκόπηση προϊόντων');await input('fixture-id');await confirm();await click('Αποθήκευση αντιστοίχισης LAB');assert.equal(calls.length,3);
  await render('B');await act(async()=>release());assert.equal(calls.length,3);assert.equal(document.querySelector('.efood-event-preview-result'),null);assert.doesNotMatch(document.body.textContent,/fixture-id|event-A|order-A/);
 });
});
