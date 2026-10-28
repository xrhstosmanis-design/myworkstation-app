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
const panelBuild=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/MonthlyInvoiceAuditPanel.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external});
const hubBuild=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/CommerceHub.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external,loader:{'.css':'empty'},plugins:[{name:'isolate-other-commerce-views',setup(builder){builder.onResolve({filter:/\.jsx$/},args=>args.importer.endsWith('/CommerceHub.jsx')&&!args.path.includes('MonthlyInvoiceAuditPanel')?{path:args.path,namespace:'other-view'}:null);builder.onLoad({filter:/.*/,namespace:'other-view'},()=>({contents:'export default function OtherView(){return null}',loader:'js'}))}}]});
const row={id:'doc:1',documentNumber:'<img src=x onerror=SECRET>',documentType:'INVOICE',issueDay:'2026-10-02',registeredAt:'2026-10-03T00:00:00Z',supplierName:'<script>bad</script>',supplierTaxId:'099999999',totalCents:1234,status:'UNPOSTED',sources:[],categories:['UNPOSTED_DOCUMENT'],reasons:[]};
const response=(storeId='s',month='2026-10',patch={})=>({store:{id:storeId,name:'Synthetic'},period:{month},asOf:'2026-10-28T12:00:00Z',coverage:{complete:true,unavailable:[],limited:[]},summary:{logicalRecords:120,unposted:120,uploadedAwaitingReview:0,possibleDuplicates:0,identityReview:0,credits:0,inactive:0},items:[row],nextPage:'next-page',pendingOriginals:{available:true,period:'ALL_MONTHS',counts:{total:75,missingOriginal:60,uploadedAwaitingReview:10,reviewRequired:5},items:[{id:'p',documentNumber:'OLD 1',documentDate:'2025-01-01',supplierName:'Old supplier',amount:1,status:'AWAITING_INVOICE'}],truncated:true},allClear:false,readOnly:true,immutableSnapshot:false,...patch});

async function mounted(run,{hub=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),names=['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent','localStorage','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 localStorage.setItem('activeModules','["INVENTORY"]');
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),module={exports:{}},require=createRequire(import.meta.url);
 new Function('require','module','exports',(hub?hubBuild:panelBuild).outputFiles[0].text)(require,module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];let unmounted=false,responder=async(url)=>response(url.searchParams.get('storeId'),url.searchParams.get('month'));
 const api=async(path,options)=>{const url=new URL(path,'https://isolated.invalid');calls.push({url,options});if(url.pathname==='/api/license/current')return{modules:[],activeModules:['INVENTORY']};return responder(url,options)};
 const props=hub?{api,stores:[{id:'s',name:'Selected'},{id:'other',name:'Other'}],activeStoreId:'s'}:{api,storeId:'s',storeName:'Selected',initialMonth:'2026-10'};
 const commitSnapshots=[];function ObservedPanel(p){React.useLayoutEffect(()=>{commitSnapshots.push(document.querySelector('.invoice-month-audit')?.textContent||'')});return React.createElement(module.exports.default,p)}
 const render=async(patch={})=>{Object.assign(props,patch);await act(async()=>root.render(React.createElement(ObservedPanel,props)))};
 const click=async(text)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(button,'Missing button '+text);await act(async()=>button.click())};
 const submit=async()=>{const form=document.querySelector('.invoice-month-audit form');assert.ok(form);await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))};
 const changeMonth=async(value)=>{const input=document.querySelector('input[type=month]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})};
 const unmount=async()=>{await act(async()=>root.unmount());unmounted=true};
 try{await render();await run({dom,render,click,submit,changeMonth,calls,commitSnapshots,setResponder:fn=>{responder=fn},act,unmount})}finally{if(!unmounted)await act(async()=>root.unmount());dom.window.close();for(const[name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
}

test('actual panel is explicit GET-only, escapes labels and separates complete month totals from all-month pending',async()=>mounted(async({submit,calls})=>{
 assert.equal(calls.length,0);await submit();assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/api/reports/invoice-month-audit');assert.equal(calls[0].options.method,undefined);
 assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/120/);assert.match(document.querySelector('[aria-label="Εκκρεμότητες όλων των μηνών"]').textContent,/75/);assert.match(document.querySelector('.ima-pending').textContent,/Όλοι οι μήνες/);assert.match(document.querySelector('.ima-pending').textContent,/πρώτες 50/);assert.match(document.querySelector('.ima-pending').textContent,/Δεν περιλαμβάνεται/);
 assert.match(document.querySelector('.ima-rows').textContent,/<img src=x onerror=SECRET>/);assert.equal(document.querySelector('.invoice-month-audit img'),null);assert.equal(document.querySelectorAll('.invoice-month-audit script').length,0);assert.equal(document.querySelector('.ima-safe'),null);
}));

test('source gaps and analysis limits display unknown coverage instead of zero-issues',async()=>mounted(async({setResponder,submit})=>{
 setResponder(async()=>response('s','2026-10',{coverage:{complete:false,unavailable:['inbound'],limited:['documents']},summary:null,items:[],nextPage:null,pendingOriginals:{available:false,items:[],counts:null}}));await submit();
 assert.match(document.querySelector('.invoice-month-audit').textContent,/Η κάλυψη δεν είναι πλήρης/);assert.equal(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]'),null);assert.match(document.querySelector('.ima-pending').textContent,/Δεν θεωρείται μηδενική/);assert.equal(document.querySelector('.ima-safe'),null);
}));

test('page request preserves selected month and full counts; stale-page error clears old output',async()=>mounted(async({setResponder,submit,click,calls})=>{
 await submit();await click('Επόμενη σελίδα');assert.equal(calls.at(-1).url.searchParams.get('page'),'next-page');assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/120/);
 setResponder(async()=>{throw Error('Τα στοιχεία άλλαξαν. Εκτέλεσε νέο έλεγχο.')});await click('Επόμενη σελίδα');assert.match(document.querySelector('[role=alert]').textContent,/στοιχεία άλλαξαν/);assert.equal(document.querySelector('.ima-rows'),null);
}));

test('edited month is not silently applied to loaded data and rejects a late previous-month response',async()=>mounted(async({submit,changeMonth,setResponder,act})=>{
 await submit();await changeMonth('2026-09');assert.match(document.querySelector('.invoice-month-audit').textContent,/αφορούν ακόμη τον μήνα 2026-10/);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Επόμενη σελίδα').disabled,true);
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await submit();await changeMonth('2026-08');await act(async()=>release(response('s','2026-09',{items:[{...row,documentNumber:'LATE-OLD-MONTH'}]})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/LATE-OLD-MONTH/);
}));

test('store switch/removal and unmount abort old requests and cannot reveal another store',async()=>mounted(async({submit,render,setResponder,calls,act})=>{
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await submit();const signal=calls[0].options.signal;await render({storeId:'other',storeName:'Other'});assert.equal(signal.aborted,true);await act(async()=>release(response('s','2026-10',{items:[{...row,documentNumber:'OLD-STORE'}]})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/OLD-STORE/);
 await render({storeId:'',storeName:''});assert.equal(document.querySelector('.invoice-month-audit form'),null);assert.match(document.querySelector('[role=status]').textContent,/Επίλεξε συγκεκριμένο/);
}));

test('actual CommerceHub launcher uses only explicit activeStoreId, never first-store fallback',async()=>mounted(async({click,render,calls,submit})=>{
 await click('Έλεγχος τιμολογίων μήνα');await submit();assert.equal(calls.at(-1).url.searchParams.get('storeId'),'s');
 await render({activeStoreId:''});assert.equal(document.querySelector('.invoice-month-audit form'),null);const before=calls.length;assert.match(document.querySelector('.invoice-month-audit').textContent,/Επίλεξε συγκεκριμένο/);assert.equal(calls.length,before);
 await render({activeStoreId:'other'});await submit();assert.equal(calls.at(-1).url.searchParams.get('storeId'),'other');
},{hub:true}));

test('unmounted view aborts its outstanding GET and ignores the late result',async()=>mounted(async({submit,setResponder,calls,unmount,act})=>{
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await submit();await unmount();assert.equal(calls[0].options.signal.aborted,true);await act(async()=>release(response()));assert.equal(document.getElementById('root').textContent,'');
}));

const chromePath=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(path=>existsSync(path));
test('real Chromium monthly invoice audit is reachable and honest at desktop/mobile viewport sizes',{skip:!chromePath&&process.env.CI!=='true'?'Chromium unavailable locally':false,timeout:120000},async()=>{
 assert.ok(chromePath,'Chromium is mandatory in CI');
 const flow=fileURLToPath(new URL('../e2e/monthly-invoice-audit-browser-flow.mjs',import.meta.url));
 const {stdout}=await promisify(execFile)(process.execPath,[flow],{env:{...process.env,CHROME_BIN:chromePath},timeout:110000,maxBuffer:1024*1024});assert.match(stdout,/Chromium monthly invoice audit passed/);
});


test('first committed store/API render masks loaded observations before passive cleanup',async()=>mounted(async({submit,render,commitSnapshots})=>{
 await submit();assert.match(document.querySelector('.ima-pending').textContent,/OLD 1/);
 const before=commitSnapshots.length;await render({storeId:'other',storeName:'Other'});assert.ok(commitSnapshots.length>before);assert.doesNotMatch(commitSnapshots[before],/OLD 1|120|75|Φορτωμένος μήνας/);
 await submit();assert.ok(document.querySelector('.ima-pending'));
 const apiBefore=commitSnapshots.length;await render({api:async()=>response('other')});assert.doesNotMatch(commitSnapshots[apiBefore],/OLD 1|120|75|Φορτωμένος μήνας/);
}));
