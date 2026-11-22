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
const response=(storeId='s',month='2026-10',patch={})=>({store:{id:storeId,name:'Synthetic'},period:{month},asOf:'2026-10-28T12:00:00Z',coverage:{complete:true,unavailable:[],limited:[]},summary:{logicalRecords:120,unposted:120,purchaseLinkReview:0,uploadedAwaitingReview:0,possibleDuplicates:0,identityReview:0,credits:0,inactive:0},items:[row],nextPage:'next-page',pendingOriginals:{available:true,period:'ALL_MONTHS',counts:{total:75,missingOriginal:60,uploadedAwaitingReview:10,reviewRequired:5},items:[{id:'p',documentNumber:'OLD 1',documentDate:'2025-01-01',supplierName:'Old supplier',amount:1,status:'AWAITING_INVOICE'}],truncated:true},allClear:false,readOnly:true,immutableSnapshot:false,...patch});
const previewResponse=(storeId='s',month='2026-10',patch={})=>({store:{id:storeId},period:{month,nominalLocalTime:month+'-31 23:59'},reportObservedAt:'2026-10-28T12:00:00Z',recipientObservedAt:'2026-10-28T12:00:01Z',separateSnapshots:true,previewOnly:true,readOnly:true,sendingEnabled:false,purposeConsent:'NOT_ASSUMED',reportType:'INVOICE_AUDIT',payload:{subject:'<img src=x onerror=PRIVATE> '+storeId+' '+month,body:'Πιθανό διπλό — Πρόχειρη αγορά\nΌλοι οι μήνες: 75\n<script>PRIVATE</script>\nPREVIEW-'+storeId+'-'+month,coverage:{complete:true}},recipients:{available:true,verifiedCount:1,monthlyConsentEligibleCount:0,identities:[{maskedEmail:'a***@e***.test'}]},...patch});

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
 const details=invoice.querySelector('details.ima-workflow-review');assert.ok(details);assert.equal(details.open,false);assert.equal(details.querySelector('summary').textContent,'Έλεγχος καταχώρισης αγοράς');assert.match(details.textContent,/Πρόχειρη αγορά/);assert.match(details.textContent,/Ανεβασμένο - προς έλεγχο/);await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
 const visibleTags=[...invoice.children].filter(element=>element.classList.contains('ima-tag')).map(element=>element.textContent);assert.deepEqual(visibleTags,['Πιθανό διπλό','Χρειάζεται ταυτοποίηση']);
 assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Εξοφλημένα1.*Οικονομικές εκκρεμότητες0/);assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Πρόχειρες αγορές120/);
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
 setResponder(async()=>response());await submit();assert.equal(document.querySelector('.ima-financial'),null);assert.equal(document.querySelector('.ima-payment'),null);assert.match(document.querySelector('.ima-rows').textContent,/Πρόχειρη αγορά/);
}));

async function clickCounter(act,label,count){
 const button=[...document.querySelectorAll('.ima-summary button')].find(element=>element.textContent.replace(/\s+/g,' ').trim()===label+String(count)||element.textContent.replace(/\s+/g,' ').trim()===label+' '+String(count));
 assert.ok(button,'Missing clickable counter '+label+' '+count);
 await act(async()=>button.click());
}
const filterResponse=(url,patch={})=>response(url.searchParams.get('storeId'),url.searchParams.get('month'),{filter:url.searchParams.get('filter')||'ALL',matchedRecords:87,...patch});

test('all monthly summary counters request their whole-month server filter and keep global totals',async()=>mounted(async({setResponder,submit,act,calls})=>{
 const counts={logicalRecords:195,unposted:87,purchaseLinkReview:0,uploadedAwaitingReview:63,possibleDuplicates:2,identityReview:147,credits:11,inactive:0};
 const financial=financialSummary({paid:13,financialPending:1,reviewRequired:62,notLinked:108,notApplicable:11});
 setResponder(async url=>filterResponse(url,{summary:counts,financialSummary:financial,paymentCoverage:{available:true},items:[{...row,documentNumber:'ONLY-'+(url.searchParams.get('filter')||'ALL')}]}));
 await submit();assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 for(const[label,count,filter]of [['Πρόχειρες αγορές',87,'UNPOSTED_DOCUMENT'],['Ανεβασμένα προς έλεγχο',63,'UPLOADED_AWAITING_REVIEW'],['Πιθανά διπλά',2,'POSSIBLE_DUPLICATE'],['Ταυτοποίηση / συνδέσεις',147,'IDENTITY_OR_LINK_REVIEW'],['Πιστωτικά (χωριστή ένδειξη)',11,'CREDIT_NOTE'],['Εξοφλημένα',13,'PAID'],['Οικονομικές εκκρεμότητες',1,'FINANCIAL_PENDING'],['Συνδέσεις πληρωμής προς έλεγχο',62,'PAYMENT_REVIEW'],['Χωρίς σύνδεση πληρωμής',108,'PAYMENT_UNLINKED']]){
  await clickCounter(act,label,count);const request=calls.at(-1);assert.equal(request.url.searchParams.get('filter'),filter);assert.equal(request.url.searchParams.has('page'),false);assert.equal(request.options.method,undefined);assert.match(document.querySelector('.ima-rows').textContent,new RegExp('ONLY-'+filter));
  assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Πρόχειρες αγορές87/);
  assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Συνδέσεις πληρωμής προς έλεγχο62.*Χωρίς σύνδεση πληρωμής108/);
 }
 await clickCounter(act,'Εγγραφές ελέγχου',195);assert.equal(calls.at(-1).url.searchParams.has('filter'),false);assert.match(document.querySelector('.ima-rows').textContent,/ONLY-ALL/);
}));

test('unposted drilldown reaches the filtered second page and preserves its filter on refresh and clear',async()=>mounted(async({setResponder,submit,click,act,calls})=>{
 setResponder(async url=>{
  const filter=url.searchParams.get('filter'),page=url.searchParams.get('page');
  const items=filter?Array.from({length:page?37:50},(_,index)=>({...row,id:'doc:filtered-'+(page?index+50:index),documentNumber:'UNPOSTED-'+(page?index+51:index+1)})):[{...row,documentNumber:'UNFILTERED-POSTED'}];
  return filterResponse(url,{summary:{logicalRecords:195,unposted:87,purchaseLinkReview:0,uploadedAwaitingReview:63,possibleDuplicates:0,identityReview:147,credits:11,inactive:0},matchedRecords:filter?87:195,items,nextPage:filter&&!page?'filtered-page-2':null});
 });
 await submit();await clickCounter(act,'Πρόχειρες αγορές',87);assert.match(document.querySelector('.ima-filter-status').textContent,/Προβολή: Πρόχειρες αγορές.*87 εγγραφές/);assert.equal(document.querySelectorAll('.ima-rows')[0].children.length,50);assert.doesNotMatch(document.querySelector('.ima-rows').textContent,/UNFILTERED-POSTED/);
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
  await submit();await clickCounter(act,'Πρόχειρες αγορές',120);assert.match(document.querySelector('[role=alert]').textContent,/δεν αντιστοιχεί/);assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/WRONG-FILTER-DISCLOSURE/);
 }
}));

test('new filter aborts and rejects older filter responses; month and store changes reset to all',async()=>mounted(async({setResponder,submit,click,changeMonth,render,act,calls})=>{
 setResponder(async url=>filterResponse(url));await submit();let release;
 setResponder(url=>url.searchParams.get('filter')==='UNPOSTED_DOCUMENT'?new Promise(resolve=>{release=resolve}):Promise.resolve(filterResponse(url,{items:[{...row,documentNumber:'CURRENT-ALL'}]})));
 await clickCounter(act,'Πρόχειρες αγορές',120);const oldSignal=calls.at(-1).options.signal;
 // Submit is a fresh explicit monthly audit. Its new ALL selection must not be
 // overwritten by an earlier filtered response even if that API ignores abort.
 await submit();assert.equal(calls.at(-1).url.searchParams.has('filter'),false);assert.equal(oldSignal.aborted,true);await act(async()=>release(response('s','2026-10',{filter:'UNPOSTED_DOCUMENT',matchedRecords:1,items:[{...row,documentNumber:'LATE-FILTER'}]})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/LATE-FILTER/);
 setResponder(async url=>filterResponse(url));await clickCounter(act,'Πρόχειρες αγορές',120);await changeMonth('2026-09');await submit();assert.equal(calls.at(-1).url.searchParams.get('month'),'2026-09');assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 await clickCounter(act,'Πρόχειρες αγορές',120);await render({storeId:'other',storeName:'Other'});await submit();assert.equal(calls.at(-1).url.searchParams.get('storeId'),'other');assert.equal(calls.at(-1).url.searchParams.has('filter'),false);
 await clickCounter(act,'Πρόχειρες αγορές',120);const replacementCalls=[];await render({api:async path=>{const url=new URL(path,'https://isolated.invalid');replacementCalls.push(url);return filterResponse(url)}});await submit();assert.equal(replacementCalls.at(-1).searchParams.get('storeId'),'other');assert.equal(replacementCalls.at(-1).searchParams.has('filter'),false);
}));

const recordResponse=(storeId='s',month='2026-10',item=row,patch={})=>({store:{id:storeId},period:{month},readOnly:true,item,sources:{documents:[{id:'saved-document',documentNumber:'SAVED 2026',issueDay:'2026-10-02',totalGross:'12.3400',status:'APPROVED',supplierName:'Saved supplier'}],orders:[],inbound:[],inbox:[]},relatedOrders:[],...patch});

test('invoice number opens only the existing scoped draft or registered order using inspection navigation',async()=>mounted(async({render,setResponder,submit,click,calls})=>{
 const opened=[];await render({onOpenInvoiceOrder:detail=>opened.push(detail)});
 for(const status of ['UNPOSTED','POSTED']){
  setResponder(async()=>response('s','2026-10',{items:[{...row,status,documentNumber:'EXISTING '+status,openTarget:{kind:'ORDER',orderId:'same-existing-order',storeId:'s',basis:'EXPLICIT'}}]}));
  await submit();const before=calls.length;await click('EXISTING '+status);assert.equal(calls.length,before);assert.deepEqual(opened.at(-1),{orderId:'same-existing-order',storeId:'s',navigationOnly:true,readOnly:true,monthlyAudit:true,basis:'EXPLICIT'});
 }
 assert.equal(opened.length,2);assert.ok(calls.every(call=>call.options.method===undefined));
}));

test('header candidate navigation is explicitly uncertain and a foreign or legacy target cannot open',async()=>mounted(async({render,setResponder,submit,click,calls})=>{
 const opened=[];await render({onOpenInvoiceOrder:detail=>opened.push(detail)});
 setResponder(async()=>response('s','2026-10',{items:[{...row,documentNumber:'CANDIDATE 1',openTarget:{kind:'ORDER',orderId:'existing-candidate',storeId:'s',basis:'HEADER_CANDIDATE'}}]}));await submit();assert.match(document.querySelector('.ima-rows').textContent,/Πιθανή αντιστοίχιση.*χρειάζεται σύγκριση/);const button=document.querySelector('.ima-record-open');assert.match(button.title,/Πιθανή αντιστοίχιση/);await click('CANDIDATE 1');assert.equal(opened.length,1);assert.equal(opened[0].orderId,'existing-candidate');assert.match(document.querySelector('[role=status]').textContent,/Η σύνδεση με αυτή την εγγραφή δεν έχει επιβεβαιωθεί/);
 for(const openTarget of [undefined,{kind:'ORDER',orderId:'foreign',storeId:'other',basis:'EXPLICIT'},{kind:'ORDER',orderId:'unknown-proof',storeId:'s',basis:'AMOUNT_ONLY'}]){
  setResponder(async()=>response('s','2026-10',{items:[{...row,openTarget}]}));await submit();assert.equal(document.querySelector('.ima-record-open').disabled,true);
 }
 assert.equal(opened.length,1);assert.ok(calls.every(call=>call.options.method===undefined));
}));

test('unlinked myDATA number loads only its existing saved source preview and can compare an explicitly offered candidate',async()=>mounted(async({render,setResponder,submit,click,calls})=>{
 const item={...row,documentNumber:'MYDATA 1',categories:['PURCHASE_LINK_REVIEW'],purchaseReview:{state:'LINK_REVIEW',reason:'Δεν υπάρχει επιβεβαιωμένη σύνδεση αγοράς.'},openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};const opened=[];await render({onOpenInvoiceOrder:detail=>opened.push(detail)});
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item,{sources:{documents:[],orders:[],inbound:[{id:'existing-mydata',series:'MYDATA',documentNumber:'1',issueDay:'2026-10-02',totalGross:'12.3400',status:'RECEIVED'}],inbox:[{id:'existing-inbox',status:'IN_REVIEW'}]},relatedOrders:[{orderId:'candidate',storeId:'s',basis:'HEADER_CANDIDATE'},{orderId:'foreign',storeId:'other',basis:'EXPLICIT'}]}):response('s','2026-10',{items:[item]}));
 await submit();await click('MYDATA 1');const request=calls.at(-1);assert.equal(request.url.pathname,'/api/reports/invoice-month-audit/record');assert.deepEqual([...request.url.searchParams.entries()].sort(),[['id',row.id],['month','2026-10'],['storeId','s']]);assert.equal(request.options.method,undefined);
 const dialog=document.querySelector('[role=dialog]');assert.ok(dialog);assert.match(dialog.textContent,/Δεν δημιουργείται νέο πρόχειρο/);assert.match(dialog.textContent,/Παραλαβές myDATA.*MYDATA 1/);assert.match(dialog.textContent,/Θυρίδα.*Σε έλεγχο/);assert.equal(dialog.querySelectorAll('button').length,2);assert.equal(opened.length,0);
 await click('Σύγκριση με πιθανή υπάρχουσα αγορά');assert.equal(opened.length,1);assert.deepEqual(opened[0],{orderId:'candidate',storeId:'s',navigationOnly:true,readOnly:true,monthlyAudit:true,basis:'HEADER_CANDIDATE'});assert.equal(calls.length,2);
}));

test('record preview binds the loaded fingerprint and preserves a stale-source error without a replacement draft',async()=>mounted(async({setResponder,submit,click,calls})=>{
 const item={...row,documentNumber:'STALE SOURCE',openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}},fingerprint='a'.repeat(64);
 setResponder(async url=>{if(url.pathname.endsWith('/record'))throw Error('Τα στοιχεία άλλαξαν. Εκτέλεσε νέο έλεγχο.');return response('s','2026-10',{fingerprint,items:[item]})});await submit();await click('STALE SOURCE');assert.equal(calls.at(-1).url.searchParams.get('fingerprint'),fingerprint);assert.match(document.querySelector('[role=dialog] [role=alert]').textContent,/στοιχεία άλλαξαν/);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.options.method===undefined));
}));

test('registered standalone document preview shows actual saved headers without inventing an editable purchase',async()=>mounted(async({setResponder,submit,click,calls})=>{
 const item={...row,status:'POSTED',documentNumber:'STANDALONE 1',categories:[],openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item):response('s','2026-10',{items:[item]}));await submit();await click('STANDALONE 1');const dialog=document.querySelector('[role=dialog]');assert.match(dialog.textContent,/SAVED 2026.*2026-10-02.*12,3400 €.*Εγκεκριμένο/);assert.equal(dialog.querySelectorAll('button').length,1);assert.equal(calls.length,2);await click('Κλείσιμο παραστατικού');assert.equal(document.querySelector('[role=dialog]'),null);
}));

test('record preview rejects store month id and read-only mismatches rather than exposing another saved record',async()=>mounted(async({setResponder,submit,click})=>{
 const item={...row,documentNumber:'PREVIEW 1',openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};
 for(const patch of [{store:{id:'other'}},{period:{month:'2026-09'}},{item:{id:'different',documentNumber:'WRONG-RECORD'}},{readOnly:false},{sources:{documents:[],orders:[],inbound:[]}}]){
  setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item,patch):response('s','2026-10',{items:[item]}));await submit();await click('PREVIEW 1');assert.match(document.querySelector('[role=dialog] [role=alert]').textContent,/δεν αντιστοιχεί/);assert.doesNotMatch(document.querySelector('[role=dialog]').textContent,/WRONG-RECORD|SAVED 2026/);
 }
}));

test('record preview masks the first changed scope render and discards responses after month store API changes and close',async()=>mounted(async({setResponder,render,submit,click,changeMonth,act,calls,commitSnapshots})=>{
 const item={...row,documentNumber:'PREVIEW 2',openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};let release;
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item):response('s','2026-10',{items:[item]}));await submit();await click('PREVIEW 2');assert.match(document.querySelector('[role=dialog]').textContent,/SAVED 2026/);
 let before=commitSnapshots.length;await render({storeId:'other'});assert.doesNotMatch(commitSnapshots[before],/SAVED 2026/);await render({storeId:'s'});await submit();
 for(const change of ['month','close','store','api']){
  setResponder(url=>url.pathname.endsWith('/record')?new Promise(resolve=>{release=resolve}):Promise.resolve(response('s','2026-10',{items:[item]})));await click('PREVIEW 2');const signal=calls.at(-1).options.signal;
  if(change==='month')await changeMonth('2026-09');else if(change==='close')await click('Κλείσιμο παραστατικού');else if(change==='store')await render({storeId:'other'});else await render({api:async()=>response('s','2026-10',{items:[item]})});
  assert.equal(signal.aborted,true);await act(async()=>release(recordResponse('s','2026-10',item,{item:{...item,documentNumber:'LATE-SAVED-RECORD'}})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/LATE-SAVED-RECORD/);
  if(change==='month')await changeMonth('2026-10');else if(change==='store')await render({storeId:'s'});else if(change==='api')break;
  await submit();
 }
}));

test('credit merged and unlinked records have a separate purchase-link counter without claiming missing purchases',async()=>mounted(async({setResponder,submit,act,calls})=>{
 const reviewRows=[{...row,id:'credit',documentType:'CREDIT_NOTE',documentNumber:'MERGED CREDIT',categories:['PURCHASE_LINK_REVIEW'],purchaseReview:{state:'MERGED_REVIEW',reason:'Συγχωνευμένη εγγραφή προς έλεγχο.'},payment:{status:'NOT_APPLICABLE'}},{...row,id:'mydata',documentNumber:'UNLINKED MYDATA',categories:['PURCHASE_LINK_REVIEW'],purchaseReview:{state:'LINK_REVIEW',reason:'Η σύνδεση δεν έχει επιβεβαιωθεί.'}}];
 setResponder(async url=>filterResponse(url,{summary:{logicalRecords:35,unposted:10,purchaseLinkReview:25,uploadedAwaitingReview:10,possibleDuplicates:2,identityReview:25,credits:7,inactive:0},matchedRecords:25,items:reviewRows,nextPage:null}));await submit();assert.match(document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,/Πρόχειρες αγορές10.*Προς αντιστοίχιση \/ έλεγχο25/);assert.doesNotMatch(document.querySelector('.ima-rows').textContent,/Δεν έχει καταχωριστεί|Δεν έχουν καταχωριστεί|Πρόχειρη αγορά/);await clickCounter(act,'Προς αντιστοίχιση / έλεγχο',25);assert.equal(calls.at(-1).url.searchParams.get('filter'),'PURCHASE_LINK_REVIEW');
}));

test('CommerceHub sends invoice navigation from its own selected hub with existing ids and inspection flags',async()=>mounted(async({setResponder,submit,click,calls,act})=>{
 setResponder(async url=>response(url.searchParams.get('storeId'),url.searchParams.get('month'),{items:[{...row,documentNumber:'HUB INVOICE',openTarget:{kind:'ORDER',orderId:'existing-hub-order',storeId:'s',basis:'EXPLICIT'}}]}));const events=[],handler=event=>events.push({detail:event.detail,hub:event.target.closest('.commerce-hub')});document.addEventListener('purchase-orders:open',handler);
 try{await click('Έλεγχος τιμολογίων μήνα');await submit();await click('HUB INVOICE');assert.equal(events.length,1);assert.ok(events[0].hub);assert.deepEqual(events[0].detail,{orderId:'existing-hub-order',storeId:'s',navigationOnly:true,readOnly:true,monthlyAudit:true,basis:'EXPLICIT'});assert.ok(calls.every(call=>call.options?.method===undefined));}finally{document.removeEventListener('purchase-orders:open',handler)}
},{hub:true}));

test('legacy purchase count remains neutral when the new review split is absent',async()=>mounted(async({setResponder,submit})=>{
 const legacy=response();delete legacy.summary.purchaseLinkReview;setResponder(async()=>legacy);await submit();const summary=document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]');assert.match(summary.textContent,/Καταχώριση προς έλεγχο120/);assert.doesNotMatch(summary.textContent,/Πρόχειρες αγορές|Προς αντιστοίχιση \/ έλεγχο/);assert.match(document.querySelector('.ima-rows').textContent,/Καταχώριση προς έλεγχο/);assert.equal(document.querySelector('.ima-record-open').disabled,true);
}));

test('saved preview lines preserve actual decimal fields and escape descriptions without implying source completeness',async()=>mounted(async({setResponder,submit,click})=>{
 const item={...row,documentNumber:'SAVED LINES',openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};
 const lines=[{id:'saved-line',purchaseDocumentId:'saved-document',description:'<img src=x> saved item',quantity:'2.0000',unit:'PACKAGE',unitCost:'4.1234',netAmount:'8.2468',vatRate:'24.0000',vatAmount:'1.979232',grossAmount:'10.226032'}];
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item,{documentLines:lines,documentLinesCoverage:{available:true,truncated:true,limit:500}}):response('s','2026-10',{items:[item]}));await submit();await click('SAVED LINES');let saved=document.querySelector('[aria-label="Αποθηκευμένες γραμμές παραστατικού"]');assert.ok(saved);assert.match(saved.textContent,/πρώτες 500/);assert.match(saved.textContent,/<img src=x> saved item2.0000PACKAGE4.12348.246824.00001.97923210.226032/);assert.equal(saved.querySelector('img'),null);
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',item,{documentLines:[],documentLinesCoverage:{available:false,truncated:false,limit:500}}):response('s','2026-10',{items:[item]}));await click('SAVED LINES');assert.match(document.querySelector('[role=dialog]').textContent,/Οι αποθηκευμένες γραμμές δεν είναι διαθέσιμες/);assert.equal(document.querySelector('[role=dialog] table'),null);
}));

test('opening a saved preview scrolls and focuses its current section for loading data and error without cross-scope focus',async()=>mounted(async({render,setResponder,submit,click,act})=>{
 const scrolled=[],prototype=window.HTMLElement.prototype,previousScroll=prototype.scrollIntoView;
 prototype.scrollIntoView=function(options){scrolled.push({element:this,options})};
 try{
  await render({onOpenInvoiceOrder:()=>{}});
  const candidate={...row,documentNumber:'CANDIDATE NOTICE',openTarget:{kind:'ORDER',orderId:'candidate',storeId:'s',basis:'HEADER_CANDIDATE'}};
  setResponder(async()=>response('s','2026-10',{items:[candidate]}));await submit();await click('CANDIDATE NOTICE');assert.equal(scrolled.length,0);assert.equal(document.querySelector('.ima-record-preview'),null);
  const item={...row,documentNumber:'PREVIEW BELOW LIST',openTarget:{kind:'PREVIEW',rowId:row.id,storeId:'s'}};let release;
  setResponder(url=>url.pathname.endsWith('/record')?new Promise(resolve=>{release=resolve}):Promise.resolve(response('s','2026-10',{items:[item]})));await submit();await click('PREVIEW BELOW LIST');
  let preview=document.querySelector('.ima-record-preview');assert.ok(preview);assert.equal(scrolled.length,1);assert.equal(scrolled.at(-1).element,preview);assert.deepEqual(scrolled.at(-1).options,{block:'start'});assert.equal(document.activeElement,preview);assert.match(preview.textContent,/Φόρτωση παραστατικού/);
  await act(async()=>release(recordResponse('s','2026-10',item)));preview=document.querySelector('.ima-record-preview');assert.equal(scrolled.length,2);assert.equal(document.activeElement,preview);assert.match(preview.textContent,/SAVED 2026/);
  // A second request is another opening even while an existing preview is
  // already in the DOM. Its loading phase must bring the user back again.
  await click('PREVIEW BELOW LIST');assert.equal(scrolled.length,3);assert.equal(document.activeElement,document.querySelector('.ima-record-preview'));
  const before=scrolled.length;await render({storeId:'other'});const monthInput=document.querySelector('input[type=month]');monthInput.focus();await act(async()=>release(recordResponse('s','2026-10',item)));assert.equal(scrolled.length,before);assert.equal(document.activeElement,monthInput);assert.equal(document.querySelector('.ima-record-preview'),null);
  await render({storeId:'s'});setResponder(async url=>{if(url.pathname.endsWith('/record'))throw Error('Saved preview unavailable');return response('s','2026-10',{items:[item]})});await submit();await click('PREVIEW BELOW LIST');preview=document.querySelector('.ima-record-preview');assert.equal(document.activeElement,preview);assert.match(preview.textContent,/Saved preview unavailable/);assert.equal(scrolled.at(-1).element,preview);
 }finally{if(previousScroll)prototype.scrollIntoView=previousScroll;else delete prototype.scrollIntoView}
}));

const automaticMatch=patch=>({inboundId:'existing-inbound',inboxId:'existing-inbox',mark:'400000000000001',canonicalItemId:row.id,canonicalDocumentId:'existing-document',canonicalOrderId:null,basis:'UNIQUE_STORED_IDENTITY',documentNumber:'OFFICIAL 12',issueDay:'2026-10-02',totalGross:'12.34',canonicalTotalGross:'12.3400',...patch});
const canonicalPaymentProof=patch=>({itemId:row.id,transactionId:'existing-payment',canonicalDocumentId:'existing-document',canonicalOrderId:'existing-order',inboxId:'existing-inbox',mark:'400000000000001',recordedInvoiceDocumentNumber:'OLD OCR 0012',effectiveInvoiceDocumentNumber:'OFFICIAL 12',paidCents:1234,invoiceCents:1234,paymentDifferenceCents:0,requiresPaymentReview:false,...patch});

test('automatic correlation and formal payment evidence are compact escaped read-only details without extra requests on expand',async()=>mounted(async({setResponder,submit,act,calls})=>{
 const item={...row,status:'POSTED',categories:[],automaticMatches:[automaticMatch({mark:'<img src=x onerror=SECRET>',documentNumber:'<script>OFFICIAL</script>'})],canonicalPaymentProofs:[canonicalPaymentProof({recordedInvoiceDocumentNumber:'<img src=old>',effectiveInvoiceDocumentNumber:'<script>new</script>'})],payment:{status:'NOT_LINKED',paidCents:null,remainingCents:null}};
 setResponder(async()=>response('s','2026-10',{items:[item]}));await submit();const invoice=document.querySelector('.ima-rows>li'),automatic=invoice.querySelector('.ima-automatic-match'),payment=invoice.querySelector('.ima-canonical-payment-proof');assert.ok(automatic);assert.ok(payment);assert.equal(automatic.open,false);assert.equal(payment.open,false);assert.equal(automatic.querySelector('summary').textContent,'Αυτόματη συσχέτιση');assert.match(automatic.textContent,/στη μηνιαία προβολή/);assert.match(automatic.textContent,/δεν έγινε μόνιμη συγχώνευση/);assert.match(automatic.textContent,/<img src=x onerror=SECRET>/);assert.match(payment.textContent,/<img src=old> → Αριθμός τιμολογίου: <script>new<\/script>/);assert.match(payment.textContent,/Δεν δημιουργήθηκε νέα πληρωμή/);assert.equal(invoice.querySelectorAll('img,script').length,0);
 const before=calls.length;await act(async()=>automatic.querySelector('summary').click());await act(async()=>payment.querySelector('summary').click());assert.equal(automatic.open,true);assert.equal(payment.open,true);assert.equal(calls.length,before);assert.equal(invoice.querySelector('.ima-payment-paid'),null);assert.match(invoice.querySelector('.ima-payment').textContent,/Χωρίς επιβεβαιωμένη σύνδεση πληρωμής/);
}));

test('payment proof exposes the actual difference while the observer alone determines partial extra or unconfirmed status',async()=>mounted(async({setResponder,submit})=>{
 for(const [status,paid,difference,label,detail]of [['PARTIALLY_PAID',1000,-234,'Μερική πληρωμή','Διαφορά μέχρι την αξία τιμολογίου: 2,34'],['OVERPAID',1334,100,'Υπερπληρωμή','Επιπλέον καταγεγραμμένο ποσό: 1,00'],['UNCONFIRMED',1234,0,'Πληρωμή προς επιβεβαίωση',null]]){
  const item={...row,canonicalPaymentProofs:[canonicalPaymentProof({paidCents:paid,paymentDifferenceCents:difference,requiresPaymentReview:true})],payment:{status,paidCents:paid,remainingCents:Math.max(0,-difference),overpaymentCents:Math.max(0,difference)}};
  setResponder(async()=>response('s','2026-10',{items:[item]}));await submit();const invoice=document.querySelector('.ima-rows>li'),proof=invoice.querySelector('.ima-canonical-payment-proof');assert.match(invoice.querySelector('.ima-payment b').textContent,new RegExp(label));assert.equal(invoice.querySelector('.ima-payment-paid'),null);assert.match(proof.textContent,/Αξία τιμολογίου: 12,34/);assert.match(proof.textContent,/παραμένει προς έλεγχο/);assert.doesNotMatch(proof.textContent,/Εξοφλημένο|νέα πληρωμή.*δημιουργήθηκε/);if(detail)assert.ok(proof.textContent.includes(detail));else assert.doesNotMatch(proof.textContent,/Επιπλέον καταγεγραμμένο ποσό|Διαφορά μέχρι/);
 }
}));

test('automatic and payment proof metadata follow first-render scope masking and late month response guards with legacy fallback',async()=>mounted(async({setResponder,submit,render,changeMonth,act,commitSnapshots})=>{
 const item={...row,automaticMatches:[automaticMatch({mark:'SCOPE-SECRET-MARK'})],canonicalPaymentProofs:[canonicalPaymentProof({recordedInvoiceDocumentNumber:'SCOPE-SECRET-PAYMENT'})]};
 setResponder(async()=>response('s','2026-10',{items:[item]}));await submit();assert.match(document.querySelector('.ima-rows').textContent,/SCOPE-SECRET-MARK/);let at=commitSnapshots.length;await render({storeId:'other'});assert.doesNotMatch(commitSnapshots[at],/SCOPE-SECRET/);
 await render({storeId:'s'});await submit();await changeMonth('2026-09');assert.match(document.querySelector('.invoice-month-audit').textContent,/αφορούν ακόμη τον μήνα 2026-10/);let release;setResponder(()=>new Promise(resolve=>{release=resolve}));await submit();await changeMonth('2026-08');await act(async()=>release(response('s','2026-09',{items:[{...item,automaticMatches:[automaticMatch({mark:'LATE-PROOF'})]}]})));assert.doesNotMatch(document.querySelector('.invoice-month-audit').textContent,/LATE-PROOF/);
 at=commitSnapshots.length;await render({api:async()=>response('s','2026-08')});assert.doesNotMatch(commitSnapshots[at],/SCOPE-SECRET/);await submit();assert.equal(document.querySelector('.ima-automatic-match'),null);assert.equal(document.querySelector('.ima-canonical-payment-proof'),null);
}));

test('proof belonging to another canonical invoice or an unverified correlation cannot label the current row',async()=>mounted(async({setResponder,submit})=>{
 for(const patch of [{automaticMatches:[automaticMatch({canonicalItemId:'doc:other'})],canonicalPaymentProofs:[canonicalPaymentProof({itemId:'doc:other'})]},{automaticMatches:[automaticMatch({basis:'HEADER_CANDIDATE'})],canonicalPaymentProofs:[]}]){
  setResponder(async()=>response('s','2026-10',{items:[{...row,...patch}]}));await submit();assert.equal(document.querySelector('.ima-automatic-match'),null);assert.equal(document.querySelector('.ima-canonical-payment-proof'),null);
 }
}));

test('automatic review exposes currency pointer and ambiguous-source reasons in closed read-only details without a payment judgment',async()=>mounted(async({setResponder,submit,act,calls})=>{
 for(const [code,message]of [['UNSUPPORTED_CURRENCY','Το νόμισμα δεν υποστηρίζεται'],['EXISTING_OR_DANGLING_LINK','Υπάρχει παλιά ή ελλιπής σύνδεση'],['MULTIPLE_CANONICAL_FAMILIES','περισσότερα από ένα υπάρχοντα παραστατικά']]){
  setResponder(async()=>response('s','2026-10',{items:[{...row,automaticReview:[{itemId:row.id,code}],payment:{status:'NOT_LINKED',paidCents:null,remainingCents:null}}]}));await submit();const details=document.querySelector('.ima-automatic-review');assert.ok(details);assert.equal(details.open,false);assert.equal(details.querySelector('summary').textContent,'Γιατί δεν έγινε αυτόματη αντιστοίχιση');assert.ok(details.textContent.includes(message));assert.doesNotMatch(details.textContent,/απλήρωτο|Εξοφλημένο|πρέπει να πληρωθεί|νέα πληρωμή/);assert.equal(details.querySelectorAll('button,a,input').length,0);const before=calls.length;await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);assert.equal(calls.length,before);assert.match(document.querySelector('.ima-payment').textContent,/Χωρίς επιβεβαιωμένη σύνδεση πληρωμής/);await act(async()=>details.querySelector('summary').click());assert.equal(details.open,false);assert.equal(calls.length,before);
 }
}));

test('automatic review is scoped to its own invoice, hides absent legacy data and never renders an unknown raw reason',async()=>mounted(async({setResponder,submit})=>{
 for(const automaticReview of [undefined,[],[{itemId:'doc:other',code:'UNSUPPORTED_CURRENCY'}]]){setResponder(async()=>response('s','2026-10',{items:[{...row,automaticReview}]}));await submit();assert.equal(document.querySelector('.ima-automatic-review'),null)}
 setResponder(async()=>response('s','2026-10',{items:[{...row,automaticReview:[{itemId:row.id,code:'<img src=x onerror=SECRET>'},{itemId:row.id,code:'<script>SECRET</script>'}]}]}));await submit();const details=document.querySelector('.ima-automatic-review');assert.match(details.textContent,/Η αυτόματη σύνδεση δεν ολοκληρώθηκε με τα διαθέσιμα στοιχεία/);assert.doesNotMatch(details.textContent,/SECRET/);assert.equal(details.querySelectorAll('img,script').length,0);assert.equal(details.querySelectorAll('li').length,1);
}));

test('explicit five-cent paid tolerance displays the actual signed variance without an owed amount or mutated monetary fields',async()=>mounted(async({setResponder,submit,calls})=>{
 for(const [difference,paid,printed,direction]of [[-5,1229,'12,29','λιγότερα'],[-3,1231,'12,31','λιγότερα'],[3,1237,'12,37','περισσότερα'],[5,1239,'12,39','περισσότερα']]){
  const payment={status:'PAID',paidCents:paid,remainingCents:Math.max(0,-difference),overpaymentCents:Math.max(0,difference),paymentCount:1,withinTolerance:true,toleranceCents:5,paymentDifferenceCents:difference},before=JSON.stringify(payment);
  setResponder(async()=>response('s','2026-10',paymentPatch(payment,{financialSummary:financialSummary({paid:1})})));await submit();const observation=document.querySelector('.ima-payment');assert.equal(observation.querySelector('b').textContent,'Εξοφλημένο — εντός ανοχής');assert.ok(observation.textContent.includes('Καταγεγραμμένες πληρωμές: '+printed));const variance=observation.querySelector('.ima-payment-tolerance');assert.ok(variance);assert.ok(variance.textContent.includes(direction));assert.match(variance.textContent,/εντός ανοχής 0,05.*χωρίς εκκρεμή πληρωμή/);assert.ok(variance.textContent.includes(Math.abs(difference)===3?'0,03':'0,05'));assert.doesNotMatch(observation.textContent,/Υπόλοιπο προς πληρωμή|Ποσό υπερπληρωμής/);assert.equal(JSON.stringify(payment),before);assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Εξοφλημένα1.*Οικονομικές εκκρεμότητες0/);
 }
 assert.ok(calls.every(call=>call.options.method===undefined));
}));

test('tolerance display requires exact backend flags while legacy paid and genuine partial extra or unknown states stay unchanged',async()=>mounted(async({setResponder,submit})=>{
 const base={status:'PAID',paidCents:1231,remainingCents:3,overpaymentCents:0,withinTolerance:true,toleranceCents:5,paymentDifferenceCents:-3};
 for(const patch of [{withinTolerance:undefined},{withinTolerance:false},{withinTolerance:1},{toleranceCents:undefined},{toleranceCents:'5'},{toleranceCents:6},{paymentDifferenceCents:undefined},{paymentDifferenceCents:'-3'},{paymentDifferenceCents:0},{paymentDifferenceCents:-6},{paymentDifferenceCents:NaN}]){
  setResponder(async()=>response('s','2026-10',paymentPatch({...base,...patch})));await submit();const observation=document.querySelector('.ima-payment');assert.equal(observation.querySelector('b').textContent,'Εξοφλημένο');assert.equal(observation.querySelector('.ima-payment-tolerance'),null);
 }
 for(const [status,patch,label,amount]of [['PARTIALLY_PAID',{paidCents:1228,remainingCents:6,paymentDifferenceCents:-6},'Μερική πληρωμή','Υπόλοιπο προς πληρωμή: 0,06'],['OVERPAID',{paidCents:1240,remainingCents:0,overpaymentCents:6,paymentDifferenceCents:6},'Υπερπληρωμή — χρειάζεται έλεγχο','Ποσό υπερπληρωμής: 0,06'],['PARTIALLY_PAID',{},'Μερική πληρωμή','Υπόλοιπο προς πληρωμή: 0,03'],['UNCONFIRMED',{},'Πληρωμή προς επιβεβαίωση','Το οικονομικό υπόλοιπο δεν έχει επιβεβαιωθεί.'],['REVERSED',{},'Η πληρωμή έχει αντιλογιστεί','Υπόλοιπο προς πληρωμή: 0,03']]){
  setResponder(async()=>response('s','2026-10',paymentPatch({...base,...patch,status})));await submit();const observation=document.querySelector('.ima-payment');assert.equal(observation.querySelector('b').textContent,label);assert.equal(observation.querySelector('.ima-payment-tolerance'),null);assert.ok(observation.textContent.includes(amount));assert.equal(observation.classList.contains('ima-payment-paid'),false);
 }
 setResponder(async()=>response('s','2026-10',paymentPatch({status:'PAID',paidCents:1234,remainingCents:0,overpaymentCents:0,paymentCount:1})));await submit();assert.equal(document.querySelector('.ima-payment b').textContent,'Εξοφλημένο');assert.equal(document.querySelector('.ima-payment-tolerance'),null);
}));

test('recognized zero-value delivery note has neutral payment wording and no registered-purchase claim',async()=>mounted(async({render,setResponder,submit,click,calls})=>{
 const delivery={...row,id:'delivery-synthetic',documentNumber:'DELIVERY-TEST-01',automaticReview:[{itemId:'delivery-synthetic',code:'INBOUND_IDENTITY_UNCONFIRMED'}],documentType:'DELIVERY_NOTE',nonFinancialBasis:'STANDALONE_ZERO_MYDATA_9_3_V1',totalCents:0,categories:[],reasons:[],purchaseReview:{status:'NON_FINANCIAL',reason:'Δελτίο αποστολής μηδενικής αξίας· δεν αποτελεί εκκρεμή αγορά ή οφειλή.'},openTarget:{kind:'PREVIEW',rowId:'delivery-synthetic',storeId:'s'},payment:{status:'NOT_APPLICABLE',paidCents:null,remainingCents:null,overpaymentCents:null}};
 const opened=[];await render({onOpenInvoiceOrder:detail=>opened.push(detail)});
 setResponder(async url=>url.pathname.endsWith('/record')?recordResponse('s','2026-10',delivery,{sources:{documents:[],orders:[],inbound:[{id:'delivery-source',series:'DELIVERY',documentNumber:'TEST-01',invoiceType:'9.3',issueDay:'2026-10-02',totalGross:'0.0000'}],inbox:[{id:'delivery-inbox',status:'RECEIVED'}]},relatedOrders:[]}):response('s','2026-10',paymentPatch(delivery.payment,{items:[delivery],financialSummary:financialSummary({notApplicable:1}),nextPage:null})));await submit();
 const invoice=document.querySelector('.ima-rows>li'),badge=invoice.querySelector('.ima-payment');
 assert.match(invoice.querySelector('.ima-meta').textContent,/Δελτίο αποστολής/);assert.equal(badge.querySelector('b').textContent,'Δεν εφαρμόζεται έλεγχος πληρωμής');assert.match(invoice.textContent,/δεν αποτελεί καταχώριση αγοράς/);
 assert.doesNotMatch(invoice.textContent,/Τιμολόγιο|Πιστωτικό|Εξοφλημένο|Υπόλοιπο προς πληρωμή|Η καταχώριση αγοράς επιβεβαιώνεται|Καταγεγραμμένες πληρωμές/);assert.equal(invoice.querySelector('.ima-payment-paid'),null);assert.equal(invoice.querySelector('.ima-payment-review'),null);
 assert.match(invoice.querySelector('.ima-purchase-review').textContent,/δεν αποτελεί εκκρεμή αγορά ή οφειλή/);assert.match(invoice.querySelector('.ima-automatic-review').textContent,/Για δελτίο αποστολής μηδενικής αξίας δεν εφαρμόζεται αυτόματη σύνδεση με τιμολόγιο/);assert.doesNotMatch(invoice.querySelector('.ima-automatic-review').textContent,/Δεν επιβεβαιώνονται πλήρως το ΑΦΜ|η ημερομηνία ή ο τύπος/);assert.equal(invoice.querySelector('.ima-record-open').disabled,false);
 await click('DELIVERY-TEST-01');const request=calls.at(-1);assert.equal(request.url.pathname,'/api/reports/invoice-month-audit/record');assert.deepEqual([...request.url.searchParams.entries()].sort(),[['id','delivery-synthetic'],['month','2026-10'],['storeId','s']]);
 const dialog=document.querySelector('[role=dialog]');assert.ok(dialog);assert.match(dialog.textContent,/Παραλαβές myDATA.*DELIVERY TEST-01/);assert.match(dialog.textContent,/Δεν δημιουργείται νέο πρόχειρο/);assert.equal(dialog.querySelectorAll('button').length,1);assert.deepEqual(opened,[]);
 await click('Κλείσιμο παραστατικού');assert.equal(document.querySelector('[role=dialog]'),null);await click('Πρώτη σελίδα / Ανανέωση');assert.equal(calls.length,3);assert.ok(calls.every(call=>!call.options.method));assert.deepEqual(opened,[]);
 assert.match(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]').textContent,/Εξοφλημένα0.*Οικονομικές εκκρεμότητες0.*Συνδέσεις πληρωμής προς έλεγχο0/);
}));

test('delivery wording never suppresses unknown zero-invoice positive or conflicting-link financial review',async()=>mounted(async({setResponder,submit,calls})=>{
 for(const fixture of [
  {documentType:null,totalCents:0,reasons:['Ο τύπος του παραστατικού χρειάζεται έλεγχο.']},
  {documentType:'INVOICE',totalCents:0},
  {documentType:null,totalCents:2500},
  {documentType:'DELIVERY_NOTE',totalCents:0,reasons:['Η σύνδεση myDATA με την αγορά δεν συμφωνεί πλήρως.']},
  {documentType:'DELIVERY_NOTE',totalCents:2500}
 ]){
  const payment={status:'REVIEW_REQUIRED',paidCents:null,remainingCents:null},item={...row,...fixture,automaticReview:[{itemId:row.id,code:'INBOUND_IDENTITY_UNCONFIRMED'}],categories:['PURCHASE_LINK_REVIEW'],reasons:fixture.reasons||[],payment};
  setResponder(async()=>response('s','2026-10',paymentPatch(payment,{items:[item],financialSummary:financialSummary({reviewRequired:1}),nextPage:null})));await submit();
  const invoice=document.querySelector('.ima-rows>li');assert.equal(invoice.querySelector('.ima-payment b').textContent,'Η σύνδεση πληρωμής χρειάζεται έλεγχο');assert.match(invoice.textContent,/Το οικονομικό υπόλοιπο δεν έχει επιβεβαιωθεί/);assert.doesNotMatch(invoice.textContent,/Δεν εφαρμόζεται έλεγχος πληρωμής|δεν αποτελεί καταχώριση αγοράς|Εξοφλημένο|Υπόλοιπο προς πληρωμή/);assert.equal(invoice.querySelector('.ima-payment-neutral'),null);assert.match(invoice.querySelector('.ima-automatic-review').textContent,/Δεν επιβεβαιώνονται πλήρως το ΑΦΜ/);
 }
 const payment={status:'NOT_APPLICABLE'},item={...row,documentType:'DELIVERY_NOTE',totalCents:0,categories:[],reasons:[],payment,automaticReview:[{itemId:row.id,code:'UNSUPPORTED_CURRENCY'},{itemId:'foreign-delivery',code:'INBOUND_IDENTITY_UNCONFIRMED'}]};
 setResponder(async()=>response('s','2026-10',paymentPatch(payment,{items:[item],nextPage:null})));await submit();const evidence=document.querySelector('.ima-automatic-review');assert.match(evidence.textContent,/Το νόμισμα δεν υποστηρίζεται/);assert.doesNotMatch(evidence.textContent,/Για δελτίο αποστολής|Δεν επιβεβαιώνονται πλήρως το ΑΦΜ/);
 assert.equal(calls.length,6);assert.ok(calls.every(call=>!call.options.method));
}));
