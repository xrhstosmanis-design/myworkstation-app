import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {submitPosCloseWithoutPrint} from '../../client/src/utils/pos-close-without-print.mjs';

test('no-print uses unchanged waste request with cart quantities and no price overrides',async()=>{
  const calls=[];
  await submitPosCloseWithoutPrint({api:async(...args)=>calls.push(args),storeId:'A',cart:[
    {id:'water',quantity:2.5,salePrice:0.01,manualPrice:true},
    {id:'coffee',quantity:3},
    {id:'return',quantity:1,exchangeReturn:true},
  ]});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/api/store-pos/stores/A/waste');
  assert.equal(calls[0][1].method,'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body),{items:[
    {productId:'water',quantity:2.5},{productId:'coffee',quantity:3},
  ],note:null});
});

test('table path keeps mandatory reason and the existing whole-order endpoint',async()=>{
  const calls=[],api=async(...args)=>calls.push(args),context={api,storeId:'A',cart:[{id:'water',quantity:2}],tableOrderId:'table-order'};
  await assert.rejects(submitPosCloseWithoutPrint(context),/απαιτεί αιτία/);
  assert.equal(calls.length,0);
  await submitPosCloseWithoutPrint({...context,note:'  Existing reason  '});
  assert.equal(calls[0][0],'/api/store-pos/stores/A/table-orders/table-order/waste');
  assert.deepEqual(JSON.parse(calls[0][1].body),{items:[{productId:'water',quantity:2}],note:'Existing reason'});
});

test('empty/return-only and invalid quantity never post; server failures are not retried',async()=>{
  let calls=0;const api=async()=>{calls++;throw new Error('server rejected')};
  for(const cart of [[],[{id:'return',quantity:1,exchangeReturn:true}],[{id:'water',quantity:-1}],[{id:'water',quantity:'invalid'}]]) {
    await assert.rejects(submitPosCloseWithoutPrint({api,storeId:'A',cart}));
  }
  assert.equal(calls,0);
  await assert.rejects(submitPosCloseWithoutPrint({api,storeId:'A',cart:[{id:'water',quantity:1}]}),/server rejected/);
  assert.equal(calls,1);
});

// Actual POS component, isolated DOM/API only: no real sale or LAB PASS.
test('POS no-print button posts once without a dialog and retains cart on rejection',async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
  const module={exports:{}};
  new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Panel=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
  const keys=['window','document','navigator','HTMLElement','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
  const calls=[];let finish;
  const product={id:'water',sku:'2270',name:'ΝΕΡΟ 1,5LT',salePrice:1,barcodes:[]};
  const api=async(path,options={})=>{
    calls.push({path,options});
    if(path.endsWith('/waste'))return new Promise((resolve,reject)=>{finish={resolve,reject}});
    if(path==='/api/store-pos/stores/A')return {products:[product],layoutVersion:11,layout:{title:'OPERATOR POS',quickKeys:[{id:'quick',label:product.name,productQuery:'2270',visible:true}],categories:[]},access:{}};
    if(path.endsWith('/table-service')||path==='/api/netlink/status')throw new Error('not enabled');
    if(path.endsWith('/online-radio'))return {stations:[],state:{}};
    return {rows:[],items:[],requests:[],offers:[]};
  };
  const noPrint=()=>[...document.querySelectorAll('.standard-action-bar button')].find(el=>el.textContent==='Κλείσιμο χωρίς Εκτύπωση');
  const add=async()=>act(async()=>document.querySelector('.standard-quick button:not(:disabled)').click());
  try{
    await act(async()=>root.render(React.createElement(Panel,{api,store:{id:'A',name:'Fixture store'},operator:{fullName:'Fixture operator'}})));
    assert.equal(noPrint().disabled,true);
    await add();
    assert.equal(document.querySelectorAll('.standard-line').length,1);
    await act(async()=>{noPrint().click();noPrint().click();});
    assert.equal(calls.filter(row=>row.path.endsWith('/waste')).length,1);
    assert.equal(document.querySelector('.pos-standard-modal'),null);
    assert.equal(noPrint().disabled,true);
    await act(async()=>finish.reject(new Error('server rejected')));
    assert.equal(document.querySelectorAll('.standard-line').length,1);
    assert.match(document.querySelector('.store-pos-alert.error').textContent,/server rejected/);
    assert.equal(calls.filter(row=>row.path.endsWith('/waste')).length,1);
    await act(async()=>noPrint().click());
    await act(async()=>finish.resolve({total:1}));
    assert.equal(document.querySelectorAll('.standard-line').length,0);
    assert.match(document.querySelector('.store-pos-alert.success').textContent,/χωρίς εκτύπωση/);
    assert.equal(document.querySelector('.pos-standard-modal'),null);
    assert.equal(calls.some(row=>/\/checkout$|rbs-capdriver-v1$/.test(row.path)&&row.options.method==='POST'),false);
    await add();
    Object.defineProperty(dom.window.navigator,'onLine',{configurable:true,value:false});
    await act(async()=>window.dispatchEvent(new dom.window.Event('offline')));
    assert.equal(noPrint().disabled,true);
    assert.equal(calls.filter(row=>row.path.endsWith('/waste')).length,2);
    assert.deepEqual(JSON.parse(localStorage.getItem('myworkstation:offline-pos-sales:A')||'[]'),[]);
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
