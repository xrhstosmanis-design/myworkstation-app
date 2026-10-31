import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted SuperAdmin email/save uses one administrative action, same recipient list, truthful OFF/provenance and revocation',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AutomaticReportDispatchManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];let recipients=[],pending,hold=false,externalEnabled=false;
 const request=async(path,options={})=>{
  calls.push({path,...options});if(!options.method)return {schemaReady:true,activation:{enabled:externalEnabled,epoch:'current-epoch'},policy:{revision:2,dispatchEnabled:true,allowedFrequencies:['DAILY']},grant:{revision:4,active:true,activationEpoch:'old-epoch'},recipients:path.includes('/stores/B/')?[]:recipients};
  if(hold)return new Promise(resolve=>{pending=resolve});const body=JSON.parse(options.body);
  if(path.endsWith('/recipients/authorize'))recipients=[{recipient:{recipientId:'r',email:body.email,version:1,verifiedAt:null},consent:{active:true,revision:1,allowedFrequencies:body.allowedFrequencies},authorizationBasis:'SUPER_ADMIN',authorization:{basis:'SUPER_ADMIN',authorizedBy:'admin',authorizedAt:'2026-11-01T08:00:00Z'}}];
  if(path.endsWith('/consent')){recipients[0].authorization=null;recipients[0].consent={active:false,revision:2}}
  return {saved:true,externalActivationEnabled:false};
 };
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{key:store,company:{id:'c'},store:{id:store,name:store},request})));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const input=async value=>act(async()=>{const el=document.querySelector('[aria-label="Νέο email αυτόματων αναφορών"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 try{
  await render('A');assert.equal(calls.filter(x=>x.method).length,0);assert.equal(button('Αποθήκευση και ενεργοποίηση').disabled,true);
  await input('mail@example.invalid');await act(async()=>button('Αποθήκευση και ενεργοποίηση').click());
  let writes=calls.filter(x=>x.method);assert.equal(writes.length,1);assert.match(writes[0].path,/\/stores\/A\/report-dispatch\/recipients\/authorize$/);assert.deepEqual(JSON.parse(writes[0].body),{email:'mail@example.invalid',expectedRecipientVersion:0,expectedAuthorizationRevision:0,expectedGrantRevision:4,expectedPolicyRevision:2,allowedFrequencies:['DAILY'],explicitAuthorization:true});
  assert.match(document.body.textContent,/Εγκεκριμένο από Super Admin/);assert.doesNotMatch(document.body.textContent,/Ενεργή συγκατάθεση|Επιβεβαιωμένο email/);assert.match(document.querySelector('[role="status"]').textContent,/Η κεντρική αποστολή είναι κλειστή/);assert.equal(document.querySelectorAll('strong').length>0,true);
  externalEnabled=true;await act(async()=>button('Ανανέωση κατάστασης αποστολών').click());assert.match(document.body.textContent,/Η αυτόματη αποστολή είναι κλειστή ή αναμένει ενεργοποίηση/,'an old activation epoch must never be displayed as currently ON');
  await act(async()=>button('Έγκριση και ενεργοποίηση').click());writes=calls.filter(x=>x.method);assert.equal(JSON.parse(writes[1].body).recipientId,'r');assert.equal(JSON.parse(writes[1].body).expectedAuthorizationRevision,1);assert.equal(recipients.length,1,'stored list reused');
  await act(async()=>button('Ανάκληση έγκρισης').click());assert.match(document.body.textContent,/Χωρίς ενεργή έγκριση από Super Admin/);assert.doesNotMatch(document.body.textContent,/Εγκεκριμένο από Super Admin|Ενεργή συγκατάθεση/);
  hold=true;await act(async()=>button('Έγκριση και ενεργοποίηση').click());assert.ok(pending);await render('B');await act(async()=>pending({saved:true,externalActivationEnabled:true}));assert.doesNotMatch(document.body.textContent,/mail@example.invalid|Ο παραλήπτης εγκρίθηκε/);
  assert.equal(calls.some(x=>/\/invitations$|\/verification|\/consent\/(request|confirm)$/.test(x.path)),false);assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
