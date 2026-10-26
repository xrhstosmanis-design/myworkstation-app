import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual mounted paper panel: explicit single read, no automatic retry, escaped source and old-store completion rejected without remount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/shared/CashPaperReadingPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const root=createRoot(document.getElementById('root')),calls=[];
 let active='A',hold=false,release,fail=false,status='NOT_READ';const checksum='a'.repeat(64);
 const source=store=>({sourceId:store,checksum,references:[{messageId:'message-'+store,filename:'<img src=x onerror=alert(1)>'}],reading:{status}});
 const completed=store=>({storeId:store,checksum,generation:'0',status:'EXTRACTED_UNVERIFIED',extraction:{documentDate:null,dateText:'21/10',operatorText:store,shiftText:null,notes:[],lines:[{label:'<script>bad</script>',amountText:null,requiresReview:true}]}});
 const api=async(path,options={})=>{calls.push({path,...options});if(!options.method)return {storeId:active,generation:'0',sources:[source(active)]};if(fail)throw Error('Connection lost');if(hold)return new Promise(resolve=>release=()=>resolve(completed('A')));return completed(active);};
 const render=async store=>{active=store;await act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:store})));};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await render('A');assert.equal(calls.length,0);await act(async()=>button('Χειρόγραφα καταστήματος').click());assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
  await act(async()=>{button('Ανάγνωση με AI').click();button('Ανάγνωση με AI').click();});assert.equal(calls.filter(c=>c.method).length,1);assert.equal(button('Ανάγνωση με AI').disabled,true);assert.match(document.body.textContent,/ΠΡΟΣ ΕΛΕΓΧΟ/);assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('img'),null);
  await render('B');await act(async()=>button('Χειρόγραφα καταστήματος').click());fail=true;await act(async()=>button('Ανάγνωση με AI').click());assert.equal(button('Ανάγνωση με AI').disabled,true);const afterFailure=calls.filter(c=>c.method).length;await act(async()=>Promise.resolve());assert.equal(calls.filter(c=>c.method).length,afterFailure,'no deferred retry');
  fail=false;status='PENDING';await act(async()=>button('Ανανέωση χειρόγραφων').click());assert.equal(button('Ανάγνωση με AI').disabled,true);
  status='NOT_READ';await render('A');await act(async()=>button('Χειρόγραφα καταστήματος').click());hold=true;await act(async()=>button('Ανάγνωση με AI').click());assert.equal(typeof release,'function');
  await render('B');await act(async()=>release());assert.doesNotMatch(document.body.textContent,/message-A|<script>bad/);
  hold=false;await act(async()=>button('Χειρόγραφα καταστήματος').click());assert.match(document.body.textContent,/message-B/);assert.equal(button('Ανάγνωση με AI').disabled,false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});

test('actual Platform parent uses its scoped request and offers papers for an empty selected store without requiring a closed shift',async()=>{
 const {basename}=await import('node:path');
 const keep=new Set(['PlatformAdminApp.jsx','CashPaperReadingPanel.jsx','CashReportPeriodFields.jsx']);
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'isolate-unrelated-editors',setup(b){b.onLoad({filter:/\.jsx$/},args=>keep.has(basename(args.path))?undefined:{contents:'import React from "react";export default function UnrelatedPanel(){return null}',loader:'jsx'});}}]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Node','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','fetch','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 localStorage.setItem('token','synthetic');localStorage.setItem('platformUser',JSON.stringify({id:'test',fullName:'Test'}));
 const calls=[],unexpected=[];let withRows=false;
 globalThis.fetch=async(path,options={})=>{
  calls.push({path,...options});if(options.method&&options.method!=='GET')throw Error('unexpected mutation');const url=new URL(path,'https://isolated.invalid');let data;
  if(url.pathname==='/api/platform/overview')data={stats:{},companies:[{id:'c',name:'Company',active:true,plan:'BASIC',stores:[{id:'A',name:'Store A',active:true},{id:'B',name:'Store B',active:true}]}]};
  else if(url.pathname==='/api/platform/owners')data={owners:[]};
  else if(url.pathname==='/api/platform/backup-monitoring')data={configured:false};
  else if(url.pathname==='/api/platform/cash-control/daily'){
   const storeId=url.searchParams.get('storeId')||'',totals={shifts:withRows?1:0,shortage:0,surplus:0,variance:0,cardVariance:0,expensesWithoutDocument:0};
   data={...Object.fromEntries(url.searchParams),date:url.searchParams.get('date'),storeId,totals,rows:withRows?[{sessionId:'shift',storeId,openedByName:'Test',openedAt:'2026-10-25T06:00Z',closedAt:'2026-10-25T14:00Z',terminalPos:'MAIN',variance:0,cardVariance:0}]:[],stores:withRows?[{storeId,storeName:'Store B',...totals}]:[]};
  }else if(/^\/api\/cash-papers\/stores\/[AB]$/.test(url.pathname)){const storeId=url.pathname.split('/').at(-1);data={storeId,generation:'0',status:'NO_ATTACHMENTS_IN_DISCOVERY',sources:[]};}
  else{unexpected.push(path);throw Error('unexpected route '+path);}
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),click=async el=>{assert.ok(el);await act(async()=>el.click());};
 const selectStore=async value=>act(async()=>{const el=document.querySelector('.cash-report-filters select');Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 try{
  await act(async()=>root.render(React.createElement(module.exports.default)));
  await click(button('Οικονομικά & Έλεγχοι'));await click(button('Ταμεία'));
  assert.equal(document.querySelector('.cash-paper-reading'),null,'no silent all-store paper scope');
  await selectStore('A');assert.ok(button('Χειρόγραφα καταστήματος'),'empty store still has paper control');assert.equal(calls.filter(c=>c.path.startsWith('/api/cash-papers')).length,0,'mount is not an AI or discovery request');
  await click(button('Χειρόγραφα καταστήματος'));assert.equal(calls.at(-1).path,'/api/cash-papers/stores/A');assert.equal(calls.at(-1).headers.Authorization,'Bearer synthetic');
  await selectStore('B');assert.doesNotMatch(document.querySelector('.cash-paper-reading').textContent,/Δεν βρέθηκαν συνημμένα/);await click(button('Χειρόγραφα καταστήματος'));assert.equal(calls.at(-1).path,'/api/cash-papers/stores/B');
  withRows=true;await click(button('Εμφάνιση'));assert.equal(document.querySelectorAll('.cash-paper-reading').length,1);assert.match(document.body.textContent,/Store B/);assert.equal(unexpected.length,0);assert.equal(calls.filter(c=>c.method&&c.method!=='GET').length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
