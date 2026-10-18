import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('actual preparation panel uses GET only, discards late scope/mode responses, retries errors and never exposes destructive submit',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/StoreLifecyclePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const root=createRoot(document.getElementById('root'));
 const pending=[],request=(path,options)=>{const d=deferred();pending.push({path,options,...d});return d.promise},props={company:{id:'c',name:'Company'},store:{id:'s',name:'Target'},request,onClose:()=>{}};
 const render=async p=>act(async()=>root.render(React.createElement(mod.exports.default,p))),preview=(id,mode='RESET')=>({store:{id,companyId:'c'},mode,checkedAt:new Date().toISOString(),inventory:[{table:'Sale',count:id==='s'?5:17,action:'REMOVE'}],blockers:[{code:'OPEN_SHIFT',count:1}],preservedShared:['Protected catalog'],indirect:[],limitations:['Not executable'],executionAvailable:false});
 try{
 await render(props);assert.equal(pending.length,1);assert.match(pending[0].path,/companies\/c\/stores\/s\/lifecycle\/preview\?mode=RESET$/);await render({...props,store:{id:'other',name:'Other'}});await act(async()=>pending[0].resolve(preview('s')));assert.equal(document.querySelector('table'),null);
 await act(async()=>pending[1].resolve(preview('other')));assert.match(document.querySelector('table').textContent,/17/);assert.match(document.body.textContent,/Ανοιχτή βάρδια/);
 await act(async()=>{const select=document.querySelector('select');Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(select,'DELETE');select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(document.querySelector('table'),null);assert.match(pending[2].path,/mode=DELETE$/);
 await act(async()=>pending[2].resolve(preview('s','DELETE')));assert.match(document.querySelector('[role="alert"]').textContent,/δεν αντιστοιχεί/);assert.equal(document.querySelector('table'),null);
 await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Ανανέωση απογραφής').click());await act(async()=>pending[3].resolve(preview('other','DELETE')));assert.match(document.querySelector('table').textContent,/17/);assert.equal(document.querySelector('form'),null);assert.equal(document.querySelector('button[type="submit"]'),null);assert.ok(pending.every(x=>x.options===undefined));
 await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Ανανέωση απογραφής').click());await act(async()=>root.unmount());await act(async()=>pending[4].resolve(preview('other','DELETE')));
 }finally{dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}
});
