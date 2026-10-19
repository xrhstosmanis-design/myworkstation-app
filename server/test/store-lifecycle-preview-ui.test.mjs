import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('actual fresh-start panel remains read-only while disabled, discards late store results and supports retry/unmount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/StoreLifecyclePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const root=createRoot(document.getElementById('root'));
 const pending=[],request=(path,options)=>{const d=deferred();pending.push({path,options,...d});return d.promise},props={company:{id:'c',name:'Company'},store:{id:'s',name:'Target'},request,onClose:()=>{}};
 const render=async p=>act(async()=>root.render(React.createElement(mod.exports.default,p))),preview=id=>({store:{id,companyId:'c'},checkedAt:new Date().toISOString(),totalRows:17,counts:[{table:'Sale',count:17,action:'REMOVE'}],executionAvailable:false});
 const refresh=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Ανανέωση απογραφής');
 try{
  await render(props);assert.match(pending[0].path,/companies\/c\/stores\/s\/lifecycle\/fresh-start$/);
  await render({...props,store:{id:'other',name:'Other'}});await act(async()=>pending[0].resolve(preview('s')));assert.equal(document.querySelector('table'),null);
  await act(async()=>pending[1].resolve(preview('other')));assert.match(document.querySelector('table').textContent,/17/);assert.equal(document.querySelector('select'),null);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Προετοιμασία νέας έναρξης').disabled);
  await act(async()=>refresh().click());await act(async()=>pending[2].resolve(preview('s')));assert.match(document.querySelector('[role="alert"]').textContent,/Λάθος κατάστημα/);assert.equal(document.querySelector('table'),null);
  await act(async()=>refresh().click());await act(async()=>pending[3].resolve(preview('other')));assert.match(document.querySelector('table').textContent,/17/);
  await act(async()=>refresh().click());await act(async()=>pending[4].resolve({...preview('other'),executionAvailable:true}));
  const start=[...document.querySelectorAll('button')].find(b=>b.textContent==='Προετοιμασία νέας έναρξης');assert.equal(start.disabled,false);await act(async()=>start.click());assert.equal(pending[5].options.method,'POST');assert.match(pending[5].path,/fresh-start\/start$/);
  const operationId='11111111-1111-4111-8111-111111111111';await act(async()=>pending[5].resolve({companyId:'c',storeId:'other',operationId,state:'DRAINING',maintenance:true,terminals:[{terminalPos:'KAT-POS-01',workFolder:'C:\\capture'},{terminalPos:'KAT-POS-02',workFolder:'C:\\capture'}]}));
  assert.match(document.body.textContent,/παραμένει σε συντήρηση/);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Έλεγχος αναφορών και νέου αντιγράφου').disabled);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Ακύρωση προετοιμασίας χωρίς διαγραφή').click());assert.deepEqual(JSON.parse(pending[6].options.body),{operationId});await act(async()=>pending[6].resolve({companyId:'c',storeId:'other',operationId,aborted:true}));assert.match(pending[7].path,new RegExp(operationId+'$'));await act(async()=>pending[7].resolve({companyId:'c',storeId:'other',operationId,state:'ABORTED'}));assert.match(document.body.textContent,/χωρίς εκκαθάριση/);
  await act(async()=>refresh().click());await act(async()=>root.unmount());await act(async()=>pending[8].resolve(preview('other')));assert.ok(pending.filter(x=>x.options).every(x=>/\/(start|abort)$/.test(x.path)));
 }finally{dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}
});
