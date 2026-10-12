import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderOnlineOrderPrint} from '../../client/src/utils/online-order-destination.js';
test('delivery slip preserves destination, notes and literal customer text without active HTML',()=>{
 const dom=new JSDOM('<!doctype html><head></head><body></body>');
 renderOnlineOrderPrint(dom.window.document,{orderNumber:'ONL-LAB',customerName:'<img src=x onerror=alert(1)>',floor:'2',department:'Κλινική Α',room:'204',deliveryNotes:'<script>unsafe</script>',items:[{quantity:1,productName:'FREDDO',lineTotal:2}],total:2});
 assert.match(dom.window.document.body.textContent,/Όροφος: 2 · Κλινική \/ Τμήμα: Κλινική Α · Δωμάτιο \/ Γραφείο: 204/);assert.match(dom.window.document.body.textContent,/<script>unsafe<\/script>/);assert.equal(dom.window.document.querySelector('script,img'),null);dom.window.close();
});
test('mounted V2 staff list and reprint display room destination without triggering checkout',async()=>{
 const dom=new JSDOM('<div data-online-orders-host="true"></div><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreOnlineOrdersV2.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const row={id:'fictional',orderNumber:'ONL-LAB',status:'NEW',fulfillmentType:'DELIVERY',customerName:'Εικονικός Πελάτης',customerPhone:'6900000000',floor:'2',department:'Κλινική Α',room:'204',deliveryNotes:'Παράδοση έξω από το δωμάτιο',items:[],total:2};
 const calls=[];let popup,printed=0;window.open=()=>{popup=new JSDOM('<!doctype html><head></head><body></body>').window;popup.focus=()=>{};popup.print=()=>{printed++};return popup};
 const api=async(path,opts)=>{calls.push({path,opts});assert.match(path,/\/stores\/selected\/orders/);assert.equal(opts?.method,undefined);return path.endsWith('/print')?{print:{...row,location:'2 · Κλινική Α · 204'}}:{rows:[row]}};
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,store:{id:'selected'}})));
  await act(async()=>document.querySelector('[data-online-orders-launcher]').click());
  assert.match(document.body.textContent,/Όροφος: 2/);assert.match(document.body.textContent,/Κλινική Α/);assert.match(document.body.textContent,/Δωμάτιο \/ Γραφείο: 204/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ΕΠΑΝΕΚΤΥΠΩΣΗ')).click());
  assert.equal(printed,1);assert.match(popup.document.body.textContent,/204/);assert.match(popup.document.body.textContent,/Παράδοση έξω/);assert.equal(calls.filter(c=>c.path.endsWith('/print')).length,1);
 }finally{if(popup)popup.close();await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
