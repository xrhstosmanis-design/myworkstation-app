import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted My payments uses the complete own active-shift projection beyond eighty sales and clears closed/stale scopes',async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/MyShiftEntriesPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
  const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
  let closed=false,hold=false,release,legacy=false,calls=[];
  const api=async(path,options={})=>{
    calls.push({path,options});const storeId=path.match(/stores\/([^/]+)/)[1],sessionId=storeId+'-shift';
    const base={store:{id:storeId},openSession:closed?null:{id:sessionId},recent:Array.from({length:80},(_,i)=>({id:'sale'+i,type:'SALE_CASH',amount:1})),myPayments:[
      {id:'supplier',sessionId,type:'SUPPLIER_PAYMENT',amount:400,actorId:'actor',supplierName:'VIRTUAL SUPPLIER',occurredAt:'2026-10-12T00:00:00Z',createdAt:'2026-10-12T17:22:00Z'},
      {id:'expense',sessionId,type:'OTHER_EXPENSE',amount:80,actorId:'actor'},
      {id:'reversed',sessionId,type:'OTHER_EXPENSE',amount:99,actorId:'actor',reversedAt:'2026-10-12T19:00:00Z'},
      {id:'foreign-actor',sessionId,type:'OTHER_EXPENSE',amount:777,actorId:'other'},
      {id:'closed-shift',sessionId:'old',type:'OTHER_EXPENSE',amount:777,actorId:'actor'},
      {id:'external',sessionId:null,type:'OTHER_EXPENSE',amount:777,actorId:'actor'},
    ]};if(legacy)delete base.myPayments;
    return hold?new Promise(r=>{release=()=>r(base)}):base;
  };
  const mount=storeId=>act(async()=>root.render(React.createElement(m.exports.default,{api,store:{id:storeId},operator:{id:'actor'}})));
  const refresh=()=>act(async()=>document.querySelector('.cloud-panel-head button').click());
  const values=()=>[...document.querySelectorAll('.commerce-card strong')].map(e=>e.textContent);
  try{
    await mount('A');assert.deepEqual(values(),[480,400,80].map(v=>v.toLocaleString('el-GR',{style:'currency',currency:'EUR'})));assert.equal(document.querySelectorAll('.ledger-row').length,3);
    assert.match(document.body.textContent,/Καταχώριση:.*20:22/);assert.equal(document.body.textContent.includes('777'),false);
    hold=true;await refresh();hold=false;await mount('B');await act(async()=>release());assert.deepEqual(values(),[480,400,80].map(v=>v.toLocaleString('el-GR',{style:'currency',currency:'EUR'})));
    closed=true;await refresh();assert.equal(document.querySelectorAll('.ledger-row').length,0);assert.ok(values().every(v=>v.includes('0,00')));
    closed=false;legacy=true;await refresh();assert.match(document.querySelector('.cloud-error').textContent,/πλήρης λίστα/);assert.equal(document.querySelectorAll('.ledger-row').length,0);
    assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
