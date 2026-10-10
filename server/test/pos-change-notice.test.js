import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {changeDue} from '../../client/src/utils/pos-change-notice.js';

test('change uses cents and never promises change for missing, invalid or insufficient tender',()=>{
 assert.equal(changeDue('20',1),19);
 assert.equal(changeDue('20,00',1.25),18.75);
 assert.equal(changeDue('1',.1+.2),.7);
 assert.equal(changeDue('1',1),0);
 for(const [received,total] of [['',1],[null,1],['0,99',1],['bad',1],[Infinity,1],[20,undefined],[20,null],[20,-1],[-1,1],[1,Infinity],[1e20,1]])assert.equal(changeDue(received,total),null);
});

test('actual POS change notice expires in three seconds, survives successful cart/load reset and protects scanner/payment gates',async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[],product={id:'water',sku:'2270',name:'Fixture water',currentStock:100,salePrice:1,barcodes:['52101588']};let checkout,pendingRequest,pendingPoll=[];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/rbs-capdriver-v1/change-fixture'))return new Promise(resolve=>pendingPoll.push(resolve));
  if(path.endsWith('/checkout'))return new Promise((resolve,reject)=>{checkout={resolve,reject}});
  if(path==='/api/store-pos/stores/A')return {products:[product],layout:{quickKeys:[],categories:[]},access:{}};
  if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');
  return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}};
 };
 const input=()=>document.querySelector('[data-pos-scanner]'),notice=()=>document.querySelector('.pos-change-notice');
 const scan=async()=>{await act(async()=>{input().focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input(),'52101588');input().dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))};
 const key=async value=>act(async()=>[...document.querySelectorAll('.number-grid button')].find(b=>b.textContent===value).click());
 const clear=async()=>act(async()=>document.querySelector('.clear-money').click());
 const tick=async ms=>act(async()=>t.mock.timers.tick(ms));
 const cash=async()=>act(async()=>document.querySelector('button.cash').click());
 const count=()=>calls.filter(c=>c.path.endsWith('/checkout')).length;
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:'A',name:'Fixture store'}})));
  t.mock.timers.enable({apis:['setTimeout']});
  await scan();await key('2');await key('0');assert.match(notice().textContent,/ΡΕΣΤΑ19,00/);assert.equal(notice().getAttribute('role'),'status');assert.equal(document.activeElement,input());
  await tick(2900);assert.ok(notice());await key('⌫');assert.match(notice().textContent,/1,00/);
  await tick(100);assert.ok(notice());await tick(2899);assert.ok(notice());await tick(1);assert.equal(notice(),null);
  await clear();await key('0');assert.equal(notice(),null);await clear();await key('1');assert.match(notice().textContent,/0,00/);
  await clear();await key('2');await key('0');await cash();assert.equal(notice(),null);assert.equal(count(),1);
  await act(async()=>checkout.reject(Error('payment rejected')));assert.ok(document.querySelector('.standard-line'));assert.notEqual(notice()?.dataset.changePhase,'COMPLETE');
  await cash();await key('2');await act(async()=>checkout.resolve({total:1,payments:[{method:'CASH',amount:1}]}));
  assert.equal(document.querySelector('.standard-line'),null);assert.match(notice().textContent,/19,00/);assert.equal(notice().dataset.changePhase,'COMPLETE');assert.equal(document.activeElement,input());
  assert.equal(document.querySelector('.money-cards').textContent.includes('20,00'),false);await tick(2999);assert.ok(notice());await tick(1);assert.equal(notice(),null);
  const body=JSON.parse(calls.find(c=>c.path.endsWith('/checkout')).options.body);assert.equal(body.paymentMethod,'CASH');assert.equal(body.items[0].productId,'water');assert.equal(body.items[0].quantity,1);assert.equal('received' in body,false);
  await scan();await key('2');await key('0');await act(async()=>document.querySelector('button.card').click());
  await act(async()=>document.querySelector('.pos-card-terminal-picker .pos-primary-inline').click());
  await act(async()=>checkout.resolve({total:1,payments:[{method:'CARD',amount:1}]}));assert.equal(notice(),null);assert.equal(count(),3);
  await scan();await cash();await act(async()=>checkout.resolve({total:1}));assert.equal(notice(),null);
  await scan();await key('2');await key('0');await cash();await act(async()=>checkout.resolve({total:1.25,payments:[{method:'CASH',amount:1.25}]}));assert.match(notice().textContent,/18,75/);await tick(3000);assert.equal(notice(),null);
  await scan();await key('2');await key('0');await cash();pendingRequest={id:'change-fixture',status:'PENDING',paymentMethod:'CASH',total:1,clientTransactionId:JSON.parse(calls.filter(c=>c.path.endsWith('/checkout')).at(-1).options.body).clientTransactionId};
  await act(async()=>checkout.resolve({fiscalPending:true,request:pendingRequest}));assert.equal(notice(),null);assert.ok(document.querySelector('.standard-line'));assert.equal(input().disabled,true);assert.equal(count(),6);
  assert.ok(document.querySelector('.pos-price-modal'));
  await act(async()=>{for(const resolve of pendingPoll.splice(0))resolve({request:{...pendingRequest,status:'SALE_COMMITTED',saleId:'mock-sale'}})});
  assert.equal(document.querySelector('.standard-line'),null);assert.match(notice().textContent,/19,00/);assert.equal(notice().dataset.changePhase,'COMPLETE');assert.equal(document.activeElement,input());assert.equal(count(),6);
  await tick(3000);assert.equal(notice(),null);
 }finally{await act(async()=>root.unmount());t.mock.timers.reset();dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
