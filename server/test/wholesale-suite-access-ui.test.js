import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const paid=(companyId='company-a',expiresAt=null)=>({moduleKey:'WHOLESALE_B2B',companyId,enabled:true,expiresAt});
const childSource="import React,{useEffect,useRef,useState} from 'react';export default function Child({api,onSubmissionLockChange}){const body=useRef(null),[state,setState]=useState('idle');const send=async()=>{body.current ||= JSON.stringify({clientOrderId:'12345678-1234-4234-9234-123456789abc',notes:'original frozen request'});onSubmissionLockChange(true);try{await api('/api/wholesale/orders',{method:'POST',body:body.current});setState('acknowledged');onSubmissionLockChange(false)}catch{setState('uncertain')}};window.__suiteChild={send,body};useEffect(()=>{window.__suiteMounts++;return()=>window.__suiteUnmounts++},[]);return <section data-suite-child data-kind='__KIND__'><p>{state}</p><button onClick={send}>Send frozen fixture</button></section>}";
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/CommerceLauncher.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'isolate-suite-children',setup(builder){
  builder.onLoad({filter:/\.jsx$/},async args=>{
    if(args.path.endsWith('/CommerceLauncher.jsx')||args.path.endsWith('/WholesaleSuiteWorkspace.jsx'))return;
    if(args.path.endsWith('/WholesaleB2BPanel.jsx')||args.path.endsWith('/SellerWorkspace.jsx'))return {loader:'jsx',contents:childSource.replace('__KIND__',args.path.endsWith('/SellerWorkspace.jsx')?'seller':'management')};
    return {loader:'jsx',contents:"import React from 'react';export default function Other(){return <div data-other-workspace/>}"};
  });
}}]});
const component={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);

async function mounted(run,{role='OWNER',initialCaps=paid()}={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/platform-admin'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','MutationObserver','localStorage','IS_REACT_ACT_ENVIRONMENT','fetch','setInterval','clearInterval','setTimeout','clearTimeout'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),oldNow=Date.now,nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
  const calls=[],polls=new Map(),timers=new Map();let clock=oldNow(),timerId=10000,caps=initialCaps,order=async()=>({orderId:'accepted'});
  Date.now=()=>clock;
  for(const key of keys){let value=dom.window[key];
    if(key==='IS_REACT_ACT_ENVIRONMENT')value=true;
    if(key==='setInterval')value=(callback,ms)=>{polls.set(ms,callback);return ms};
    if(key==='clearInterval')value=id=>polls.delete(id);
    if(key==='setTimeout')value=(callback,ms,...args)=>{if(ms>=1000){const id=++timerId;timers.set(id,{callback,ms});return id}return nativeTimeout(callback,ms,...args)};
    if(key==='clearTimeout')value=id=>{if(timers.has(id))timers.delete(id);else nativeClear(id)};
    if(key==='fetch')value=async(path,options={})=>{calls.push({path,options});
      if(path==='/api/wholesale/capabilities'){const result=typeof caps==='function'?await caps():caps;if(result instanceof Error)throw result;return {ok:true,status:200,json:async()=>result}}
      if(path==='/api/wholesale/orders'){const result=await order(options);return {ok:result.status==null||result.status<400,status:result.status||201,json:async()=>result}}
      return {ok:true,status:200,json:async()=>path==='/api/stores'?[{id:'store-a',name:'Store A'}]:{activeModules:['CORE','WHOLESALE_B2B'],superAdminBypass:true}};
    };
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const identity=(userId='owner-a',companyId='company-a',nextRole=role)=>{localStorage.setItem('token','isolated-token-'+userId);localStorage.setItem('user',JSON.stringify({id:userId,companyId,role:nextRole}))};identity();dom.window.__suiteMounts=0;dom.window.__suiteUnmounts=0;
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
  const click=text=>act(async()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent===text);assert.ok(button,'button '+text);button.click()});
  const focus=()=>act(async()=>window.dispatchEvent(new dom.window.Event('focus'))),poll=()=>act(async()=>polls.get(700)?.());
  try{
    await act(async()=>root.render(React.createElement(component.exports.default)));await act(async()=>window.dispatchEvent(new dom.window.CustomEvent('mws:commerce-open',{detail:{view:'operations',storeId:'store-a'}})));
    await run({dom,act,calls,click,focus,poll,identity,setCaps:value=>{caps=value},setOrder:handler=>{order=handler},advance:async ms=>{clock+=ms;const pending=[...timers.values()];timers.clear();await act(async()=>{for(const timer of pending)timer.callback()})}});
  }finally{await act(async()=>root.unmount());dom.window.close();Date.now=oldNow;for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}
const entries=()=>[...document.querySelectorAll('button')].filter(button=>button.textContent==='Χονδρική B2B');
const posts=calls=>calls.filter(call=>call.path==='/api/wholesale/orders');

test('one paid entry fails closed despite activeModules/Super Admin hints, invalid capabilities and failed refresh',async()=>{
  await mounted(async({setCaps,focus,click})=>{
    assert.equal(entries().length,0);
    for(const caps of [paid('foreign-company'),paid('company-a',new Date(Date.now()-1).toISOString()),{...paid(),moduleKey:'CORE'},new Error('Unavailable')]){setCaps(caps);await focus();assert.equal(entries().length,0)}
    setCaps(paid());await focus();assert.equal(entries().length,1);assert.equal(document.body.textContent.includes('Εξωτερικοί πωλητές'),false);assert.equal(document.body.textContent.includes('Χονδρική / B2B'),false);
    await click('Χονδρική B2B');assert.equal(document.querySelector('[data-suite-child]').dataset.kind,'management');
    setCaps({...paid(),enabled:false});await focus();assert.equal(entries().length,0);assert.equal(document.querySelector('[data-suite-child]'),null,'idle workspace may close after entitlement loss');
  },{role:'SUPER_ADMIN',initialCaps:{...paid(),enabled:false}});
});

test('paid employee enters only the seller workspace without mounting manager customer/site APIs',async()=>{
  await mounted(async({click,calls})=>{
    assert.equal(entries().length,1);await click('Χονδρική B2B');assert.equal(document.querySelector('[data-suite-child]').dataset.kind,'seller');assert.equal(document.querySelector('[aria-label="Ενότητες χονδρικής"]'),null);assert.equal(window.__suiteMounts,1);
    assert.ok(!calls.some(call=>/\/api\/wholesale\/(customers|portal|price-lists)/.test(call.path)));
  },{role:'EMPLOYEE'});
});

test('expiry retains the frozen child and blocks requests until same-principal paid access is restored manually',async()=>{
  await mounted(async({click,calls,setCaps,setOrder,advance,focus,act})=>{
    setCaps(paid('company-a',new Date(Date.now()+1000).toISOString()));await focus();await click('Χονδρική B2B');
    setOrder(async()=>{throw Error('Acknowledgement lost')});await click('Send frozen fixture');const child=document.querySelector('[data-suite-child]'),body=window.__suiteChild.body.current;assert.equal(posts(calls).length,1);
    await advance(1001);assert.equal(entries().length,0);assert.equal(document.querySelector('[data-suite-child]'),child);assert.ok(child.closest('[hidden]'));assert.equal(window.__suiteUnmounts,0);assert.equal(document.querySelector('[title="Κλείσιμο"]').disabled,true);
    await act(async()=>window.__suiteChild.send());assert.equal(posts(calls).length,1,'forced hidden retry must be blocked before fetch');assert.equal(window.__suiteChild.body.current,body);
    setCaps(paid());setOrder(async()=>({orderId:'original'}));await focus();assert.equal(posts(calls).length,1,'restoring entitlement must not auto-submit');assert.equal(document.querySelector('[data-suite-child]'),child);assert.equal(child.closest('[hidden]'),null);
    await click('Send frozen fixture');assert.equal(posts(calls).length,2);assert.equal(posts(calls)[1].options.body,body);assert.equal(window.__suiteMounts,1);assert.equal(document.querySelector('[title="Κλείσιμο"]').disabled,false);
  });
});

test('wrong account/company cannot retry the retained request even with its own paid entitlement',async()=>{
  await mounted(async({click,calls,setCaps,setOrder,identity,poll,focus,act})=>{
    await click('Χονδρική B2B');setOrder(async()=>{throw Error('Uncertain')});await click('Send frozen fixture');const child=document.querySelector('[data-suite-child]'),body=window.__suiteChild.body.current;
    identity('other-user','company-b');setCaps(paid('company-b'));await poll();await focus();assert.equal(document.querySelector('[data-suite-child]'),child);assert.ok(child.closest('[hidden]'));
    await act(async()=>window.__suiteChild.send());assert.equal(posts(calls).length,1);assert.equal(window.__suiteChild.body.current,body);
    identity();setCaps(paid());await poll();setOrder(async()=>({orderId:'original'}));await focus();assert.equal(posts(calls).length,1);await click('Send frozen fixture');assert.equal(posts(calls)[1].options.body,body);assert.equal(window.__suiteMounts,1);
  });
});

test('late capabilities from a previous company cannot replace the current company decision',async()=>{
  await mounted(async({setCaps,focus,identity,poll,act})=>{
    const late=deferred();let old=true;setCaps(()=>old?late.promise:paid('company-b'));await focus();
    identity('other-user','company-b');old=false;await poll();assert.equal(entries().length,1);
    await act(async()=>late.resolve(paid('company-a')));assert.equal(entries().length,1);
    assert.equal(document.querySelector('[data-suite-child]'),null);
  });
});

test('a response arriving after module revocation cannot unlock a potentially committed request',async()=>{
  await mounted(async({click,calls,setCaps,setOrder,focus,act})=>{
    await click('Χονδρική B2B');const response=deferred();setOrder(()=>response.promise);await click('Send frozen fixture');const child=document.querySelector('[data-suite-child]'),body=window.__suiteChild.body.current;
    setCaps({...paid(),enabled:false});await focus();await act(async()=>response.resolve({orderId:'already-committed'}));assert.match(child.textContent,/uncertain/);assert.equal(document.querySelector('[title="Κλείσιμο"]').disabled,true);
    setCaps(paid());setOrder(async()=>({orderId:'already-committed'}));await focus();assert.equal(posts(calls).length,1);await click('Send frozen fixture');assert.equal(posts(calls)[1].options.body,body);assert.equal(document.querySelector('[data-suite-child]'),child);
  });
});
