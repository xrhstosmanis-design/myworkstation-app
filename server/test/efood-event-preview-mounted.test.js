import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('native integration preview is outside credential forms and cannot implicitly submit setup',async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/StoreFiscalIntegrations.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React,calls=[];
  const request=async(url,options={})=>{calls.push({url,options});assert.ok(!options.method||options.method==='GET');if(url.endsWith('/event-previews'))return {events:[{id:'event',externalOrderId:'order',externalStatus:'READY_FOR_PICKUP'}]};return {labAllowed:true,integration:{updatedAt:'synthetic-version',metadata:{vendorId:'9344842'},webhookTest:{accepting:false,status:'CONSUMED',secretConfigured:true}}}};
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{manager:{company:{id:'company',name:'MYWORKSTATION LAB'},store:{id:'store',name:'ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ'},integrations:[]},request,onClose:()=>{},onChanged:()=>{throw Error('Unexpected setup mutation')}})));
    const panel=document.querySelector('.efood-event-preview');assert.ok(panel);assert.equal(panel.closest('form'),null);assert.equal(document.querySelectorAll('form').length,3);
    await act(async()=>[...panel.querySelectorAll('button')].find(button=>button.textContent==='Εμφάνιση αποθηκευμένων events').click());
    assert.equal(panel.querySelector('select').closest('form'),null);assert.ok([...panel.querySelectorAll('button')].every(button=>button.type==='button'));
    await act(async()=>panel.querySelector('select').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    assert.equal(calls.filter(call=>call.options.method&&call.options.method!=='GET').length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});

test('mounted efood preview uses GET only, escapes product names and discards late store and unmount responses',async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/EfoodEventPreview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;
  const calls=[];let release,hold=true;
  const preview=store=>({eventId:'event-'+store,providerStoreId:'9344842',status:'READY_FOR_PICKUP',mode:'LAB_WEBHOOK_TEST',mappingComplete:false,items:[{line:1,name:'<img src=x>',externalSku:'SLL45E',barcodes:['05201050130791'],quantity:2,mappingStatus:'UNMATCHED',reason:'MAPPING_MISSING'}]});
  const request=async(url,options={})=>{calls.push({url,options});const store=url.includes('/A/')?'A':'B';if(url.endsWith('/event-previews'))return {events:[{id:'event-'+store,externalOrderId:'order-'+store,externalStatus:'READY_FOR_PICKUP'}]};if(hold)return new Promise(resolve=>release=()=>resolve(preview(store)));return preview(store)};
  const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{url:'/api/platform/companies/company/stores/'+store+'/efood',request})));
  const click=label=>act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===label).click());
  try{
    await render('A');assert.equal(calls.length,0);await click('Εμφάνιση αποθηκευμένων events');assert.match(document.querySelector('select').textContent,/order-A/);
    await click('Προεπισκόπηση προϊόντων');const count=calls.length;assert.ok([...document.querySelectorAll('button')].every(button=>button.disabled));
    await render('B');assert.equal(document.querySelector('select'),null);await act(async()=>release());assert.equal(document.querySelector('.efood-event-preview-result'),null);assert.doesNotMatch(document.body.textContent,/event-A|order-A/);assert.equal(calls.length,count);
    hold=false;await click('Εμφάνιση αποθηκευμένων events');await click('Προεπισκόπηση προϊόντων');assert.match(document.querySelector('.efood-event-preview-result').textContent,/event-B/);assert.match(document.body.textContent,/05201050130791/);assert.match(document.body.textContent,/Ποσότητα: 2/);assert.match(document.body.textContent,/Δεν υπάρχει αντιστοίχιση/);assert.equal(document.querySelector('img'),null);
    assert.ok(calls.every(call=>!call.options.method||call.options.method==='GET'));assert.ok(calls.every(call=>!call.options.body));assert.ok(calls.every(call=>/\/(event-previews|events\/event-[AB]\/preview)$/.test(call.url)));
    hold=true;await click('Προεπισκόπηση προϊόντων');await act(async()=>root.unmount());await act(async()=>release());assert.equal(document.getElementById('root').textContent,'');
  }finally{if(document.getElementById('root').textContent)await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});
