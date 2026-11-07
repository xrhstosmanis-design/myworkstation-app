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
test('Platform cash preview shows the entire long native report and only explicit Send posts the unchanged fingerprint',async()=>{
 const m=await mount('platform/PlatformAdminApp.jsx',['CashReportPeriodFields.jsx','CashEmailPreviewDialog.jsx']),{act,dom,React,root,Component}=m,calls=[];
 let date,pending=false,delay=false,release,foreign=false,long=false;
 const beginning='ΕΛΕΓΧΟΣ ΤΑΜΕΙΩΝ MYWORKSTATION\nΑΠΟΤΕΛΕΣΜΑ ΜΕΤΑ ΑΠΟ ΕΛΕΓΧΟ\nΧρυσάνθη: Έλλειμμα 7,00 €\nPOS–EFTPOS: διαφορά +200,00 €.';
 const ending='ΤΕΛΟΣ ΑΝΑΦΟΡΑΣ ΜΕΤΑ ΤΟΝ ΧΑΡΑΚΤΗΡΑ 10240';
 const full=beginning+'\n'+('Χειρόγραφο προς διασταύρωση, χωρίς καταλογισμό.\n'.repeat(330))+'\n'+ending;
 assert(full.length>10240);
 const reportText=()=>long?full:beginning;
 const preview=()=>({storeId:foreign?'B':'A',storeName:'Store A',date,rows:[{sessionId:'a'}],recipients:['owner@example.invalid'],readyToSend:!pending,text:reportText(),reportHash:'d'.repeat(64),generation:'0'});
 dom.window.prompt=()=>{throw Error('Native prompt must never be used for cash email')};
 dom.window.alert=()=>{throw Error('Native alert must never be used for full cash preview')};
 localStorage.setItem('token','synthetic');localStorage.setItem('platformUser',JSON.stringify({id:'test',fullName:'Test',email:'auditor@example.invalid'}));
 globalThis.fetch=async(path,options={})=>{
  calls.push({path,...options});const url=new URL(path,'https://isolated.invalid');let data;
  if(url.pathname==='/api/platform/overview')data={stats:{},companies:[{id:'co',name:'Company',active:true,plan:'BASIC',stores:[{id:'A',name:'Store A',active:true},{id:'B',name:'Store B',active:true}]}]};
  else if(url.pathname==='/api/platform/owners')data={owners:[]};
  else if(url.pathname==='/api/platform/backup-monitoring')data={configured:false};
  else if(url.pathname==='/api/platform/cash-control/daily'){
   date=url.searchParams.get('from');const totals={shifts:1,shortage:87,surplus:0,variance:-87,cardVariance:200,expensesWithoutDocument:0};
   data={...Object.fromEntries(url.searchParams),totals,rows:[{companyId:'co',storeId:'A',sessionId:'a',openedByName:'Χρυσάνθη',openedAt:date+'T06:00:00Z',closedAt:date+'T14:00:00Z',variance:-87,cardVariance:200,auditRule:{mode:'FULL'},duplicateCandidates:0}],stores:[{...totals,storeId:'A',storeName:'Store A',companyName:'Company'}]};
  }else if(url.pathname.endsWith('/email-preview')){if(delay)return new Promise(resolve=>release=()=>resolve({ok:true,status:200,text:async()=>JSON.stringify(preview())}));data=preview();}
  else if(url.pathname.endsWith('/send-email')||url.pathname.endsWith('/send-preview'))data={recipients:['owner@example.invalid'],messageId:'synthetic-no-smtp'};
  else throw Error('Unexpected route '+path);
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const click=async el=>{assert.ok(el);await act(async()=>{el.click()})};
 const select=async value=>act(async()=>{const el=document.querySelector('.cash-report-filters select');Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const posts=()=>calls.filter(c=>c.method==='POST'),shown=()=>document.querySelector('[data-testid="cash-email-full-body"]');
 try{
  await act(async()=>root.render(React.createElement(Component)));
  await click(button('Οικονομικά & Έλεγχοι'));await click(button('Ταμεία'));await select('A');await click(button('Εμφάνιση'));
  long=true;await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  assert.equal(shown()?.textContent,full,'the complete body, including the last marker, stays in the DOM');
  assert(document.querySelector('[role="dialog"]')?.textContent.includes('owner@example.invalid'));
  assert.equal(posts().length,0,'opening or reading does not send');
  await click(button('Άκυρο'));assert.equal(shown(),null);assert.equal(posts().length,0);

  long=false;await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  const ownerSend=button('Αποστολή αναφοράς');assert(ownerSend&&!ownerSend.disabled);
  await act(async()=>{ownerSend.click();ownerSend.click()});
  assert.equal(posts().length,1,'two synchronous clicks must not double-send');
  assert.match(posts()[0].path,/\/send-email$/);
  assert.deepEqual(JSON.parse(posts()[0].body),{date,comment:'',reportHash:'d'.repeat(64),generation:'0'});
  assert.equal(posts()[0].headers.Authorization,'Bearer synthetic');
  assert.equal(shown(),null);

  await click(button('Δοκιμή στο email μου'));
  assert.equal(shown()?.textContent,beginning);
  assert.equal(posts().length,1,'self preview does not transmit before Send');
  await click(button('Αποστολή δοκιμής'));
  assert.equal(posts().length,2);
  assert.match(posts()[1].path,/\/send-preview$/);
  assert.equal(JSON.parse(posts()[1].body).comment,'');

  pending=true;await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  assert.equal(shown()?.textContent,beginning);
  assert.equal(button('Αποστολή αναφοράς').disabled,true,'not-ready owner send stays blocked');
  assert.equal(posts().length,2);await click(button('Άκυρο'));
  await click(button('Δοκιμή στο email μου'));
  assert.equal(button('Αποστολή δοκιμής').disabled,false,'self-preview retains its existing pending-readiness permission');
  await click(button('Άκυρο'));
  pending=false;

  foreign=true;await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  assert.equal(shown(),null);assert.match(document.body.textContent,/Ανανέωσε την προεπισκόπηση/);foreign=false;

  await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  assert.ok(shown());await select('B');
  assert.equal(button('Αποστολή αναφοράς').disabled,true,'store change invalidates visible preview without sending');
  await click(button('Άκυρο'));assert.equal(posts().length,2);
  await select('A');await click(button('Εμφάνιση'));
  delay=true;await click(button('Προεπισκόπηση & email ιδιοκτητών'));
  assert.equal(typeof release,'function');await select('B');await act(async()=>release());
  assert.equal(shown(),null);assert.equal(posts().length,2,'late A response never opens under B');
 }finally{await m.cleanup()}
});
