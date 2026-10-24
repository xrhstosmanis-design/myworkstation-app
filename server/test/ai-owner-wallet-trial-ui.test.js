import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted platform trial grant is explicit, separate from receipts, company scoped and survives uncertain retry',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/AiOwnerWalletAdmin.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];let fail=true,late,version=0;
  const state=id=>({companyId:id,runtimeEnabled:true,enabled:false,emailEnabled:false,version,availableMicros:'5000000',reservedMicros:'0',entries:version?[{id:'trial',kind:'CREDIT',feature:'TRIAL_GRANT',creditedMicros:'5000000',createdAt:'2026-10-22T00:00:00Z'}]:[],notices:[],usage:[],owners:[]});
  const api=async(path,options={})=>{calls.push({path,...options});if(options.method==='POST'){if(fail)throw Error('synthetic uncertain response');version++;return {id:'grant',replayed:true}}if(path.endsWith('/slow'))return new Promise(resolve=>late=resolve);return state(path.split('/').at(-1))};
  const change=async(el,value)=>act(async()=>{const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))});
  const select=()=>document.querySelector('select'),form=()=>document.querySelector('[aria-label="Δοκιμαστική πίστωση AI"]');
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{api,companies:[{id:'a',name:'Synthetic A',active:true},{id:'b',name:'Synthetic B',active:true},{id:'slow',name:'Synthetic slow',active:true}],onClose(){}})));
    await change(select(),'a');assert.match(document.body.textContent,/Χρέωση AI στον πελάτη/);assert.match(document.body.textContent,/κόστος του MyWorkStation/);
    const inputs=form().querySelectorAll('input');await change(inputs[0],'5');await change(inputs[1],'synthetic-reference');await change(inputs[2],'Synthetic internal trial');
    await act(async()=>inputs[3].click());assert.equal(form().querySelector('button').disabled,false);
    await act(async()=>{form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(calls.filter(c=>c.method==='POST').length,1);
    const first=calls.find(c=>c.method==='POST');assert.equal(first.path,'/api/ai-wallet/platform/companies/a/trial-grants');assert.deepEqual(JSON.parse(first.body),{amountMicros:'5000000',grantReference:'synthetic-reference',reason:'Synthetic internal trial',trialConfirmed:true});assert.equal(form().querySelectorAll('input')[1].value,'synthetic-reference');assert.match(document.body.textContent,/synthetic uncertain/);
    fail=false;await act(async()=>form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.filter(c=>c.method==='POST').length,2);assert.equal(calls.filter(c=>c.method==='POST')[1].body,first.body);assert.equal(form().querySelector('input').value,'');assert.match(document.body.textContent,/Δοκιμαστική πίστωση από MyWorkStation/);
    await change(select(),'slow');assert.equal(form(),null);const old=calls.at(-1);await change(select(),'b');assert.equal(old.signal.aborted,true);await act(async()=>late(state('slow')));assert.equal(select().value,'b');assert.equal(form().querySelector('input').value,'');assert.equal(form().querySelector('button').disabled,true);assert.equal(calls.some(c=>c.path.endsWith('/credits')&&c.method==='POST'),false);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
