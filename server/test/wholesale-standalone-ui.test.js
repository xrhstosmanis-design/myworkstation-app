import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {authenticateWholesaleSeller} from '../src/lib/wholesale-seller-auth.js';
import {parseWholesaleStore,createWholesaleApi} from '../../client/src/components/wholesale/wholesale-api.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const paid=companyId=>({companyId,moduleKey:'WHOLESALE_B2B',enabled:true,expiresAt:null});
const child="import React,{useEffect,useRef,useState} from 'react';export default function Child({api,onSubmissionLockChange,suspended,activeStoreId}){const body=useRef(null),[status,setStatus]=useState('idle');const send=async()=>{body.current ||= JSON.stringify({clientOrderId:'frozen-key',storeId:'store-a',notes:'original'});onSubmissionLockChange(true);try{await api('/api/wholesale/orders',{method:'POST',body:body.current});setStatus('accepted');onSubmissionLockChange(false)}catch{setStatus('uncertain')}};window.__frozen={body,send};useEffect(()=>{window.__mounts++;return()=>window.__unmounts++},[]);return <section data-child data-kind='KIND' data-store={activeStoreId}><p>{suspended?'suspended':status}</p><button onClick={send}>Send original</button></section>}";
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/wholesale/WholesaleApp.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],plugins:[{name:'actual-suite-test-leaves',setup(builder){builder.onLoad({filter:/\/(WholesaleB2BPanel|SellerWorkspace)\.jsx$/},args=>({loader:'jsx',contents:child.replace('KIND',args.path.includes('SellerWorkspace')?'seller':'manager')}))}}]});
const component={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
// Keep the actual standalone app, suite, shared session boundary and seller
// workspace together. Only the unrelated management panel is isolated here.
const sellerCompiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/wholesale/WholesaleApp.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],plugins:[{name:'isolate-manager-only',setup(builder){builder.onLoad({filter:/\/WholesaleB2BPanel\.jsx$/},()=>({loader:'jsx',contents:child.replace('KIND','manager')}))}}]});
const sellerComponent={exports:{}};new Function('require','module','exports',sellerCompiled.outputFiles[0].text)(createRequire(import.meta.url),sellerComponent,sellerComponent.exports);
function credentials(id='owner-a',companyId='company-a',role='OWNER',extra={}){const claims={id,companyId,role,tokenType:'BACKOFFICE_USER',sessionId:'session-'+id,sessionVersion:0,exp:Math.floor(Date.now()/1000)+3600,...extra};return {token:'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature',user:{id,fullName:'User '+id,email:id+'@example.invalid',role,company:{id:companyId,name:'Company '+companyId}}}}
async function mounted(run,{initial=credentials(),search='',handler,realSeller=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/wholesale'+search}),keys=['window','document','navigator','HTMLElement','Node','Event','FormData','localStorage','sessionStorage','IS_REACT_ACT_ENVIRONMENT','setInterval','clearInterval','setTimeout','clearTimeout'];const old=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),polls=new Map(),timers=new Map(),nativeTimeout=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,originalNow=Date.now;let clock=originalNow(),timerId=10000;Date.now=()=>clock;
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='setInterval'?(fn,ms)=>{polls.set(ms,fn);return ms}:key==='clearInterval'?ms=>polls.delete(ms):key==='setTimeout'?(fn,ms,...args)=>{if(ms>=1000){const id=++timerId;timers.set(id,fn);return id}return nativeTimeout(fn,ms,...args)}:key==='clearTimeout'?id=>{if(timers.has(id))timers.delete(id);else nativeClear(id)}:dom.window[key]});
 const save=value=>{localStorage.setItem('token',value.token);localStorage.setItem('user',JSON.stringify(value.user))};if(initial)save(initial);dom.window.__mounts=0;dom.window.__unmounts=0;
 const calls=[];let capabilities=null,order=async()=>({ok:true}),loginResult=credentials();
 const api=async(path,options={})=>{calls.push({path,options});if(handler){const result=handler(path,options);if(result!==undefined)return await result}if(path==='/api/auth/login')return typeof loginResult==='function'?await loginResult():loginResult;if(path==='/api/auth/logout')return {ok:true};const data=JSON.parse(localStorage.getItem('user')||'null'),id=data?.id,companyId=data?.company.id;
  if(path==='/api/wholesale/capabilities')return capabilities instanceof Error?Promise.reject(capabilities):capabilities||paid(companyId);
  if(path.startsWith('/api/wholesale/workspace?')){const storeId=new URL(path,'https://isolated.invalid').searchParams.get('storeId');return {user:{id,role:data.role,fullName:data.fullName},company:{id:companyId,name:'Verified company'},access:paid(companyId),stores:storeId?[{id:storeId,name:storeId}]:[{id:'store-a',name:'A'},{id:'store-b',name:'B'}],storeId:storeId||''}}
  if(path==='/api/wholesale/sellers/context')return {user:{id,fullName:data.fullName},companyId,actorId:'seller:'+id,stores:[{id:'store-a',name:'A'}],expiresAt:new Date(Date.now()+3600000).toISOString()};if(path==='/api/wholesale/orders')return await order(options);throw Error('Unexpected '+path)
 };
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));let props={request:api,search};const render=()=>act(async()=>root.render(React.createElement((realSeller?sellerComponent:component).exports.default,props)));
 const click=text=>act(async()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent===text);assert.ok(button,text);button.click()});const choose=value=>act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα χονδρικής"]');assert.ok(select);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});const input=(name,value)=>act(async()=>{const element=document.querySelector('input[type="'+name+'"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 try{await render();await run({dom,act,calls,click,choose,input,submit,save,setCaps:value=>{capabilities=value},setOrder:value=>{order=value},setLogin:value=>{loginResult=value},settle:fn=>act(async()=>fn()),focus:()=>act(async()=>window.dispatchEvent(new dom.window.Event('focus'))),poll:()=>act(async()=>polls.get(700)?.()),advance:async ms=>{clock+=ms;const callbacks=[...timers.values()];timers.clear();await act(async()=>{for(const fn of callbacks)fn()})},rerender:async value=>{props={...props,...value};await render()}})}finally{await act(async()=>root.unmount());dom.window.close();Date.now=originalNow;for(const key of keys){const desc=old.get(key);if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key]}}
}

test('blank standalone login has no defaults/private calls; incomplete/MFA/must-change cannot replace stored context',async()=>{
 await mounted(async ctx=>{assert.equal(document.querySelector('input[type=email]').value,'');assert.equal(document.querySelector('input[type=password]').value,'');assert.equal(ctx.calls.length,0);await ctx.input('email','owner@example.invalid');await ctx.input('password','private password');ctx.setLogin({mfaRequired:true});await ctx.submit();assert.equal(localStorage.getItem('token'),null);assert.equal(document.querySelector('a').href,'https://myworkstation-app.onrender.com/platform-admin');assert.equal(document.querySelector('input[type=password]').value,'');ctx.setLogin({...credentials(),user:{...credentials().user,mustChangePassword:true}});await ctx.input('password','private password');await ctx.submit();assert.equal(localStorage.getItem('token'),null);ctx.setLogin({token:'incomplete',user:{id:'owner-a'}});await ctx.input('password','private password');await ctx.submit();assert.equal(localStorage.getItem('token'),null)},{initial:null});
});

test('personal support context requests login before any private reads and clears support only after acknowledged valid login',async()=>{
 await mounted(async ctx=>{localStorage.setItem('supportContext',JSON.stringify({companyId:'supported'}));sessionStorage.setItem('platformToken','retained-platform');await ctx.poll();assert.ok(document.querySelector('form'));const count=ctx.calls.length;await ctx.input('email','owner@example.invalid');await ctx.input('password','private');ctx.setLogin({setupRequired:true});await ctx.submit();assert.equal(localStorage.getItem('supportContext'),JSON.stringify({companyId:'supported'}));assert.equal(sessionStorage.getItem('platformToken'),'retained-platform');ctx.setLogin(credentials());await ctx.input('password','private');await ctx.submit();assert.equal(localStorage.getItem('supportContext'),null);assert.equal(sessionStorage.getItem('platformToken'),null);assert.ok(ctx.calls.length>count)},{initial:null});
});

test('manager explicit chooser verifies selected bootstrap before actual suite mounts and rejects malformed URL scope',async()=>{
 await mounted(async ctx=>{assert.equal(ctx.calls[0].path,'/api/wholesale/capabilities');assert.ok(ctx.calls.some(call=>call.path==='/api/wholesale/workspace?scope=company'));assert.equal(document.querySelector('[data-child]'),null);assert.equal(document.querySelector('select').value,'');const initialReads=ctx.calls.length;await ctx.poll();assert.equal(ctx.calls.length,initialReads);await ctx.choose('store-a');assert.ok(ctx.calls.some(call=>call.path==='/api/wholesale/workspace?storeId=store-a'));assert.equal(document.querySelector('[data-child]').dataset.kind,'manager');assert.match(document.body.textContent,/Verified company/);await ctx.choose('store-b');assert.equal(window.__mounts,2)});
 for(const search of ['?storeId=','?storeId=store-a&storeId=store-b','?storeId=%20store-a'])await mounted(async ctx=>{assert.equal(document.querySelector('[data-child]'),null);assert.equal(ctx.calls.length,0);assert.match(document.querySelector('[role=alert]').textContent,/μοναδικό κατάστημα/)},{search});
});

test('employee bootstrap uses seller context and no manager workspace/customer endpoints',async()=>{
 await mounted(async ctx=>{assert.equal(ctx.calls.some(call=>call.path.includes('/workspace')),false);assert.ok(ctx.calls.some(call=>call.path==='/api/wholesale/sellers/context'));await ctx.choose('store-a');assert.equal(document.querySelector('[data-child]').dataset.kind,'seller');assert.equal(ctx.calls.some(call=>/\/api\/wholesale\/(workspace|customers|portal|price-lists)/.test(call.path)),false)},{initial:credentials('seller-a','company-a','EMPLOYEE')});
});

test('actual nonmember seller denial preserves selected store and manager return, while genuine401 clears the private workspace',async()=>{
 let live=true;
 const db={async $queryRaw(query){const sql=query.sql||query.join('?');
  if(sql.includes('clock_timestamp() AS "now"'))return [{now:new Date()}];
  if(sql.includes('FROM "UserSession"'))return !live||sql.includes('JOIN "WholesaleSellerMembership"')?[]:[{role:'OWNER',userCompanyId:'company-a',expiresAt:new Date(Date.now()+3600000)}];
  throw Error('Unexpected auth query '+sql);
 }};
 const actor={id:'owner-a',companyId:'company-a',sessionId:'session-owner-a',sessionVersion:0,role:'OWNER',tokenType:'BACKOFFICE_USER'};
 await mounted(async ctx=>{
  await ctx.choose('store-a');const token=localStorage.getItem('token');
  const centralReads=()=>ctx.calls.filter(call=>call.path==='/api/wholesale/workspace?scope=company').length;
  const before=centralReads();
  for(let i=0;i<2;i++){
   await ctx.click('Εργασία πωλητή');
   assert.equal(document.querySelector('[aria-label="Κατάστημα χονδρικής"]').value,'store-a');
   assert.match(document.querySelector('[role=alert]').textContent,/ενεργή ιδιότητα πωλητή/);
   assert.equal(document.querySelector('[aria-label="Κατάστημα πωλητή"]'),null);
   assert.equal(localStorage.getItem('token'),token);
   await ctx.click('Χονδρική, site & αναθέσεις');
   assert.equal(document.querySelector('[data-child]').dataset.store,'store-a');
  }
  assert.equal(centralReads(),before,'authorization denial must not rebootstrap company scope');
  assert.equal(ctx.calls.some(call=>call.options.method==='POST'),false);
  live=false;await ctx.click('Εργασία πωλητή');
  assert.equal(document.querySelector('[data-child]'),null);
  assert.equal(document.querySelector('[aria-label="Ενότητες χονδρικής"]'),null,'genuine401 must still invalidate the private suite');
 },{realSeller:true,handler:path=>path==='/api/wholesale/sellers/context'?authenticateWholesaleSeller(db,actor):undefined});
});

test('late login acknowledgement after another tab changed session cannot replace that context',async()=>{
 const result=deferred();await mounted(async ctx=>{ctx.setLogin(()=>result.promise);await ctx.input('email','owner@example.invalid');await ctx.input('password','private');await ctx.submit();const other=credentials('other','company-b');ctx.save(other);await ctx.settle(()=>result.resolve(credentials()));assert.equal(localStorage.getItem('token'),other.token);assert.equal(JSON.parse(localStorage.getItem('user')).id,'other')},{initial:null});
});

test('frozen actual suite remains mounted through grant loss and wrong identity; same principal reauth retries original body',async()=>{
 await mounted(async ctx=>{await ctx.choose('store-a');ctx.setOrder(async()=>{throw Object.assign(Error('lost'),{status:503})});await ctx.click('Send original');const node=document.querySelector('[data-child]'),body=window.__frozen.body.current;ctx.setCaps({...paid('company-a'),enabled:false});await ctx.focus();assert.equal(document.querySelector('[data-child]'),node);assert.ok(node.closest('[hidden]'));assert.equal(window.__unmounts,0);await ctx.settle(()=>window.__frozen.send());assert.equal(ctx.calls.filter(call=>call.path==='/api/wholesale/orders').length,1);ctx.setCaps(paid('company-a'));ctx.setLogin(credentials('other','company-b'));await ctx.input('email','other@example.invalid');await ctx.input('password','private');await ctx.submit();assert.equal(JSON.parse(localStorage.getItem('user')).id,'owner-a');ctx.setLogin(credentials());await ctx.input('password','private');await ctx.submit();assert.equal(document.querySelector('[data-child]'),node);ctx.setOrder(async()=>({ok:true}));await ctx.click('Send original');const writes=ctx.calls.filter(call=>call.path==='/api/wholesale/orders');assert.equal(writes.length,2);assert.equal(writes[1].options.body,body);assert.equal(window.__mounts,1)});
});

test('late scoped A success cannot replace mounted B or trigger more bootstrap reads',async()=>{
 const slow=deferred();let reads=0;await mounted(async ctx=>{
  await ctx.choose('store-a');assert.equal(document.querySelector('[data-child]'),null);assert.equal(window.__mounts,0);
  await ctx.choose('store-b');const current=document.querySelector('[data-child]'),count=ctx.calls.length;
  assert.equal(current.dataset.store,'store-b');assert.equal(window.__mounts,1);assert.equal(window.__unmounts,0);
  await ctx.settle(()=>slow.resolve({user:{id:'owner-a',role:'OWNER'},company:{id:'company-a',name:'Stale A company'},access:paid('company-a'),stores:[{id:'store-a',name:'Stale A store'}],storeId:'store-a'}));
  assert.equal(document.querySelector('select').value,'store-b');assert.equal(document.querySelector('[data-child]'),current);assert.equal(current.dataset.store,'store-b');
  assert.doesNotMatch(document.body.textContent,/Stale A/);assert.equal(ctx.calls.length,count);assert.equal(window.__mounts,1);assert.equal(window.__unmounts,0);
 },{handler:path=>{if(path==='/api/wholesale/workspace?storeId=store-a'&&++reads===1)return slow.promise}});
});

test('late first A rejection cannot invalidate the current A after A-B-A selection',async()=>{
 const slow=deferred();let reads=0;await mounted(async ctx=>{
  await ctx.choose('store-a');assert.equal(document.querySelector('[data-child]'),null);assert.equal(window.__mounts,0);
  await ctx.choose('store-b');const previous=document.querySelector('[data-child]');assert.equal(previous.dataset.store,'store-b');
  await ctx.choose('store-a');const current=document.querySelector('[data-child]'),count=ctx.calls.length;
  assert.notEqual(current,previous);assert.equal(current.dataset.store,'store-a');assert.equal(previous.isConnected,false);assert.equal(window.__mounts,2);assert.equal(window.__unmounts,1);
  await ctx.settle(()=>slow.reject(Object.assign(Error('Stale first A rejection'),{status:403})));
  assert.equal(document.querySelector('[data-child]'),current);assert.equal(current.closest('[hidden]'),null);assert.equal(document.querySelector('select').value,'store-a');
  assert.doesNotMatch(document.body.textContent,/Stale first A rejection/);assert.equal(ctx.calls.length,count);assert.equal(window.__mounts,2);assert.equal(window.__unmounts,1);
 },{handler:path=>{if(path==='/api/wholesale/workspace?storeId=store-a'&&++reads===1)return slow.promise}});
});

test('standalone lifecycle transport pins selected read origin and preserves it on subsequent writes',async()=>{
 const dom=new JSDOM('',{url:'https://isolated.invalid'}),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:dom.window.localStorage});localStorage.setItem('token','test-token');const calls=[];
 try{const api=createWholesaleApi({origin:'https://isolated.invalid',fetchImpl:async(path,options)=>{calls.push({path,options});return {ok:true,status:200,json:async()=>String(path).includes('/lifecycle/')?{storeId:'origin-test-store',generation:'7'}:{ok:true}}}});await api('/api/wholesale/workspace?storeId=origin-test-store');await api('/api/wholesale/orders',{method:'POST',body:JSON.stringify({storeId:'origin-test-store'})});assert.equal(calls.filter(call=>String(call.path).includes('/lifecycle/')).length,1);assert.equal(JSON.parse(new Headers(calls.at(-1).options.headers).get('x-mws-store-generations'))['origin-test-store'],'7')}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;dom.window.close()}
});

test('manual recheck restores paid access without relogin and expiry retains the frozen original child',async()=>{
 await mounted(async ctx=>{await ctx.choose('store-a');ctx.setOrder(async()=>{throw Error('lost acknowledgement')});await ctx.click('Send original');const node=document.querySelector('[data-child]'),original=window.__frozen.body.current;ctx.setCaps(paid('company-a'));ctx.setCaps({...paid('company-a'),expiresAt:new Date(Date.now()+1000).toISOString()});await ctx.focus();await ctx.advance(1001);assert.ok(node.closest('[hidden]'));assert.equal(window.__unmounts,0);assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent==='Επανέλεγχος πρόσβασης'));ctx.setCaps(paid('company-a'));await ctx.click('Επανέλεγχος πρόσβασης');assert.equal(node.closest('[hidden]'),null);assert.equal(window.__mounts,1);assert.equal(ctx.calls.filter(call=>call.path==='/api/auth/login').length,0);ctx.setOrder(async()=>({ok:true}));await ctx.click('Send original');assert.equal(ctx.calls.filter(call=>call.path==='/api/wholesale/orders')[1].options.body,original)});
});

test('idle session/company switch removes old suite while frozen switch cannot send or replace original child',async()=>{
 await mounted(async ctx=>{await ctx.choose('store-a');const old=document.querySelector('[data-child]');ctx.save(credentials('other','company-b'));await ctx.poll();assert.equal(old.isConnected,false);assert.equal(document.querySelector('[data-child]'),null);assert.equal(document.querySelector('select').value,'');await ctx.choose('store-a');assert.equal(window.__mounts,2)});
 await mounted(async ctx=>{await ctx.choose('store-a');ctx.setOrder(async()=>{throw Error('lost')});await ctx.click('Send original');const node=document.querySelector('[data-child]');ctx.save(credentials('other','company-b'));await ctx.poll();assert.equal(document.querySelector('[data-child]'),node);assert.ok(node.closest('[hidden]'));await ctx.settle(()=>window.__frozen.send());assert.equal(ctx.calls.filter(call=>call.path==='/api/wholesale/orders').length,1);ctx.save(credentials());await ctx.poll();ctx.setOrder(async()=>({ok:true}));await ctx.click('Send original');assert.equal(window.__mounts,1)});
});

test('unknown valid-looking URL store fails without central fallback or suite mount',async()=>{
 await mounted(async ctx=>{assert.equal(document.querySelector('[data-child]'),null);assert.ok(ctx.calls.some(call=>call.path==='/api/wholesale/workspace?storeId=foreign'));assert.equal(ctx.calls.some(call=>call.path==='/api/wholesale/workspace?scope=company'),false);assert.match(document.body.textContent,/δεν είναι διαθέσιμο/)},{search:'?storeId=foreign',handler:path=>path==='/api/wholesale/workspace?storeId=foreign'?Promise.reject(Object.assign(Error('Το κατάστημα δεν είναι διαθέσιμο.'),{status:404})):undefined});
});
