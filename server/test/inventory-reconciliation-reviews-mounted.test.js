import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual review controls keep one actor-scoped UUID across lost reply, remount, verification and explicit retry',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','FormData','crypto','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='crypto'?{randomUUID}:dom.window[key]});
  let accepted=false;dom.window.confirm=()=>accepted;
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryReviewControls.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const report={current:{id:'new',storeId:'s'},previous:{id:'old'},generation:'0',viewerId:'owner',fingerprint:'a'.repeat(64),rows:[{productId:'p',sku:'P',name:'Γυαλιά',difference:-263}],review:{head:null,available:true,canWrite:true,history:[]}};
  const calls=[],locks=[];let rejectFirst,refreshes=0;
  const api=async(path,options)=>{
    calls.push({path,options});
    if(!options?.method)return report;
    const posts=calls.filter(x=>x.options?.method==='POST');
    if(posts.length===1)return new Promise((resolve,reject)=>{rejectFirst=reject});
    const body=JSON.parse(options.body);return {ok:true,requestId:body.requestId,receiptId:'receipt',head:'b'.repeat(64)};
  };
  const root=createRoot(document.getElementById('root')),onLockChange=value=>locks.push(value),onRefresh=async()=>{refreshes++;};
  const render=()=>act(async()=>root.render(React.createElement(module.exports.default,{api,report,stocktakeId:'new',storeId:'s',onLockChange,onRefresh})));
  const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
  const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  try{
    await render();assert.equal(calls.length,0);
    const submit=button('Καταχώριση διόρθωσης αναφοράς'),form=submit.closest('form');form.parentElement.open=true;
    await change(form.querySelector('[name="product"]'),'p');await change(form.querySelector('[name="quantity"]'),'240');
    await change(form.querySelector('[name="reason"]'),'Επιβεβαιωμένη επανακαταμέτρηση');await change(form.querySelector('[name="evidence"]'),'Φύλλο μέτρησης γυαλιών');
    await act(async()=>submit.click());assert.equal(calls.length,0,'cancelled confirmation cannot post');
    accepted=true;await act(async()=>{submit.click();submit.click();});
    assert.equal(calls.filter(x=>x.options?.method==='POST').length,1);const first=JSON.parse(calls[0].options.body);
    assert.match(first.requestId,/^[a-f0-9-]{36}$/);assert.equal(first.action.quantity,240);assert.equal(first.head,null);assert.equal(locks.at(-1),true);
    await act(async()=>rejectFirst(new Error('Lost response')));assert.match(document.body.textContent,/Επαλήθευσε/);
    await act(async()=>root.render(null));await render();assert.equal(calls.filter(x=>x.options?.method==='POST').length,1,'remount does not resend');
    await act(async()=>button('Επαλήθευση καταχώρισης').click());assert.match(document.body.textContent,/Δεν βρέθηκε ακόμη/);assert.equal(calls.filter(x=>x.options?.method==='POST').length,1);
    await act(async()=>button('Επανάληψη ίδιας ενέργειας').click());
    const posts=calls.filter(x=>x.options?.method==='POST');assert.equal(posts.length,2);assert.deepEqual(JSON.parse(posts[1].options.body),first);assert.equal(refreshes,1);assert.equal(locks.at(-1),false);
    assert.equal(dom.window.sessionStorage.length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
