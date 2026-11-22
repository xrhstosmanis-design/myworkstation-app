import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const external=['react','react-dom','react-dom/client','react/jsx-runtime'];
const isolate={name:'isolate-unrelated-commerce',setup(builder){
 builder.onResolve({filter:/\.jsx$/},args=>{
  if(args.importer.endsWith('/CommerceHub.jsx')&&!args.path.includes('MonthlyInventoryCapturePanel'))return{path:args.path,namespace:'other-view'};
  if(args.importer.endsWith('/CommerceLauncher.jsx')&&!args.path.includes('CommerceHub'))return{path:args.path,namespace:args.path.includes('WholesaleSuiteWorkspace')?'wholesale-view':'other-view'};
 });
 builder.onLoad({filter:/.*/,namespace:'other-view'},()=>({contents:'export default function OtherView(){return null}',loader:'js'}));
 builder.onLoad({filter:/.*/,namespace:'wholesale-view'},()=>({contents:'export default function OtherView(){return null};export const readWholesaleIdentity=()=>({}),wholesaleIdentityKey=()=>"",wholesaleAccessEnabled=()=>false;',loader:'js'}));
}};
const bundles={};
for(const[name,file]of[['panel','MonthlyInventoryCapturePanel'],['hub','CommerceHub'],['launcher','CommerceLauncher']])bundles[name]=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/'+file+'.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external,loader:{'.css':'empty'},plugins:[isolate]});
const purpose='MONTHLY_INVENTORY_CAPTURE',stamp='2020-01-01T00:00:00.000000Z';
const grant=(storeId='selected',patch={})=>({id:'grant-'+storeId,companyId:'company',storeId,purpose,purposeVersion:1,lifecycleGeneration:'0',revision:'1',active:false,delegatorUserId:'owner',delegatorSessionVersion:1,activationId:null,firstIssueMonth:null,createdByUserId:'owner',grantedByUserId:null,revokedByUserId:null,updatedByUserId:'owner',firstScheduledFor:null,createdAt:stamp,grantedAt:null,revokedAt:null,updatedAt:stamp,...patch});
const activeGrant=(storeId='selected',patch={})=>grant(storeId,{revision:'2',active:true,activationId:'activation',firstIssueMonth:'2020-01',firstScheduledFor:'2020-02-01T05:00:00.000000Z',grantedByUserId:'owner',grantedAt:stamp,...patch});
const read=(storeId='selected',value=null,patch={})=>({status:'READ',companyId:'company',storeId,lifecycleGeneration:'0',purpose,grant:value,...patch});
function identity(storage,{id='owner',companyId='company',role='OWNER',staffAccess=false,renewal=0}={}){
 const claims={id,companyId,role,tokenType:'BACKOFFICE_USER',sessionId:'session-'+id,sessionVersion:1,iat:renewal,exp:renewal+999999999};
 storage.setItem('token','header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature-'+renewal);
 storage.setItem('user',JSON.stringify({id,role,company:{id:companyId},...(staffAccess?{staffAccess:true}:{})}));
 storage.removeItem('supportContext');
}

async function mounted(run,{mode='panel',staff=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/?supportStore=selected'});
 const names=['window','document','navigator','HTMLElement','Node','Event','CustomEvent','KeyboardEvent','MutationObserver','localStorage','IS_REACT_ACT_ENVIRONMENT','fetch'],previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)if(name!=='fetch')Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 identity(localStorage,staff?{role:'EMPLOYEE',staffAccess:true}:{});localStorage.setItem('activeModules','["INVENTORY"]');
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),module={exports:{}},require=createRequire(import.meta.url);
 new Function('require','module','exports',bundles[mode].outputFiles[0].text)(require,module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[],commits=[];let unmounted=false;
 let responder=async url=>read(url.searchParams.get('storeId'));
 const api=async(path,options={})=>{
  const url=new URL(path,'https://isolated.invalid');calls.push({url,options});
  if(url.pathname==='/api/license/current')return{modules:[],activeModules:['INVENTORY']};
  if(url.pathname==='/api/stores')return[{id:'selected',name:'Selected',active:true}];
  return responder(url,options);
 };
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async(path,options)=>({ok:true,json:()=>api(path,options)})});
 const props=mode==='panel'?{api,storeId:'selected',storeName:'Selected'}:mode==='hub'?{api,stores:[{id:'other',name:'Other'},{id:'selected',name:'Selected'}],activeStoreId:'selected'}:{};
 function Observed(p){return React.createElement(React.Profiler,{id:'capture',onRender:()=>commits.push(document.querySelector('.monthly-inventory-capture')?.textContent||'')},React.createElement(module.exports.default,p))}
 const render=async(patch={})=>{Object.assign(props,patch);await act(async()=>root.render(React.createElement(Observed,props)))};
 const button=label=>{const found=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===label);assert.ok(found,'Missing button '+label);return found};
 const click=async label=>{await act(async()=>button(label).click())};
 const acknowledge=async()=>{const checkbox=document.querySelector('.monthly-inventory-capture input[type=checkbox]');assert.ok(checkbox);await act(async()=>checkbox.click())};
 const unmount=async()=>{await act(async()=>root.unmount());unmounted=true};
 try{await render();await run({dom,act,api,props,render,calls,commits,button,click,acknowledge,unmount,setResponder:fn=>{responder=fn},setIdentity:options=>identity(localStorage,options)})}
 finally{if(!unmounted)await act(async()=>root.unmount());dom.window.close();for(const[name,descriptor]of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]}
}
const monthly=calls=>calls.filter(call=>call.url.pathname.startsWith('/api/monthly-inventory-capture'));

test('actual personal panel reads explicitly and creates INACTIVE before deliberate purpose enable/revoke',async()=>mounted(async({calls,click,acknowledge,setResponder,button})=>{
 assert.equal(calls.length,0);await click('Έλεγχος κατάστασης');assert.equal(calls[0].url.searchParams.get('storeId'),'selected');assert.equal(calls[0].options.method,undefined);
 assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Δεν υπάρχει προσωπική εξουσιοδότηση/);
 setResponder(async(url,options)=>{
  assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{storeId:'selected',lifecycleGeneration:'0'});
  return{status:'CREATED_INACTIVE',grant:grant()};
 });await click('Δημιουργία ανενεργής εξουσιοδότησης');assert.equal(button('Ενεργοποίηση εξουσιοδότησης').disabled,true);
 const count=calls.length;await click('Ενεργοποίηση εξουσιοδότησης');assert.equal(calls.length,count);
 await acknowledge();setResponder(async(url,options)=>{assert.equal(url.pathname,'/api/monthly-inventory-capture/enable');assert.deepEqual(JSON.parse(options.body),{storeId:'selected',lifecycleGeneration:'0',grantId:'grant-selected',expectedRevision:'1',purpose});return{status:'ENABLED',grant:activeGrant()}});
 await click('Ενεργοποίηση εξουσιοδότησης');assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Αρχική επιλέξιμη/);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/2020/);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/δεν επιβεβαιώνει ότι λειτουργεί ο προγραμματιστής/);
 setResponder(async(url,options)=>{assert.equal(url.pathname,'/api/monthly-inventory-capture/revoke');assert.deepEqual(JSON.parse(options.body),{storeId:'selected',lifecycleGeneration:'0',grantId:'grant-selected',expectedRevision:'2'});return{status:'REVOKED',grant:activeGrant('selected',{revision:'3',active:false,revokedAt:'2020-03-01T00:00:00.000000Z',revokedByUserId:'owner',updatedAt:'2020-03-01T00:00:00.000000Z'})}});
 await click('Ανάκληση εξουσιοδότησης');assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Ανακλημένη/);
}));

test('ALREADY_EXISTS may be active and must not be called newly inactive',async()=>mounted(async({click,setResponder})=>{
 await click('Έλεγχος κατάστασης');setResponder(async()=>({status:'ALREADY_EXISTS',grant:activeGrant()}));await click('Δημιουργία ανενεργής εξουσιοδότησης');
 assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Βρέθηκε η υπάρχουσα/);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Ενεργή προσωπική/);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Δημιουργήθηκε ανενεργή/);
}));

test('unavailable installation is never empty grant; generic and malformed responses require a fresh read',async()=>mounted(async({click,setResponder})=>{
 setResponder(async()=>{throw Object.assign(Error('PRIVATE DATABASE CONTENT'),{code:'MONTHLY_CAPTURE_SCHEMA_REQUIRED'})});await click('Έλεγχος κατάστασης');assert.match(document.querySelector('[role=alert]').textContent,/εγκατάσταση/);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Δεν υπάρχει προσωπική|PRIVATE/);
 setResponder(async()=>{throw Object.assign(Error('PRIVATE'),{code:'MONTHLY_CAPTURE_REQUEST_UNAVAILABLE'})});await click('Έλεγχος κατάστασης');assert.match(document.querySelector('[role=alert]').textContent,/δεν επιβεβαιώθηκε/);assert.doesNotMatch(document.querySelector('[role=alert]').textContent,/εγκατάσταση|PRIVATE/);
 for(const value of [read('foreign'),read('selected',null,{companyId:'foreign'}),read('selected',null,{lifecycleGeneration:0}),read('selected',activeGrant('selected',{firstScheduledFor:'bad'})),{...read(),extra:true}]){
  setResponder(async()=>value);await click('Έλεγχος κατάστασης');assert.equal(document.querySelector('[aria-label="Τρέχουσα προσωπική εξουσιοδότηση"]'),null);assert.match(document.querySelector('[role=alert]').textContent,/δεν επιβεβαιώθηκε/);
 }
}));

test('synchronous duplicate clicks and GET during a pending mutation cannot submit twice',async()=>mounted(async({click,setResponder,act,button,calls})=>{
 await click('Έλεγχος κατάστασης');let release;setResponder(()=>new Promise(resolve=>{release=resolve}));
 await act(async()=>{button('Δημιουργία ανενεργής εξουσιοδότησης').click();button('Δημιουργία ανενεργής εξουσιοδότησης').click();button('Έλεγχος κατάστασης').click()});
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);assert.equal(button('Έλεγχος κατάστασης').disabled,true);
 await act(async()=>release({status:'CREATED_INACTIVE',grant:grant()}));assert.equal(button('Έλεγχος κατάστασης').disabled,false);
}));

test('uncertain POST and stale revision discard actionable state and do not retry before explicit GET',async()=>mounted(async({click,setResponder,calls})=>{
 await click('Έλεγχος κατάστασης');setResponder(async()=>{throw Error('lost response')});await click('Δημιουργία ανενεργής εξουσιοδότησης');
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);assert.equal(document.querySelector('[aria-label="Τρέχουσα προσωπική εξουσιοδότηση"]'),null);assert.match(document.querySelector('[role=alert]').textContent,/νέο έλεγχο πριν/);
 setResponder(async()=>read('selected',activeGrant()));await click('Έλεγχος κατάστασης');assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
 setResponder(async()=>{throw Object.assign(Error('stale'),{code:'MONTHLY_CAPTURE_GRANT_REVISION_STALE'})});await click('Ανάκληση εξουσιοδότησης');assert.equal(document.querySelector('[aria-label="Τρέχουσα προσωπική εξουσιοδότηση"]'),null);
}));

test('first committed store/API render hides old grant, and old mutation cannot clear new busy/error/confirmation',async()=>mounted(async({click,setResponder,render,commits,act,button,calls})=>{
 setResponder(async()=>read('selected',activeGrant()));await click('Έλεγχος κατάστασης');let at=commits.length;await render({storeId:'other',storeName:'Other'});assert.doesNotMatch(commits[at],/Ενεργή προσωπική|2020/);
 setResponder(async()=>read('other',activeGrant('other')));await click('Έλεγχος κατάστασης');at=commits.length;
 const nextApi=async()=>read('other');await render({api:nextApi});assert.doesNotMatch(commits[at],/Ενεργή προσωπική|2020/);
 await render({storeId:'selected',storeName:'Selected',api:async()=>read()});await click('Έλεγχος κατάστασης');
 let oldResolve;const oldApi=async(path,options)=>options?.method==='POST'?new Promise(resolve=>{oldResolve=resolve}):read();await render({api:oldApi});await click('Έλεγχος κατάστασης');await click('Δημιουργία ανενεργής εξουσιοδότησης');
 let freshResolve;await render({storeId:'other',api:()=>new Promise(resolve=>{freshResolve=resolve})});await click('Έλεγχος κατάστασης');await act(async()=>oldResolve({status:'CREATED_INACTIVE',grant:grant()}));assert.equal(button('Έλεγχος κατάστασης').disabled,true);assert.equal(document.querySelector('[role=alert]'),null);
 await act(async()=>freshResolve(read('other',grant('other'))));assert.equal(button('Ενεργοποίηση εξουσιοδότησης').disabled,true);
 assert.equal(calls.some(call=>call.url.searchParams.get('storeId')==='foreign'),false);
}));

test('SAME API changed storage identity refuses old-view mutation before network and masks prior output',async()=>mounted(async({click,setResponder,setIdentity,calls,act})=>{
 setResponder(async()=>read('selected',activeGrant()));await click('Έλεγχος κατάστασης');const count=calls.length;
 setIdentity({id:'another',companyId:'other-company'});await click('Ανάκληση εξουσιοδότησης');assert.equal(calls.length,count);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Ενεργή προσωπική|2020/);
 setResponder(async()=>read('selected',null,{companyId:'other-company'}));await click('Έλεγχος κατάστασης');assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Δεν υπάρχει προσωπική/);
 await act(async()=>{setIdentity({id:'third',companyId:'third-company'});window.dispatchEvent(new window.StorageEvent('storage',{key:'token'}))});assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Δεν υπάρχει προσωπική/);
}));

test('a changed identity during a pending response cannot publish prior grant, even without storage event',async()=>mounted(async({click,setResponder,setIdentity,act})=>{
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await click('Έλεγχος κατάστασης');
 setIdentity({id:'new-owner',companyId:'new-company'});await act(async()=>release(read('selected',activeGrant())));
 assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Ενεργή προσωπική|2020/);
 assert.equal(document.querySelector('.mic-actions'),null);
}));

test('mutation response from a different grant is refused and requires manual reconciliation',async()=>mounted(async({click,setResponder})=>{
 setResponder(async()=>read('selected',activeGrant()));await click('Έλεγχος κατάστασης');
 setResponder(async()=>({status:'REVOKED',grant:activeGrant('selected',{id:'foreign-grant',revision:'3',active:false,revokedAt:stamp,revokedByUserId:'owner'})}));await click('Ανάκληση εξουσιοδότησης');
 assert.equal(document.querySelector('.mic-actions'),null);assert.match(document.querySelector('[role=alert]').textContent,/νέο έλεγχο πριν/);
}));

test('compatible personal token renewal retains the current view and exact current API',async()=>mounted(async({click,setResponder,setIdentity,act})=>{
 setResponder(async()=>read('selected',activeGrant()));await click('Έλεγχος κατάστασης');await act(async()=>{setIdentity({renewal:100});window.dispatchEvent(new window.StorageEvent('storage',{key:'token'}))});assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Ενεργή προσωπική/);
}));

test('removed selection, unmount and hostile labels reveal no old grant or executable markup',async()=>mounted(async({click,setResponder,render,unmount,calls,act})=>{
 await render({storeName:'<img src=x onerror=PRIVATE>'});assert.equal(document.querySelector('.monthly-inventory-capture img'),null);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/<img/);
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await click('Έλεγχος κατάστασης');const signal=calls.at(-1).options.signal;await render({storeId:''});assert.equal(signal.aborted,true);await act(async()=>release(read('selected',activeGrant())));assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/Ενεργή προσωπική|2020/);assert.match(document.querySelector('[role=status]').textContent,/Επίλεξε συγκεκριμένο/);
 await render({storeId:'selected'});await click('Έλεγχος κατάστασης');const last=calls.at(-1).options.signal;await unmount();assert.equal(last.aborted,true);await act(async()=>release(read('selected',activeGrant())));assert.equal(document.getElementById('root').textContent,'');
}));

test('actual Hub D8 uses only explicit parent store and replaces the misleading local selector only on D8',async()=>mounted(async({click,render,calls})=>{
 assert.ok(document.querySelector('.commerce-hub > .panel select'));await click('Εξουσιοδότηση μηνιαίας απογραφής');assert.equal(document.querySelector('.commerce-hub > .panel select'),null);assert.match(document.querySelector('[aria-label="Επιλεγμένο κατάστημα εξουσιοδότησης"]').textContent,/Selected/);
 await click('Έλεγχος κατάστασης');assert.equal(monthly(calls).at(-1).url.searchParams.get('storeId'),'selected');const count=monthly(calls).length;
 await render({activeStoreId:''});assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Επίλεξε συγκεκριμένο/);assert.equal(monthly(calls).length,count);
 await render({activeStoreId:'other'});await click('Έλεγχος κατάστασης');assert.equal(monthly(calls).at(-1).url.searchParams.get('storeId'),'other');await click('Modules');assert.ok(document.querySelector('.commerce-hub > .panel select'));
},{mode:'hub'}));

test('unchanged actual Launcher refuses a genuine staffAccess view before Owner Hub entry',async()=>mounted(async({dom,act,calls})=>{
 await act(async()=>window.dispatchEvent(new dom.window.CustomEvent('mws:commerce-open',{detail:{view:'operations',storeId:'selected'}})));
 assert.equal(document.querySelector('.commerce-overlay'),null);assert.equal(document.querySelector('.commerce-hub'),null);assert.equal(monthly(calls).length,0);
},{mode:'launcher',staff:true}));

test('unchanged actual Launcher still reaches actual Hub and D8 for a personal Owner view',async()=>mounted(async({dom,act,click,calls})=>{
 await act(async()=>window.dispatchEvent(new dom.window.CustomEvent('mws:commerce-open',{detail:{view:'operations',storeId:'selected'}})));
 await click('Εξουσιοδότηση μηνιαίας απογραφής');await click('Έλεγχος κατάστασης');assert.equal(monthly(calls).at(-1).url.searchParams.get('storeId'),'selected');
},{mode:'launcher'}));


const captureAckLabel='Εγκρίνω τη λήψη τώρα για την εμφανιζόμενη περίοδο και το κατάστημα';
const capturePreview=(storeId='selected',patch={})=>({status:'PREVIEW',companyId:'company',storeId,lifecycleGeneration:'0',issueMonth:'2026-10',scheduledFor:'2026-11-01T05:00:00.000Z',checkedAt:'2026-11-01T13:55:00.000Z',timing:'LATE',existingReceipt:null,...patch});
const captureReceipt=(storeId='selected',patch={})=>({receiptBasis:'FORMAT_VALIDATED_STORED_ONLY',sourceAuthenticityVerified:false,id:'11111111-2222-4333-8444-555555555555',companyId:'company',storeId,lifecycleGeneration:'0',issueMonth:'2026-10',scheduledFor:'2026-11-01T05:00:00.000Z',sourceObservedAt:'2026-11-01T13:54:00.000Z',storedAt:'2026-11-01T13:54:00.123456Z',observationStatus:'LATE',delayMs:String(Date.parse('2026-11-01T13:54:00.000Z')-Date.parse('2026-11-01T05:00:00.000Z')),sourceRevision:'a'.repeat(40),sourceHash:'b'.repeat(64),payloadHash:'c'.repeat(64),storedBytesSha256:'d'.repeat(64),...patch});
async function captureAck(act){const input=document.querySelector(`input[aria-label="${captureAckLabel}"]`);assert.ok(input);await act(async()=>input.click())}

test('capture-now is explicit, server-previewed, acknowledged and returns a bounded immutable receipt',async()=>mounted(async({click,calls,setResponder,button,act})=>{
 assert.equal(calls.length,0);setResponder(async(url,options)=>{assert.equal(url.pathname,'/api/monthly-inventory-capture/capture-now');assert.equal(url.searchParams.get('storeId'),'selected');assert.equal(options.method,undefined);assert.equal(options.body,undefined);return capturePreview()});
 await click('Ανανέωση προεπισκόπησης λήψης');assert.match(document.querySelector('[aria-label="Προεπισκόπηση λήψης"]').textContent,/2026-10/);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/τρέχουσα εικόνα αποθέματος/);assert.match(document.querySelector('.monthly-inventory-capture').textContent,/Δεν ανακατασκευάζει/);
 assert.equal(button('Αποθήκευση λήψης τώρα').disabled,true);await click('Αποθήκευση λήψης τώρα');assert.equal(calls.length,1);await captureAck(act);
 setResponder(async(url,options)=>{assert.equal(url.search,'');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{storeId:'selected',lifecycleGeneration:'0',expectedIssueMonth:'2026-10'});return{status:'STORED',receipt:captureReceipt()}});
 await click('Αποθήκευση λήψης τώρα');assert.match(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]').textContent,/2026-10/);assert.match(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]').textContent,/LATE/);assert.equal(document.querySelector(`input[aria-label="${captureAckLabel}"]`),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/sourceHash|sourceAuthenticity|candidateJsonText/);
}));

test('capture preview rejects malformed scope, generation, period, clock and raw or unverified receipt fields',async()=>mounted(async({click,setResponder})=>{
 for(const value of [capturePreview('foreign'),capturePreview('selected',{companyId:'foreign'}),capturePreview('selected',{lifecycleGeneration:0}),capturePreview('selected',{issueMonth:'2026-09'}),capturePreview('selected',{scheduledFor:'2026-11-01T06:00:00.000Z'}),capturePreview('selected',{checkedAt:'2026-11-01T04:59:59.999Z'}),capturePreview('selected',{timing:'ON_TIME'}),capturePreview('selected',{extra:true}),capturePreview('selected',{existingReceipt:captureReceipt('foreign')}),capturePreview('selected',{existingReceipt:captureReceipt('selected',{candidateJsonText:'PRIVATE'})}),capturePreview('selected',{existingReceipt:captureReceipt('selected',{sourceAuthenticityVerified:true})}),capturePreview('selected',{existingReceipt:captureReceipt('selected',{storedAt:'2026-11-01T14:00:00.123456Z'})})]){
  setResponder(async()=>value);await click('Ανανέωση προεπισκόπησης λήψης');assert.equal(document.querySelector('[aria-label="Προεπισκόπηση λήψης"]'),null);assert.equal(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]'),null);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/PRIVATE/);
 }
 setResponder(async()=>read());await click('Έλεγχος κατάστασης');setResponder(async()=>capturePreview('selected',{lifecycleGeneration:'1'}));await click('Ανανέωση προεπισκόπησης λήψης');assert.equal(document.querySelector('[aria-label="Προεπισκόπηση λήψης"]'),null);
}));

test('capture receipt mutation is bound to exact preview and refuses mismatched or unsafe metadata',async()=>mounted(async({click,setResponder,act})=>{
 for(const bad of [captureReceipt('foreign'),captureReceipt('selected',{lifecycleGeneration:'1'}),captureReceipt('selected',{issueMonth:'2026-09'}),captureReceipt('selected',{storedAt:'2026-11-01T13:54:00.123Z'}),captureReceipt('selected',{delayMs:'01'}),captureReceipt('selected',{delayMs:'9007199254740992'}),captureReceipt('selected',{observationStatus:'ON_TIME'}),captureReceipt('selected',{sourceRevision:'PRIVATE'}),captureReceipt('selected',{payloadHash:'x'.repeat(64)})]){
  setResponder(async()=>capturePreview());await click('Ανανέωση προεπισκόπησης λήψης');await captureAck(act);setResponder(async()=>({status:'STORED',receipt:bad}));await click('Αποθήκευση λήψης τώρα');assert.equal(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]'),null);assert.equal(document.querySelector('[aria-label="Προεπισκόπηση λήψης"]'),null);assert.match(document.querySelector('[role=alert]').textContent,/Ανανέωσε την προεπισκόπηση/);
 }
}));

test('capture shares synchronous busy gate with grant and preview actions, and refresh resets acknowledgement',async()=>mounted(async({click,setResponder,act,button,calls})=>{
 setResponder(async()=>read());await click('Έλεγχος κατάστασης');setResponder(async()=>capturePreview());await click('Ανανέωση προεπισκόπησης λήψης');await captureAck(act);await click('Ανανέωση προεπισκόπησης λήψης');assert.equal(button('Αποθήκευση λήψης τώρα').disabled,true);await captureAck(act);
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await act(async()=>{button('Αποθήκευση λήψης τώρα').click();button('Αποθήκευση λήψης τώρα').click();button('Δημιουργία ανενεργής εξουσιοδότησης').click();button('Έλεγχος κατάστασης').click();button('Ανανέωση προεπισκόπησης λήψης').click()});assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(button('Ανανέωση προεπισκόπησης λήψης').disabled,true);await act(async()=>release({status:'STORED',receipt:captureReceipt()}));assert.equal(button('Έλεγχος κατάστασης').disabled,false);
}));

test('uncertain capture reconciles committed winner by explicit preview GET without another POST',async()=>mounted(async({click,setResponder,act,calls})=>{
 setResponder(async()=>capturePreview());await click('Ανανέωση προεπισκόπησης λήψης');await captureAck(act);let stored=false;setResponder(async()=>{stored=true;throw Error('lost after commit PRIVATE')});await click('Αποθήκευση λήψης τώρα');assert.equal(stored,true);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]'),null);assert.equal(document.querySelector(`input[aria-label="${captureAckLabel}"]`),null);
 setResponder(async(url,options)=>{assert.equal(options.method,undefined);return capturePreview('selected',{existingReceipt:captureReceipt()})});await click('Ανανέωση προεπισκόπησης λήψης');assert.match(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]').textContent,/11111111/);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(document.querySelector(`input[aria-label="${captureAckLabel}"]`),null);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/PRIVATE/);
}));

test('capture preview and receipt mask on first store or API commit and old callbacks cannot clear a fresh busy view',async()=>mounted(async({click,setResponder,act,render,commits,button})=>{
 setResponder(async()=>capturePreview('selected',{existingReceipt:captureReceipt()}));await click('Ανανέωση προεπισκόπησης λήψης');let at=commits.length;await render({storeId:'other',storeName:'Other'});assert.doesNotMatch(commits[at],/11111111|2026-10/);
 setResponder(async()=>capturePreview('other'));await click('Ανανέωση προεπισκόπησης λήψης');at=commits.length;await render({api:async()=>capturePreview('other')});assert.doesNotMatch(commits[at],/2026-10/);
 let oldResolve;const oldApi=async(path,options)=>options?.method==='POST'?new Promise(resolve=>{oldResolve=resolve}):capturePreview();await render({storeId:'selected',api:oldApi});await click('Ανανέωση προεπισκόπησης λήψης');await captureAck(act);await click('Αποθήκευση λήψης τώρα');let freshResolve;await render({storeId:'other',api:()=>new Promise(resolve=>{freshResolve=resolve})});await click('Ανανέωση προεπισκόπησης λήψης');await act(async()=>oldResolve({status:'STORED',receipt:captureReceipt()}));assert.equal(button('Ανανέωση προεπισκόπησης λήψης').disabled,true);assert.equal(document.querySelector('[aria-label="Αποθηκευμένη λήψη"]'),null);await act(async()=>freshResolve(capturePreview('other')));assert.equal(button('Αποθήκευση λήψης τώρα').disabled,true);
}));

test('SAME API personal context change refuses capture before network and pending preview cannot publish old output',async()=>mounted(async({click,setResponder,setIdentity,act,calls,render})=>{
 setResponder(async()=>capturePreview());await click('Ανανέωση προεπισκόπησης λήψης');await captureAck(act);const count=calls.length;setIdentity({id:'another',companyId:'other-company'});await click('Αποθήκευση λήψης τώρα');assert.equal(calls.length,count);assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/2026-10|11111111/);
 setIdentity({});await render();let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await click('Ανανέωση προεπισκόπησης λήψης');setIdentity({id:'third',companyId:'third-company'});await act(async()=>release(capturePreview('selected',{existingReceipt:captureReceipt()})));assert.doesNotMatch(document.querySelector('.monthly-inventory-capture').textContent,/2026-10|11111111/);
}));

const chromePath=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(path=>existsSync(path));
test('actual Chromium monthly capture screen works with desktop/mobile pointer and keyboard; actual staff Launcher stays denied',{skip:!chromePath&&!process.env.CI?'Chromium unavailable locally':false,timeout:120000},async()=>{
 assert.ok(chromePath,'Chromium is mandatory in CI');const flow=fileURLToPath(new URL('../e2e/monthly-inventory-capture-browser-flow.mjs',import.meta.url));
 const{stdout}=await promisify(execFile)(process.execPath,[flow],{env:{...process.env,CHROME_BIN:chromePath},timeout:110000,maxBuffer:1024*1024});assert.match(stdout,/Chromium monthly inventory capture passed/);
});
