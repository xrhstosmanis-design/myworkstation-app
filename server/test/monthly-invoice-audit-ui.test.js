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
const previewResponse=(storeId='s',month='2026-10',patch={})=>({store:{id:storeId},period:{month,nominalLocalTime:month+'-31 23:59'},reportObservedAt:'2026-10-28T12:00:00Z',recipientObservedAt:'2026-10-28T12:00:01Z',separateSnapshots:true,previewOnly:true,readOnly:true,sendingEnabled:false,purposeConsent:'NOT_ASSUMED',reportType:'INVOICE_AUDIT',payload:{subject:'<img src=x onerror=PRIVATE> '+storeId+' '+month,body:'Πιθανό διπλό — Δεν έχει καταχωριστεί\nΌλοι οι μήνες: 75\n<script>PRIVATE</script>\nPREVIEW-'+storeId+'-'+month,coverage:{complete:true}},recipients:{available:true,verifiedCount:1,monthlyConsentEligibleCount:0,identities:[{maskedEmail:'a***@e***.test'}]},...patch});

async function mounted(run,{hub=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),names=['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent','localStorage','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 localStorage.setItem('activeModules','["INVENTORY"]');
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),module={exports:{}},require=createRequire(import.meta.url);
 new Function('require','module','exports',(hub?hubBuild:panelBuild).outputFiles[0].text)(require,module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];let unmounted=false,responder=async(url)=>response(url.searchParams.get('storeId'),url.searchParams.get('month'));
 const api=async(path,options)=>{const url=new URL(path,'https://isolated.invalid');calls.push({url,options});if(url.pathname==='/api/license/current')return{modules:[],activeModules:['INVENTORY']};return responder(url,options)};
 const props=hub?{api,stores:[{id:'s',name:'Selected'},{id:'other',name:'Other'}],activeStoreId:'s'}:{api,storeId:'s',storeName:'Selected',initialMonth:'2026-10'};
 const commitSnapshots=[];function ObservedPanel(p){return React.createElement(React.Profiler,{id:'invoice-audit',onRender:()=>commitSnapshots.push(document.querySelector('.invoice-month-audit')?.textContent||'')},React.createElement(module.exports.default,p))}
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

test('actual email preview is explicit read-only, escaped and visibly not authorized to send despite findings',async()=>mounted(async({setResponder,click,calls})=>{
 setResponder(async url=>previewResponse(url.searchParams.get('storeId'),url.searchParams.get('month')));assert.equal(calls.length,0);await click('Προεπισκόπηση μηνιαίου email');assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/api/reports/invoice-audit-email-preview');assert.deepEqual([...calls[0].url.searchParams.keys()].sort(),['includeSupplierComparison','month','storeId']);assert.equal(calls[0].options.method,undefined);
 const panel=document.querySelector('.ima-email-preview');assert.ok(panel);assert.match(panel.textContent,/Πιθανό διπλό/);assert.match(panel.textContent,/Όλοι οι μήνες: 75/);assert.match(panel.textContent,/αποστολή είναι απενεργοποιημένη/);assert.match(panel.textContent,/χωρίς έγκριση σκοπού/);assert.match(panel.textContent,/23:59/);assert.match(panel.textContent,/Χωριστή παρατήρηση παραληπτών/);assert.equal(panel.querySelector('img'),null);assert.equal(panel.querySelector('script'),null);assert.match(panel.querySelector('.ima-email-subject').textContent,/<img/);assert.match(panel.querySelector('.ima-email-body').textContent,/<script>/);assert.equal(panel.querySelector('a').href,'https://myworkstation-app.onrender.com/');
}));

test('preview masks the FIRST committed store/API/month mismatch and rejects stale callbacks',async()=>mounted(async({setResponder,click,render,changeMonth,commitSnapshots,act,calls})=>{
 setResponder(async url=>previewResponse(url.searchParams.get('storeId'),url.searchParams.get('month')));await click('Προεπισκόπηση μηνιαίου email');assert.match(document.querySelector('.ima-email-preview').textContent,/PREVIEW-s-2026-10/);
 let at=commitSnapshots.length;await render({storeId:'other'});assert.doesNotMatch(commitSnapshots[at],/PREVIEW-s|a\*\*\*/);await click('Προεπισκόπηση μηνιαίου email');at=commitSnapshots.length;await render({api:async()=>previewResponse('other')});assert.doesNotMatch(commitSnapshots[at],/PREVIEW-other|a\*\*\*/);
 await render({api:async()=>previewResponse('other')});await click('Προεπισκόπηση μηνιαίου email');at=commitSnapshots.length;await changeMonth('2026-09');assert.doesNotMatch(commitSnapshots[at],/PREVIEW-other|a\*\*\*/);assert.equal(document.querySelector('.ima-email-preview'),null);
 let release;await render({storeId:'s',api:async()=>new Promise(resolve=>{release=resolve})});await click('Προεπισκόπηση μηνιαίου email');await changeMonth('2026-08');await act(async()=>release(previewResponse('s','2026-09')));assert.equal(document.querySelector('.ima-email-preview'),null);
}));

test('preview shows unknown coverage and unavailable recipients and refuses mismatched server results',async()=>mounted(async({setResponder,click})=>{
 setResponder(async()=>previewResponse('s','2026-10',{payload:{subject:'Unknown',body:'Άγνωστο πλήθος',coverage:{complete:false}},recipients:{available:false,verifiedCount:null,identities:[]}}));await click('Προεπισκόπηση μηνιαίου email');assert.match(document.querySelector('.ima-email-preview').textContent,/κάλυψη είναι ελλιπής/);assert.match(document.querySelector('[aria-label="Σύνοψη παραληπτών προεπισκόπησης"]').textContent,/άγνωστο/);
 setResponder(async()=>previewResponse('foreign'));await click('Προεπισκόπηση μηνιαίου email');assert.equal(document.querySelector('.ima-email-preview'),null);assert.match(document.querySelector('[role=alert]').textContent,/δεν αντιστοιχεί/);
}));

test('preview unmount aborts an outstanding GET and cannot publish its late result',async()=>mounted(async({setResponder,click,calls,unmount,act})=>{
 let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await click('Προεπισκόπηση μηνιαίου email');const signal=calls[0].options.signal;await unmount();assert.equal(signal.aborted,true);await act(async()=>release(previewResponse()));assert.equal(document.getElementById('root').textContent,'');
}));

const financialSummary=patch=>({paid:0,financialPending:0,reviewRequired:0,notLinked:0,notApplicable:0,...patch});
const paymentPatch=(payment,patch={})=>({paymentCoverage:{available:true,reason:null},financialSummary:financialSummary(),items:[{...row,payment}],...patch});

test('paid draft is visibly settled while its independent purchase review stays in closed details',async()=>mounted(async({setResponder,submit,act,calls})=>{
 const payment={status:'PAID',paidCents:1234,remainingCents:0,overpaymentCents:0,paymentCount:1};
 setResponder(async()=>response('s','2026-10',paymentPatch(payment,{financialSummary:financialSummary({paid:1}),items:[{...row,categories:['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','POSSIBLE_DUPLICATE','IDENTITY_OR_LINK_REVIEW'],payment}]})));await submit();
 const invoice=document.querySelector('.ima-rows>li'),observation=invoice.querySelector('.ima-payment');
 assert.equal(observation.querySelector('b').textContent,'Εξοφλημένο');assert.match(observation.textContent,/12,34/);assert.equal(invoice.querySelectorAll('.ima-payment-paid').length,1);
 const details=invoice.querySelector('details.ima-workflow-review');assert.ok(details);assert.equal(details.open,false);assert.equal(details.querySelector('summary').textContent,'Έλεγχος καταχώρισης αγοράς');assert.match(details.textContent,/Δεν έχει καταχωριστεί/);assert.match(details.textContent,/Ανεβασμένο - προς έλεγχο/);await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
 const visibleTags=[...invoice.children].filter(element=>element.classList.contains('ima-tag')).map(element=>element.textContent);assert.deepEqual(visibleTags,['Πιθανό διπλό','Χρειάζεται ταυτοποίηση']);
 assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Εξοφλημένα1.*Οικονομικές εκκρεμότητες0/);assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Δεν έχουν καταχωριστεί120/);
}));

test('partial payment retains the real amount remaining and does not claim full settlement',async()=>mounted(async({setResponder,submit})=>{
 setResponder(async()=>response('s','2026-10',paymentPatch({status:'PARTIALLY_PAID',paidCents:434,remainingCents:800,overpaymentCents:0,paymentCount:1},{financialSummary:financialSummary({financialPending:1}),allClear:true})));await submit();
 const observation=document.querySelector('.ima-payment');assert.equal(observation.querySelector('b').textContent,'Μερική πληρωμή');assert.match(observation.textContent,/Καταγεγραμμένες πληρωμές: 4,34/);assert.match(observation.textContent,/Υπόλοιπο προς πληρωμή: 8,00/);assert.equal(document.querySelector('.ima-workflow-review'),null);assert.equal(document.querySelector('.ima-safe'),null);
 assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Οικονομικές εκκρεμότητες1/);
}));

test('missing ambiguous and unconfirmed payment observations remain unknown instead of a zero balance',async()=>mounted(async({setResponder,submit})=>{
 for(const status of ['NOT_LINKED','REVIEW_REQUIRED','UNCONFIRMED']){
  setResponder(async()=>response('s','2026-10',paymentPatch({status,paidCents:null,remainingCents:null,overpaymentCents:null,paymentCount:null},{financialSummary:financialSummary(status==='NOT_LINKED'?{notLinked:1}:{reviewRequired:1}),allClear:true})));await submit();
  const observation=document.querySelector('.ima-payment');assert.match(observation.textContent,/Το οικονομικό υπόλοιπο δεν έχει επιβεβαιωθεί/);assert.doesNotMatch(observation.textContent,/0,00|Εξοφλημένο/);assert.equal(document.querySelector('.ima-safe'),null);
 }
}));

test('unavailable payment coverage suppresses numeric financial totals and all-clear while preserving workflow',async()=>mounted(async({setResponder,submit})=>{
 setResponder(async()=>response('s','2026-10',paymentPatch({status:'UNAVAILABLE',paidCents:null,remainingCents:null},{paymentCoverage:{available:false,reason:'PAYMENT_SOURCE_UNAVAILABLE'},allClear:true})));await submit();
 assert.match(document.querySelector('.ima-financial').textContent,/οικονομικό υπόλοιπο είναι άγνωστο/);assert.equal(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]'),null);assert.ok(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]'));assert.equal(document.querySelector('.ima-safe'),null);
}));

test('credit notes have no payment badge and legacy responses preserve their existing display',async()=>mounted(async({setResponder,submit})=>{
 setResponder(async()=>response('s','2026-10',paymentPatch({status:'NOT_APPLICABLE',paidCents:null,remainingCents:null},{items:[{...row,documentType:'CREDIT_NOTE',payment:{status:'NOT_APPLICABLE'}}],financialSummary:financialSummary({notApplicable:1})})));await submit();assert.equal(document.querySelector('.ima-payment'),null);assert.match(document.querySelector('.ima-rows').textContent,/Πιστωτικό/);
 setResponder(async()=>response());await submit();assert.equal(document.querySelector('.ima-financial'),null);assert.equal(document.querySelector('.ima-payment'),null);assert.match(document.querySelector('.ima-rows').textContent,/Δεν έχει καταχωριστεί/);
}));

async function clickCounter(act,label,count){
 const button=[...document.querySelectorAll('.ima-summary button')].find(element=>element.textContent.replace(/\s+/g,' ').trim()===label+String(count)||element.textContent.replace(/\s+/g,' ').trim()===label+' '+String(count));
 assert.ok(button,'Missing clickable counter '+label+' '+count);
 await act(async()=>button.click());
}
const filterResponse=(url,patch={})=>response(url.searchParams.get('storeId'),url.searchParams.get('month'),{filter:url.searchParams.get('filter')||'ALL',matchedRecords:87,...patch});

test('all monthly summary counters request their whole-month server filter and keep global totals',async()=>mounted(async({setResponder,submit,act,calls})=>{
 const counts={logicalRecords:195,unposted:87,uploadedAwaitingReview:63,possibleDuplicates:2,identityReview:147,credits:11,inactive:0};
 const financial=financialSummary({paid:13,financialPending:1,reviewRequired:62,notLinked:108,notApplicable:11});
 setResponder(async url=>filterResponse(url,{summary:counts,financialSummary:financial,paymentCoverage:{available:true},items:[{...row,documentNumber:'ONLY-'+(url.searchParams.get('filter')||'ALL')}]}));
 await submit();assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 for(const[label,count,filter]of [['Δεν έχουν καταχωριστεί',87,'UNPOSTED_DOCUMENT'],['Ανεβασμένα προς έλεγχο',63,'UPLOADED_AWAITING_REVIEW'],['Πιθανά διπλά',2,'POSSIBLE_DUPLICATE'],['Ταυτοποίηση / συνδέσεις',147,'IDENTITY_OR_LINK_REVIEW'],['Πιστωτικά (χωριστή ένδειξη)',11,'CREDIT_NOTE'],['Εξοφλημένα',13,'PAID'],['Οικονομικές εκκρεμότητες',1,'FINANCIAL_PENDING'],['Συνδέσεις πληρωμής προς έλεγχο',62,'PAYMENT_REVIEW'],['Χωρίς σύνδεση πληρωμής',108,'PAYMENT_UNLINKED']]){
  await clickCounter(act,label,count);const request=calls.at(-1);assert.equal(request.url.searchParams.get('filter'),filter);assert.equal(request.url.searchParams.has('page'),false);assert.equal(request.options.method,undefined);assert.match(document.querySelector('.ima-rows').textContent,new RegExp('ONLY-'+filter));
  assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Δεν έχουν καταχωριστεί87/);
  assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Συνδέσεις πληρωμής προς έλεγχο62.*Χωρίς σύνδεση πληρωμής108/);
 }
 await clickCounter(act,'Εγγραφές ελέγχου',195);assert.equal(calls.at(-1).url.searchParams.has('filter'),false);assert.match(document.querySelector('.ima-rows').textContent,/ONLY-ALL/);
}));

test('unposted drilldown reaches the filtered second page and preserves its filter on refresh and clear',async()=>mounted(async({setResponder,submit,click,act,calls})=>{
 setResponder(async url=>{
  const filter=url.searchParams.get('filter'),page=url.searchParams.get('page');
  const items=filter?Array.from({length:page?37:50},(_,index)=>({...row,id:'doc:filtered-'+(page?index+50:index),documentNumber:'UNPOSTED-'+(page?index+51:index+1)})):[{...row,documentNumber:'UNFILTERED-POSTED'}];
  return filterResponse(url,{summary:{logicalRecords:195,unposted:87,uploadedAwaitingReview:63,possibleDuplicates:0,identityReview:147,credits:11,inactive:0},matchedRecords:filter?87:195,items,nextPage:filter&&!page?'filtered-page-2':null});
 });
 await submit();await clickCounter(act,'Δεν έχουν καταχωριστεί',87);assert.match(document.querySelector('.ima-filter-status').textContent,/Προβολή: Δεν έχουν καταχωριστεί.*87 εγγραφές/);assert.equal(document.querySelectorAll('.ima-rows')[0].children.length,50);assert.doesNotMatch(document.querySelector('.ima-rows').textContent,/UNFILTERED-POSTED/);
 await click('Επόμενη σελίδα');assert.equal(calls.at(-1).url.searchParams.get('filter'),'UNPOSTED_DOCUMENT');assert.equal(calls.at(-1).url.searchParams.get('page'),'filtered-page-2');assert.equal(document.querySelectorAll('.ima-rows')[0].children.length,37);assert.match(document.querySelector('.ima-rows').textContent,/UNPOSTED-87/);
 await click('Πρώτη σελίδα / Ανανέωση');assert.equal(calls.at(-1).url.searchParams.get('filter'),'UNPOSTED_DOCUMENT');assert.equal(calls.at(-1).url.searchParams.has('page'),false);assert.match(document.querySelector('.ima-rows').textContent,/UNPOSTED-1/);
 await click('Όλες οι εγγραφές');assert.equal(calls.at(-1).url.searchParams.has('filter'),false);assert.match(document.querySelector('.ima-rows').textContent,/UNFILTERED-POSTED/);
}));

test('zero-match filter shows an explicit empty result without treating global counts as zero',async()=>mounted(async({setResponder,submit,act,calls})=>{
 setResponder(async url=>filterResponse(url,{matchedRecords:url.searchParams.has('filter')?0:120,items:url.searchParams.has('filter')?[]:[row],nextPage:null}));await submit();await clickCounter(act,'Πιθανά διπλά',0);
 assert.equal(calls.at(-1).url.searchParams.get('filter'),'POSSIBLE_DUPLICATE');assert.equal(document.querySelector('.ima-rows').children.length,0);assert.match(document.querySelector('.invoice-month-audit').textContent,/Δεν υπάρχουν.*(?:παραστατικά|εγγραφές)/);assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Εγγραφές ελέγχου120/);
}));

test('filtered requests reject missing or mismatched server filter instead of displaying legacy all-row results',async()=>mounted(async({setResponder,submit,act})=>{
 for(const resultPatch of [{filter:undefined,matchedRecords:undefined},{filter:'PAID',matchedRecords:1}]){
  setResponder(async url=>url.searchParams.has('filter')?response('s','2026-10',{...resultPatch,items:[{...row,documentNumber:'WRONG-FILTER-DISCLOSURE'}]}):response());
  await submit();await clickCounter(act,'Δεν έχουν καταχωριστεί',120);assert.match(document.querySelector('[role=alert]').textContent,/δεν αντιστοιχεί/);assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/WRONG-FILTER-DISCLOSURE/);
 }
}));

test('new filter aborts and rejects older filter responses; month and store changes reset to all',async()=>mounted(async({setResponder,submit,click,changeMonth,render,act,calls})=>{
 setResponder(async url=>filterResponse(url));await submit();let release;
 setResponder(url=>url.searchParams.get('filter')==='UNPOSTED_DOCUMENT'?new Promise(resolve=>{release=resolve}):Promise.resolve(filterResponse(url,{items:[{...row,documentNumber:'CURRENT-ALL'}]})));
 await clickCounter(act,'Δεν έχουν καταχωριστεί',120);const oldSignal=calls.at(-1).options.signal;
 // Submit is a fresh explicit monthly audit. Its new ALL selection must not be
 // overwritten by an earlier filtered response even if that API ignores abort.
 await submit();assert.equal(calls.at(-1).url.searchParams.has('filter'),false);assert.equal(oldSignal.aborted,true);await act(async()=>release(response('s','2026-10',{filter:'UNPOSTED_DOCUMENT',matchedRecords:1,items:[{...row,documentNumber:'LATE-FILTER'}]})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/LATE-FILTER/);
 setResponder(async url=>filterResponse(url));await clickCounter(act,'Δεν έχουν καταχωριστεί',120);await changeMonth('2026-09');await submit();assert.equal(calls.at(-1).url.searchParams.get('month'),'2026-09');assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 await clickCounter(act,'Δεν έχουν καταχωριστεί',120);await render({storeId:'other',storeName:'Other'});await submit();assert.equal(calls.at(-1).url.searchParams.get('storeId'),'other');assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 await clickCounter(act,'Δεν έχουν καταχωριστεί',120);const replacementCalls=[];await render({api:async path=>{const url=new URL(path,'https://isolated.invalid');replacementCalls.push(url);return filterResponse(url)}});await submit();assert.equal(replacementCalls.at(-1).searchParams.get('storeId'),'other');assert.equal(replacementCalls.at(-1).searchParams.has('filter'),false);
}));
