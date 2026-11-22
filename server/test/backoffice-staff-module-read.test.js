import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const enforcement=await readFile(new URL('../../client/src/module-ui-enforcement.js',import.meta.url),'utf8');
function install(dom,fetch){
 dom.window.fetch=fetch;
 new Function('window','document','localStorage','MutationObserver','CustomEvent','setInterval','clearInterval',enforcement.replace('export function installModuleUiEnforcement','function installModuleUiEnforcement')+';installModuleUiEnforcement();')(
  dom.window,dom.window.document,dom.window.localStorage,dom.window.MutationObserver,dom.window.CustomEvent,()=>1,()=>{});
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('actual legacy interceptor sends personal reads and writes to canonical server without owner licence or fabricated success',async()=>{
 const dom=new JSDOM('<aside><nav><button>Προσωπικό</button></nav></aside>',{url:'https://isolated.invalid'}),calls=[];
 dom.window.localStorage.setItem('token','synthetic-staff');dom.window.localStorage.setItem('user',JSON.stringify({staffAccess:true}));
 install(dom,async(path,options)=>{calls.push({path,options});return json({error:'live server refusal'},403)});
 try{
  for(const [method,path] of [['GET','/api/transactions/stores/A/overview'],['GET','/api/cash/stores/A/overview'],['POST','/api/transactions/stores/A']]){
   const options={method,headers:{Authorization:'Bearer synthetic-staff','x-backoffice-store-id':'A','x-mws-terminal-pos':'POS2'}};
   const r=await dom.window.fetch(path,options);assert.equal(r.status,403);assert.equal((await r.json()).error,'live server refusal');assert.equal(calls.at(-1).options,options);
  }
  assert.equal(calls.length,3);assert.ok(calls.every(c=>!c.path.startsWith('/api/license')));
  assert.equal(dom.window.document.querySelector('button').style.display,'');
 }finally{dom.window.close()}
});

test('ordinary Owner retains disabled-module fallback and enabled-module real response',async()=>{
 for(const enabled of [false,true]){
  const dom=new JSDOM('<div/>',{url:'https://isolated.invalid'}),calls=[];
  dom.window.localStorage.setItem('token','synthetic-owner');dom.window.localStorage.setItem('user',JSON.stringify({role:'OWNER'}));
  install(dom,async path=>{calls.push(path);return json(path.startsWith('/api/license')?{activeModules:enabled?['CASH_CONTROL']:[]}:{store:{id:'A'}})});
  try{await new Promise(resolve=>setImmediate(resolve));const r=await dom.window.fetch('/api/cash/stores/A/overview');assert.deepEqual(await r.json(),enabled?{store:{id:'A'}}:null);assert.equal(calls.some(p=>p.includes('/cash/')),enabled)}finally{dom.window.close()}
 }
});

test('mounted actual shift center through legacy interceptor distinguishes authorised data, refusal, foreign store and verified empty',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreTransactionsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT','setInterval','clearInterval'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='setInterval'?()=>1:k==='clearInterval'?()=>{}:dom.window[k]});
 dom.window.localStorage.setItem('token','synthetic-staff');dom.window.localStorage.setItem('user',JSON.stringify({staffAccess:true}));
 let scenario='valid';const calls=[];
 install(dom,async(path,options={})=>{
  calls.push({path,options});if(path.startsWith('/api/license'))return json({error:'owner only'},403);
  assert.equal(options.headers['x-backoffice-store-id'],'A');assert.equal(options.headers['x-mws-terminal-pos'],'POS2');assert.equal(options.method||'GET','GET');
  if(scenario==='denied')return json({error:'revoked grant'},403);
  if(path.includes('/sales/recent'))return json({rows:[]});
  const store={id:scenario==='foreign'?'B':'A'},openSession=scenario==='empty'?null:{id:'shift-a',terminalPos:'POS2',openingOperational:7};
  return json({store,openSession,openSessions:openSession?[openSession]:[],recent:[],summaryBySession:{'shift-a':{cashSales:3,cardSales:2,irisSales:0,expensesTotal:1,transferIn:0,transferOut:0}}});
 });
 const api=async path=>{const r=await window.fetch(path,{headers:{'x-backoffice-store-id':'A','x-mws-terminal-pos':'POS2'}}),data=await r.json();if(!r.ok)throw Error(data.error);return data};
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 try{
  for(scenario of ['valid','denied','foreign','empty']){
   await React.act(async()=>root.render(React.createElement(m.exports.default,{key:scenario,api,store:{id:'A'},readOnly:true})));
   if(scenario==='valid'){assert.equal(document.querySelector('.current-shift-cash strong').textContent,(9).toLocaleString('el-GR',{style:'currency',currency:'EUR'}));assert.match(document.body.textContent,/POS2/);assert.equal(document.querySelector('.cloud-error'),null)}
   else if(scenario==='empty'){assert.match(document.querySelector('.ledger-no-shift').textContent,/Δεν υπάρχει ανοιχτή βάρδια/);assert.equal(document.querySelector('.cloud-error'),null)}
   else{assert.match(document.querySelector('.cloud-error').textContent,scenario==='denied'?/revoked grant/:/δεν αντιστοιχεί/);assert.equal(document.querySelector('.ledger-no-shift'),null);assert.match(document.querySelector('[role="status"]').textContent,/Δεν ολοκληρώθηκε/);assert.equal(document.querySelector('.current-shift-cash'),null)}
  }
  assert.ok(calls.every(c=>!c.path.startsWith('/api/license')));assert.equal(document.querySelector('.shift-detail-actions button'),null);
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
