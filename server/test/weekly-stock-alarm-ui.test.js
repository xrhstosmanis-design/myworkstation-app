import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
async function component(path){const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;}
test('stock alarm and POS production React controls: grants, stale stores, company scope',async t=>{
 const Settings=await component('../../client/src/components/commerce/WeeklyStockAlarmPanel.jsx');
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),operator={id:'op'};let closes=0;
 const render=async(C,props)=>act(async()=>root.render(React.createElement(C,props))),clear=()=>act(async()=>root.render(null)),tick=()=>act(async()=>{}),text=()=>document.body.textContent;
 const base={store:{id:'a',name:'A'},operator,open:true,onOpen(){},onClose(){closes++}};
 try{
  await t.test('company editing uses company values and version, not an existing store override',async()=>{
   const company={enabled:true,historyDays:28,leadDays:3,safetyDays:2,floor:0},store={...company,enabled:false,historyDays:14,leadDays:5},calls=[];
   const api=async(path,options)=>{calls.push({path,options});if(path.endsWith('/stores'))return {stores:[{id:'a',name:'A'}]};if(options?.method==='PUT')return {ok:true};return {storeId:'a',policy:{settings:store,companySettings:company,companyVersion:3,storeVersion:7,inherited:false},history:[]}};
   await render(Settings,{api});let select=document.querySelector('select');await act(async()=>{select.value='a';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
   select=[...document.querySelectorAll('select')][1];await act(async()=>{select.value='COMPANY';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
   const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Αποθήκευση alarm stock');await act(async()=>save.click());const write=calls.find(c=>c.options?.method==='PUT');assert.ok(write);const body=JSON.parse(write.options.body);assert.equal(body.scope,'COMPANY');assert.equal(body.expectedVersion,3);assert.deepEqual(body.settings,company);await clear();
  });
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
