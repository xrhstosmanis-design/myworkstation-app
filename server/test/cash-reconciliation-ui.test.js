import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function mount(entry,keep=[]){
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/'+entry,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'isolated-unrelated-panels',setup(b){b.onLoad({filter:/\.jsx$/},args=>new Set([basename(entry),...keep]).has(basename(args.path))?undefined:{contents:'import React from "react";export default function OtherPanel(){return null}',loader:'jsx'});}}]});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Node','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','fetch','crypto','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='crypto'?{randomUUID}:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 return {dom,React,act,root,Component:module.exports.default,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const field=text=>[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith(text))?.querySelector('select,input,textarea');
const row=(id,name,next)=>({sessionId:id,operatorName:name,day:'2026-10-21',terminalPos:'MAIN',remainingCents:id==='a'?-8700:8000,sourceHash:(id==='a'?'a':'b').repeat(64),planHash:'c'.repeat(64),nextSessionId:next,eligible:true,reviewed:false,status:'AWAITING_REVIEW',transactions:[]});
function report(store,period,completed=[]){return {storeId:store,generation:'0',period,head:completed.length?'a'.repeat(64):'ROOT',rows:[row('a','<img src=x onerror=bad>','b'),row('b','Second',null)],context:[],history:[],reportHash:'d'.repeat(64),completedRequestIds:completed,text:'SERVER REPORT '+store+' <script>untrusted</script>',checkpoint:null};}
const period={from:'2026-10-21',to:'2026-10-23'};
test('mounted review panel: no automatic requests, explicit confirmed single POST, uncertain reply requires GET, exact common copy and no guessed paper values',async()=>{
 const m=await mount('shared/CashReconciliationPanel.jsx'),{act,dom,React,root,Component}=m,calls=[],committed=[];let fail=true,commitFailure=true,copied;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied=text}});
 const api=async(path,options={})=>{calls.push({path,...options});if(options.method==='POST'){const request=JSON.parse(options.body);if(!fail||commitFailure)committed.push(request.requestId);if(fail)throw Error('Lost reply');return report('A',period,committed);}
  if(path.startsWith('/api/cash-papers/'))return {storeId:'A',generation:'0',sources:[{sourceId:'paper',checksum:'e'.repeat(64),references:[{messageId:'paper',filename:'<svg onload=bad>'}],reading:{status:'EXTRACTED_UNVERIFIED',sourceKey:'f'.repeat(64),extraction:{documentDate:null,lines:[{label:'Δυσανάγνωστο',amountText:null,amountCents:null,requiresReview:true}]}}}]};
  const id=new URL(path,'https://isolated.invalid').searchParams.get('requestId');return {...report('A',period,committed),requestId:id,requestStatus:id?(committed.includes(id)?'APPLIED':'NOT_FOUND'):null};
 };
 const click=async el=>{assert.ok(el);await act(async()=>el.click());},change=async(el,value)=>{assert.ok(el);await act(async()=>{const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
 try{
  await act(async()=>root.render(React.createElement(Component,{api,storeId:'A',...period})));assert.equal(calls.length,0);
  await click(button('Έλεγχος με επανυπολογισμούς'));assert.equal(calls.length,1);assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('img'),null);
  await change(field('Προηγούμενη βάρδια'),'a');await change(field('Επόμενη βάρδια'),'b');await change(field('Επιβεβαιωμένο ποσό'),'80,00');await change(field('Τεκμηρίωση'),'Επιβεβαιώθηκε λάθος καταμέτρησης.');assert.equal(button('Καταχώριση ελέγχου').disabled,true);
  await click(document.querySelector('input[type="checkbox"]'));await act(async()=>{button('Καταχώριση ελέγχου').click();button('Καταχώριση ελέγχου').click();});
  const posts=()=>calls.filter(c=>c.method==='POST');assert.equal(posts().length,1);const sent=JSON.parse(posts()[0].body);assert.equal(sent.data.kind,'OFFSET');assert.equal(sent.data.amountCents,8000);assert.equal(sent.data.countingErrorConfirmed,true);assert.equal(button('Καταχώριση ελέγχου').disabled,true);assert.equal(button('Αντιγραφή ελεγμένης αναφοράς').disabled,true);
  await act(async()=>Promise.resolve());assert.equal(posts().length,1,'no deferred retry');fail=false;
  await click(button('Ανανέωση ελέγχου'));assert.match(document.body.textContent,/είχε ήδη καταχωριστεί/);assert.equal(posts().length,1);
  await click(button('Αντιγραφή ελεγμένης αναφοράς'));assert.equal(copied,report('A',period,committed).text,'clipboard uses exactly the common server report');
  await change(field('Ενέργεια ελέγχου'),'ASSOCIATE');await click(button('Φόρτωση αναγνωσμένων χαρτιών'));assert.equal(calls.at(-1).path,'/api/cash-papers/stores/A');
  await change(field('Χαρτί'),'e'.repeat(64));await change(field('Γραμμή χαρτιού'),'0');assert.equal(field('Επιβεβαιωμένο ποσό').value,'');assert.equal(field('Επιβεβαιωμένη ημερομηνία').value,'');assert.equal(document.querySelector('svg'),null);assert(!calls.some(c=>c.path.endsWith('/read')),'association never invokes AI');
  await change(field('Ενέργεια ελέγχου'),'CONFIRM');await change(field('Βάρδια ελέγχου'),'a');await change(field('Τεκμηρίωση'),'Επανελέγχθηκαν τα αρχικά στοιχεία.');await click(document.querySelector('input[type="checkbox"]'));
  fail=true;commitFailure=false;await click(button('Καταχώριση ελέγχου'));const uncertainId=JSON.parse(posts().at(-1).body).requestId;
  fail=false;await click(button('Ανανέωση ελέγχου'));assert.match(document.body.textContent,/δεν βρέθηκε/);await click(document.querySelector('input[type="checkbox"]'));await click(button('Καταχώριση ελέγχου'));assert.equal(JSON.parse(posts().at(-1).body).requestId,uncertainId,'manual retry keeps the original idempotency identity');
 }finally{await m.cleanup();}
});
test('mounted review panel rejects old store and period completions without remount or automatic resubmission',async()=>{
 const m=await mount('shared/CashReconciliationPanel.jsx'),{act,dom,React,root,Component}=m,calls=[];let release;
 const api=async(path,options={})=>{calls.push({path,...options});const store=new URL(path,'https://isolated.invalid').pathname.split('/')[4];if(options.method==='POST')return new Promise(resolve=>release=()=>resolve(report('A',period)));return report(store,period);};
 const render=(store,p=period)=>act(async()=>root.render(React.createElement(Component,{api,storeId:store,...p}))),click=el=>act(async()=>el.click()),change=(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
 try{
  await render('A');await click(button('Έλεγχος με επανυπολογισμούς'));await change(field('Ενέργεια ελέγχου'),'CONFIRM');await change(field('Βάρδια ελέγχου'),'a');await change(field('Τεκμηρίωση'),'Ελέγχθηκαν τα στοιχεία βάρδιας.');await click(document.querySelector('input[type="checkbox"]'));await click(button('Καταχώριση ελέγχου'));assert.equal(typeof release,'function');
  await render('B',{from:'2026-10-22',to:'2026-10-24'});await act(async()=>release());assert.doesNotMatch(document.body.textContent,/SERVER REPORT A/);assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(button('Έλεγχος με επανυπολογισμούς').getAttribute('aria-expanded'),'false');
 }finally{await m.cleanup();}
});
test('actual Platform parent mounts the real review panel for an explicitly selected empty store and sends its authenticated scoped GET',async()=>{
 const m=await mount('platform/PlatformAdminApp.jsx',['CashReconciliationPanel.jsx','CashReportPeriodFields.jsx']),{act,dom,React,root,Component}=m,calls=[];
 localStorage.setItem('token','synthetic');localStorage.setItem('platformUser',JSON.stringify({id:'test',fullName:'Test'}));
 globalThis.fetch=async(path,options={})=>{calls.push({path,...options});assert(!options.method||options.method==='GET');const url=new URL(path,'https://isolated.invalid');let data;
  if(url.pathname==='/api/platform/overview')data={stats:{},companies:[{id:'co',name:'Company',active:true,plan:'BASIC',stores:[{id:'A',name:'Store A',active:true},{id:'B',name:'Store B',active:true}]}]};
  else if(url.pathname==='/api/platform/owners')data={owners:[]};else if(url.pathname==='/api/platform/backup-monitoring')data={configured:false};
  else if(url.pathname==='/api/platform/cash-control/daily')data={...Object.fromEntries(url.searchParams),totals:{shifts:0,shortage:0,surplus:0,variance:0,cardVariance:0,expensesWithoutDocument:0},rows:[],stores:[]};
  else if(url.pathname.startsWith('/api/cash-reconciliation/stores/'))data=report(url.pathname.split('/').at(-1),{from:url.searchParams.get('from'),to:url.searchParams.get('to')});else throw Error('Unexpected route '+path);
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const click=el=>act(async()=>el.click()),select=async value=>act(async()=>{const el=document.querySelector('.cash-report-filters select');Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 try{
  await act(async()=>root.render(React.createElement(Component)));await click(button('Οικονομικά & Έλεγχοι'));await click(button('Ταμεία'));assert.equal(document.querySelector('.cash-reconciliation-panel'),null);
  await select('A');assert.ok(button('Έλεγχος με επανυπολογισμούς'));assert(!calls.some(c=>c.path.startsWith('/api/cash-reconciliation')));
  await click(button('Έλεγχος με επανυπολογισμούς'));assert.match(calls.at(-1).path,/^\/api\/cash-reconciliation\/stores\/A\?/);assert.equal(calls.at(-1).headers.Authorization,'Bearer synthetic');
  await select('B');assert.doesNotMatch(document.body.textContent,/SERVER REPORT A/);await click(button('Έλεγχος με επανυπολογισμούς'));assert.match(calls.at(-1).path,/^\/api\/cash-reconciliation\/stores\/B\?/);
 }finally{await m.cleanup();}
});
test('actual Backoffice parent uses the applied report period and current store for the real review panel',async()=>{
 const m=await mount('cloud/CashControlPanel.jsx',['CashReconciliationPanel.jsx','CashReportPeriodFields.jsx']),{act,React,root,Component}=m,calls=[];
 const api=async(path,options={})=>{calls.push({path,...options});assert(!options.method||options.method==='GET');const url=new URL(path,'https://isolated.invalid');
  if(path.includes('/daily-summary'))return {...period,date:period.from,sessions:[]};if(path.includes('/overview'))return {recent:[],suggestedOpening:{},offlineSync:{counts:{}}};
  if(path.startsWith('/api/cash-reconciliation/'))return report(url.pathname.split('/').at(-1),{from:url.searchParams.get('from'),to:url.searchParams.get('to')});throw Error('Unexpected fixture request '+path);
 };
 const render=id=>act(async()=>root.render(React.createElement(Component,{api,store:{id,name:id}}))),click=el=>act(async()=>el.click());
 try{
  await render('A');assert(!calls.some(c=>c.path.startsWith('/api/cash-reconciliation/')));await click(button('Έλεγχος με επανυπολογισμούς'));
  let url=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(url.pathname,'/api/cash-reconciliation/stores/A');assert.equal(url.searchParams.get('from'),period.from);assert.equal(url.searchParams.get('to'),period.to);
  await render('B');assert.doesNotMatch(document.body.textContent,/SERVER REPORT A/);await click(button('Έλεγχος με επανυπολογισμούς'));url=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(url.pathname,'/api/cash-reconciliation/stores/B');
 }finally{await m.cleanup();}
});
test('review history pages are explicit free GETs and never resubmit an action or silently broaden the store',async()=>{
 const m=await mount('shared/CashReconciliationPanel.jsx'),{act,React,root,Component}=m,calls=[];
 const api=async(path,options={})=>{calls.push({path,...options});assert(!options.method||options.method==='GET');const page=Number(new URL(path,'https://isolated.invalid').searchParams.get('historyPage')||0);return {...report('A',period),historyPage:page,historyPages:3,historyTotal:130,history:[{id:'page-'+page,kind:'CHECKPOINT',note:'Καταχώρηση σελίδας '+page,actorName:'Test',createdAt:'2026-10-26',active:true}]};};
 const click=el=>act(async()=>el.click());
 try{
  await act(async()=>root.render(React.createElement(Component,{api,storeId:'A',...period})));await click(button('Έλεγχος με επανυπολογισμούς'));await click(document.querySelector('summary'));
  await click(button('Παλαιότερες καταχωρήσεις'));assert.match(calls.at(-1).path,/historyPage=1/);assert.match(document.body.textContent,/Καταχώρηση σελίδας 1/);
  await click(button('Παλαιότερες καταχωρήσεις'));assert.equal(button('Παλαιότερες καταχωρήσεις').disabled,true);await click(button('Νεότερες καταχωρήσεις'));assert.match(calls.at(-1).path,/historyPage=1/);assert(calls.every(c=>c.path.startsWith('/api/cash-reconciliation/stores/A?')));
 }finally{await m.cleanup();}
});
