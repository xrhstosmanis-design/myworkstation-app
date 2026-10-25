import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted dispatch controls separate mailbox verification, consent and grants and discard old-store responses',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AutomaticReportDispatchManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];
 const recipient={recipientId:'r',email:'recipient@example.test',version:1,verifiedAt:null,revokedAt:null};
 let consent=null,grant=null,lateLoad,holdLoad=false;
 const snapshot=path=>({schemaReady:true,activation:{enabled:false,notBefore:'2026-10-23T05:00:00.000Z'},policy:null,grant,recipients:path.includes('/stores/B/')?[]:[{recipient:{...recipient},consent}]});
 const request=async(path,options={})=>{
  calls.push({path,...options});
  if(!options.method){const result=snapshot(path);if(holdLoad&&path.includes('/stores/A/'))return new Promise(resolve=>{lateLoad=()=>resolve(result)});return result}
  const body=JSON.parse(options.body);
  if(path.endsWith('/verification/confirm'))recipient.verifiedAt='2026-10-22T12:00:00.000Z';
  if(path.endsWith('/consent/confirm'))consent={active:true,revision:1,allowedFrequencies:['DAILY']};
  if(path.endsWith('/grant'))grant={active:true,revision:1,notBefore:'2026-10-23T05:00:00.000Z'};
  if(path.endsWith('/consent')&&options.method==='PUT')consent={active:false,revision:2};
  return {ok:true};
 };
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{key:store,company:{id:'c'},store:{id:store,name:store},request})));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const input=async(label,value)=>act(async()=>{const el=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 try{
  await render('A');assert.match(document.body.textContent,/Μη επιβεβαιωμένο email/);assert.equal(button('Αίτημα συγκατάθεσης παραλήπτη').disabled,true);
  assert.equal(calls.filter(c=>c.method).length,0,'loading never sends mail or enables anything');
  await act(async()=>button('Αποστολή κωδικού email').click());
  assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/verification')).body),{expectedVersion:1});assert.equal(consent,null);
  await input('Κωδικός email recipient@example.test','a'.repeat(32));await act(async()=>button('Επιβεβαίωση email').click());
  assert.match(document.body.textContent,/Επιβεβαιωμένο email/);assert.equal(consent,null,'verification alone is not consent');
  assert.equal(document.querySelector('[aria-label="Κωδικός email recipient@example.test"]').value,'','token removed after mutation');
  await act(async()=>button('Αίτημα συγκατάθεσης παραλήπτη').click());
  assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/consent/request')).body),{expectedVersion:1,allowedFrequencies:['DAILY']});
  await input('Κωδικός συγκατάθεσης recipient@example.test','b'.repeat(32));assert.equal(button('Καταγραφή συγκατάθεσης με κωδικό').disabled,true);
  const ack=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('Εξουσιοδοτώ')).querySelector('input');
  await act(async()=>ack.click());await act(async()=>button('Καταγραφή συγκατάθεσης με κωδικό').click());
  assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/consent/confirm')).body),{expectedVersion:1,expectedRevision:0,token:'b'.repeat(32),explicitConsent:true});
  assert.match(document.body.textContent,/Ενεργή συγκατάθεση/);assert.equal(grant,null,'consent does not grant automation authority');
  await act(async()=>button('Αποθήκευση εξουσιοδότησης').click());
  assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/grant')).body),{expectedRevision:0,active:true,allowedFrequencies:['DAILY'],explicitAuthorization:true});
  assert.match(document.body.textContent,/Η αυτόματη αποστολή είναι κλειστή/,'external OFF is not described as ON');
  await act(async()=>button('Ανάκληση συγκατάθεσης').click());assert.match(document.body.textContent,/Χωρίς ενεργή συγκατάθεση/);
  holdLoad=true;await act(async()=>button('Ανανέωση κατάστασης αποστολών').click());assert.ok(lateLoad);
  await render('B');assert.doesNotMatch(document.body.textContent,/recipient@example.test/);
  await act(async()=>lateLoad());assert.doesNotMatch(document.body.textContent,/recipient@example.test/,'old A load cannot populate B');
  assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});

test('mounted email/save sends one invitation action, reuses confirmed state and discards late old-store success',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AutomaticReportDispatchManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];let pending,hold=false,confirmed=false;
 const request=async(path,options={})=>{calls.push({path,...options});if(!options.method)return {schemaReady:true,activation:{enabled:false},policy:null,grant:null,recipients:confirmed?[{recipient:{recipientId:'r',email:'recipient@example.invalid',version:1,verifiedAt:'2026-10-25T10:00:00Z'},consent:{active:true,allowedFrequencies:['DAILY']}}]:[]};if(hold)return new Promise(resolve=>{pending=resolve});return confirmed?{saved:true,alreadyConfirmed:true}:{saved:true,invitationIssued:true}};
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{key:store,company:{id:'c'},store:{id:store,name:store},request})));
 const input=async value=>act(async()=>{const el=document.querySelector('[aria-label="Νέο email αυτόματων αναφορών"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 const save=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Αποθήκευση email');
 try{
  await render('A');await input('recipient@example.invalid');await act(async()=>save().click());let writes=calls.filter(c=>c.method);assert.equal(writes.length,1);assert.match(writes[0].path,/\/invitations$/);assert.deepEqual(JSON.parse(writes[0].body),{email:'recipient@example.invalid',expectedVersion:0,allowedFrequencies:['DAILY']});assert.match(document.body.textContent,/Η πρόσκληση στάλθηκε/);
  confirmed=true;await render('B');await input('recipient@example.invalid');await act(async()=>save().click());writes=calls.filter(c=>c.method);assert.equal(writes.length,2);assert.deepEqual(JSON.parse(writes[1].body),{email:'recipient@example.invalid',expectedVersion:1,recipientId:'r',allowedFrequencies:['DAILY']});assert.match(document.body.textContent,/Δεν στάλθηκε νέα πρόσκληση/);
  hold=true;await act(async()=>save().click());assert.ok(pending);await render('C');await act(async()=>pending({invitationIssued:true}));assert.doesNotMatch(document.querySelector('[role="status"]')?.textContent||'',/Η πρόσκληση στάλθηκε/);assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
