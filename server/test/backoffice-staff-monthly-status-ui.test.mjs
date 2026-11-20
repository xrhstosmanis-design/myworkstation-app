import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function component(name){
 const r=await build({entryPoints:[new URL(`../../client/src/components/${name}.jsx`,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const mod={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.default;
}
async function mount(Component,props){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','FormData','alert','confirm','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,props)));
 return {dom,act:React.act,async render(next){await React.act(async()=>root.render(React.createElement(Component,next)))},async close(){await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const enrolled={active:true,firstIssueMonth:'2026-11',firstScheduledFor:'2026-12-01T05:00:00.000Z',grantedAt:'2026-11-18T09:00:00.000Z',revokedAt:null};
const response=(storeId='a1',grant=enrolled)=>({companyId:'a',storeId,readOnly:true,status:'STATE',grant});
const nativeProps=api=>({api,companyId:'a',storeId:'a1',storeName:'A1',readOnly:true});

test('monthly inventory status is an independently granted native view without personal management or capture requests',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const api=async(path,options={})=>{calls.push(path);assert.equal(options.method||'GET','GET');if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:['monthly-inventory.read']},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};assert.equal(path,'/api/monthly-inventory-capture/status?storeId=a1');assert.equal(options.headers['x-backoffice-store-id'],'a1');return response()};
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
 try{
  await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Μηνιαία παρατήρηση αποθήκης').click());await m.act(async()=>new Promise(r=>setTimeout(r,70)));
  assert.match(document.body.textContent,/Ενεργή καταχωρισμένη εξουσιοδότηση/);assert.ok(!document.body.textContent.includes('Απαιτείται προσωπική σύνδεση Owner'));
  for(const text of ['Δημιουργία ανενεργής','Ενεργοποίηση εξουσιοδότησης','Ανάκληση εξουσιοδότησης','Αποθήκευση λήψης τώρα','Ανανέωση προεπισκόπησης λήψης'])assert.ok(!button(text));
  assert.equal(document.querySelector('input[type="checkbox"]'),null);assert.ok(!calls.some(path=>/capture-now|enable|revoke|create-inactive/.test(path)));
  await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(!document.body.textContent.includes('Ενεργή καταχωρισμένη'));assert.ok(!button('Μηνιαία παρατήρηση αποθήκης'));
 }finally{await m.close()}
});

test('monthly status distinguishes no stored enrollment, inactive and revoked state from unverified errors',async()=>{
 const Panel=await component('commerce/MonthlyInventoryCapturePanel');let value=response('a1',null),denied=false;
 const api=async()=>{if(denied)throw Error('STATUS_UNVERIFIED');return value},m=await mount(Panel,nativeProps(api));
 try{
  assert.match(document.body.textContent,/Δεν υπάρχει αποθηκευμένη εξουσιοδότηση/);
  value=response('a1',{active:false,firstIssueMonth:null,firstScheduledFor:null,grantedAt:null,revokedAt:null});await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.match(document.body.textContent,/Ανενεργή καταχωρισμένη/);
  value=response('a1',{...enrolled,active:false,revokedAt:'2026-11-18T10:00:00.000Z'});await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.match(document.body.textContent,/Ανακλημένη καταχωρισμένη/);
  value=response('a1',{active:false,firstIssueMonth:null,firstScheduledFor:null,grantedAt:null,revokedAt:'2026-11-18T10:00:00.000Z'});await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.match(document.body.textContent,/Ανακλημένη καταχωρισμένη/);
  denied=true;await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.match(document.querySelector('[role="alert"]').textContent,/STATUS_UNVERIFIED/);assert.ok(!document.querySelector('[aria-label="Καταχωρισμένη εξουσιοδότηση καταστήματος"]'));assert.ok(!document.body.textContent.includes('Δεν υπάρχει αποθηκευμένη εξουσιοδότηση'));
 }finally{await m.close()}
});

test('monthly status clears scope changes, aborts delayed responses and clears withdrawn grants',async()=>{
 const Panel=await component('commerce/MonthlyInventoryCapturePanel');let mode='ok',late,oldSignal;
 const api=async(path,options={})=>{const id=new URL(path,'https://isolated.invalid').searchParams.get('storeId');assert.equal(path,'/api/monthly-inventory-capture/status?storeId='+id);if(mode==='late'&&id==='a1')return new Promise(resolve=>{late=()=>resolve(response('a1'));oldSignal=options.signal});if(mode==='denied')throw Error('MONTHLY_REVOKED');return response(id,id==='a2'?null:enrolled)};
 const m=await mount(Panel,nativeProps(api));
 try{
  mode='late';await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.ok(!document.body.textContent.includes('Ενεργή καταχωρισμένη'));await m.render({...nativeProps(api),storeId:'a2',storeName:'A2'});assert.equal(oldSignal.aborted,true);assert.match(document.body.textContent,/Δεν υπάρχει αποθηκευμένη εξουσιοδότηση/);await m.act(async()=>late());assert.ok(!document.body.textContent.includes('Ενεργή καταχωρισμένη'));
  mode='denied';await m.act(async()=>button('Έλεγχος κατάστασης').click());assert.match(document.querySelector('[role="alert"]').textContent,/MONTHLY_REVOKED/);assert.ok(!document.body.textContent.includes('Δεν υπάρχει αποθηκευμένη εξουσιοδότηση'));
 }finally{await m.close()}
});

test('monthly status rejects malformed scope, actor payloads, mixed activation fields and impossible dates',async()=>{
 const Panel=await component('commerce/MonthlyInventoryCapturePanel');
 const bad=[
  {...response(),companyId:'foreign'}, {...response(),storeId:'a2'}, {...response(),readOnly:false}, {...response(),status:'READ'}, {...response(),actorId:'secret'},
  response('a1',{...enrolled,active:'true'}),response('a1',{...enrolled,delegatorUserId:'secret'}),response('a1',{...enrolled,firstIssueMonth:'2026-13'}),response('a1',{...enrolled,grantedAt:'invalid'}),
  response('a1',{...enrolled,firstIssueMonth:null,firstScheduledFor:null,grantedAt:null}),response('a1',{...enrolled,active:false,firstScheduledFor:null}),
  response('a1',{...enrolled,revokedAt:'2026-11-18T10:00:00.000Z'}),response('a1',{...enrolled,active:false,revokedAt:'2026-11-17T10:00:00.000Z'}),
  response('a1',{...enrolled,firstScheduledFor:'2026-12-01T06:00:00.000Z'}),response('a1',{...enrolled,grantedAt:'2026-12-02T10:00:00.000Z'})
 ];
 for(const value of bad){
  const m=await mount(Panel,nativeProps(async()=>value));
  try{assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.querySelector('[aria-label="Καταχωρισμένη εξουσιοδότηση καταστήματος"]'),null);assert.ok(!document.body.textContent.includes('secret'))}finally{await m.close()}
 }
});
