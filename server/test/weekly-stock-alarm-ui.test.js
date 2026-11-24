import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
async function component(path){const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;}
test('stock alarm and POS production React controls: grants, stale stores, company scope',async t=>{
 const Pos=await component('../../client/src/components/store/PosOrderSuggestions.jsx'),Settings=await component('../../client/src/components/commerce/WeeklyStockAlarmPanel.jsx');
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),operator={id:'op'};let closes=0;
 const render=async(C,props)=>act(async()=>root.render(React.createElement(C,props))),clear=()=>act(async()=>root.render(null)),tick=()=>act(async()=>{}),text=()=>document.body.textContent;
 const base={store:{id:'a',name:'A'},operator,open:true,onOpen(){},onClose(){closes++}};
 try{
  await t.test('unauthorized POS operator sees no launcher and makes no proposal request',async()=>{const calls=[];await render(Pos,{...base,api:async path=>{calls.push(path);throw Error('403')}});assert.equal(document.querySelector('button'),null);assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/permission'));await clear()});
  await t.test('proposal is read-only and grant revocation on focus removes its data',async()=>{let allowed=true;const calls=[],api=async path=>{calls.push(path);if(path.endsWith('/permission')){if(!allowed)throw Error('403');return {storeId:'a',allowed:true}}return {storeId:'a',rows:[{productId:'p',name:'Water',sku:'P',currentStock:4,minStock:20,suggestedQuantity:16,unitLabel:'τεμ.',reason:'Κάλυψη',warnings:[]}]}};await render(Pos,{...base,api});await tick();assert.match(text(),/Water/);assert.match(text(),/16/);assert.equal(calls.filter(p=>p.endsWith('/proposal')).length,1);allowed=false;await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));assert.doesNotMatch(text(),/Water/);assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(closes>0);await clear()});
  await t.test('late response from previous store cannot populate the new POS context',async()=>{let resolveA;const pending=new Promise(r=>resolveA=r),api=async path=>path.endsWith('/permission')?{storeId:path.includes('/a/')?'a':'b',allowed:true}:path.includes('/a/')?pending:{storeId:'b',rows:[]};await render(Pos,{...base,api});await tick();await render(Pos,{...base,api,store:{id:'b',name:'B'}});await act(async()=>resolveA({storeId:'a',rows:[{productId:'p',name:'OLD STORE',suggestedQuantity:3,warnings:[]}]}));assert.doesNotMatch(text(),/OLD STORE/);await clear()});
  await t.test('company editing uses company values and version, not an existing store override',async()=>{
   const company={enabled:true,historyDays:28,leadDays:3,safetyDays:2,floor:0},store={...company,enabled:false,historyDays:14,leadDays:5},calls=[];
   const api=async(path,options)=>{calls.push({path,options});if(path.endsWith('/stores'))return {stores:[{id:'a',name:'A'}]};if(options?.method==='PUT')return {ok:true};return {storeId:'a',policy:{settings:store,companySettings:company,companyVersion:3,storeVersion:7,inherited:false},history:[]}};
   await render(Settings,{api});let select=document.querySelector('select');await act(async()=>{select.value='a';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
   select=[...document.querySelectorAll('select')][1];await act(async()=>{select.value='COMPANY';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
   const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Αποθήκευση alarm stock');await act(async()=>save.click());const write=calls.find(c=>c.options?.method==='PUT');assert.ok(write);const body=JSON.parse(write.options.body);assert.equal(body.scope,'COMPANY');assert.equal(body.expectedVersion,3);assert.deepEqual(body.settings,company);await clear();
  });
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
