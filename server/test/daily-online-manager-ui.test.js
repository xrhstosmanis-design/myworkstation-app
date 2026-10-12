import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
test('mounted manager preserves saved QR through draft and failed save, exposes staff percent and approval decisions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/OnlineStoreManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const calls=[];let fail=true,members=[{id:'pending',fullName:'Εικονικό Μέλος',phoneNormalized:'6900000000',memberType:'STAFF',approvalStatus:'PENDING',active:false}],error;
 const request=async(path,opts)=>{calls.push({path,opts});assert.match(path,/companies\/company\/stores\/store\/online-store/);if(opts?.method==='PUT'){if(fail)throw Error('Save failed');return{settings:{...JSON.parse(opts.body),publicSlug:'canonical'}}}if(opts?.method==='PATCH'){members=[];return{ok:true}}return{members}};
 function Host(){const [manager,setManager]=React.useState({company:{id:'company'},store:{id:'store',name:'DAILY'},settings:{enabled:false,publicSlug:'saved',doctorDiscountPercent:15,nurseDiscountPercent:10,staffDiscountPercent:0},products:[]}),[busy,setBusy]=React.useState('');return React.createElement(m.exports.default,{manager,setManager,request,busy,setBusy,setError(v){error=v},setMessage(){},onClose(){}})}
 const root=createRoot(document.getElementById('root')),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),qrLink=()=>document.querySelector('.online-store-qr a').href;
 const change=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});
 try{
  await act(async()=>root.render(React.createElement(Host)));await act(async()=>{await new Promise(r=>setTimeout(r,100))});assert.equal(qrLink(),'https://isolated.invalid/online/saved');
  await change(document.querySelector('.slug-input input'),'draft');assert.equal(qrLink(),'https://isolated.invalid/online/saved');
  const staff=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Έκπτωση προσωπικού %')).querySelector('input');await change(staff,'7.5');
  await act(async()=>button('Αποθήκευση ρυθμίσεων').click());assert.equal(error,'Save failed');assert.equal(qrLink(),'https://isolated.invalid/online/saved');
  fail=false;await act(async()=>button('Αποθήκευση ρυθμίσεων').click());await act(async()=>{await new Promise(r=>setTimeout(r,100))});assert.equal(qrLink(),'https://isolated.invalid/online/canonical');
  const settings=JSON.parse(calls.filter(c=>c.opts?.method==='PUT').at(-1).opts.body);assert.equal(Number(settings.staffDiscountPercent),7.5);assert.equal(settings.nurseDiscountPercent,10);assert.equal(settings.enabled,false);
  await act(async()=>button('Έγκριση').click());assert.deepEqual(JSON.parse(calls.find(c=>c.opts?.method==='PATCH').opts.body),{active:true,decision:'APPROVE'});
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
