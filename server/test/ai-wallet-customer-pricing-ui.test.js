import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted admin saves all three prices only after explicit confirmation, preserves scope and discards late company data',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/AiOwnerWalletAdmin.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];let resolveLate,late=true;
  const data=id=>({runtimeEnabled:true,enabled:false,emailEnabled:false,companyId:id,version:id==='b'?7:3,availableMicros:'0',reservedMicros:'0',owners:[],entries:[],usage:[],notices:[],customerPricing:{version:1,additionalMarkupBps:id==='b'?2500:500,callFeeMicros:id==='b'?'20':'999',invoiceFeeMicros:'100'}});
  let current=data('b');
  const api=async(path,options={})=>{calls.push({path,...options});if(options.method==='PUT'){const input=JSON.parse(options.body);current={...current,version:8,customerPricing:input.policy};return {version:8}}if(path.endsWith('/a')&&late)return new Promise(r=>resolveLate=r);return current};
  const set=async(element,value)=>act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  try{
    await act(async()=>root.render(React.createElement(mod.exports.default,{api,companies:[{id:'a',name:'Synthetic A',active:true},{id:'b',name:'Synthetic B',active:true}],onClose(){}})));
    await set(document.querySelector('select'),'a');await set(document.querySelector('select'),'b');
    await act(async()=>{resolveLate(data('a'));await Promise.resolve()});
    let form=document.querySelector('[aria-label="Τιμολόγηση AI πελάτη"]');assert.ok(form);assert.equal(form.querySelector('input').value,'25');assert.doesNotMatch(form.textContent,/999/);
    const inputs=form.querySelectorAll('input');await set(inputs[0],'12,50');await set(inputs[1],'0,000001');await set(inputs[2],'2,35');
    assert.equal(form.querySelector('button').disabled,true);assert.equal(calls.filter(x=>x.method==='PUT').length,0);
    assert.match(form.textContent,/1,125001/);assert.match(form.textContent,/3,475001/);
    await act(async()=>form.querySelector('input[type=checkbox]').click());assert.equal(form.querySelector('button').disabled,false);
    await act(async()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()});
    const writes=calls.filter(x=>x.method==='PUT');assert.equal(writes.length,1);assert.ok(writes[0].path.endsWith('/b/pricing'));
    assert.deepEqual(JSON.parse(writes[0].body),{version:7,policy:{additionalMarkupBps:1250,callFeeMicros:'1',invoiceFeeMicros:'2350000'},additionalTariffConfirmed:true});
    assert.match(document.body.textContent,/Οι τιμές AI αποθηκεύτηκαν/);assert.match(document.body.textContent,/μία φορά/);assert.match(document.body.textContent,/50%/);
    form=document.querySelector('[aria-label="Τιμολόγηση AI πελάτη"]');assert.equal(form.querySelector('input[type=checkbox]').checked,false);
    await set(form.querySelector('input'),'-1');assert.equal(form.querySelector('button').disabled,true);assert.equal(calls.filter(x=>x.method==='PUT').length,1);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of prior)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});
