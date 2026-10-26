import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const row={id:'payment',supplierId:'sup',supplierName:'Synthetic Supplier',documentNumber:'A-100',documentDate:'2026-10-26',amount:2.5,terminalPos:'P1',actorName:'Synthetic Operator',fingerprint:'original-fingerprint'};
async function fixture(responder,{allowCreate=false,rows=[row]}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','FileReader','File','Image','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 let imageLoads=0;globalThis.Image=class {naturalWidth=20;naturalHeight=30;set src(value){imageLoads++;queueMicrotask(()=>this.onload())}};
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,code=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePendingInvoicePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});const m={exports:{}};new Function('require','module','exports',code.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const calls=[],api=async(path,options)=>{const call={path,body:options?.body?JSON.parse(options.body):null};calls.push(call);const answer=responder?.(call);if(answer!==undefined)return answer;return {storeId:'s',rows,count:rows.length,fingerprint:'list',openSession:{id:'shift',terminalPos:'P1'}}};const root=createRoot(document.getElementById('root'));let props={api,store:{id:'s'},suppliers:[{id:'sup',name:'Synthetic Supplier'}],allowCreate};
 const render=async next=>{props={...props,...next};await act(async()=>root.render(React.createElement(m.exports.default,props)))};
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))});
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 const click=async text=>act(async()=>button(text).click());
 const selectFile=async(photos=false)=>act(async()=>{const input=document.querySelector('input[type=file]'),file=new dom.window.File(['%PDF-1.4\n'+'original '.repeat(30)+'%%EOF'],'invoice.pdf',{type:'application/pdf'});Object.defineProperty(input,'files',{configurable:true,value:photos?[new dom.window.File([new Uint8Array([255,216,255,...Array(200).fill(1)])],'a.jpg',{type:'image/jpeg'}),new dom.window.File([new Uint8Array([255,216,255,...Array(200).fill(2)])],'b.jpg',{type:'image/jpeg'})]:[file]});input.dispatchEvent(new window.Event('change',{bubbles:true}))});
 const upload=async()=>act(async()=>{button('Σύνδεση χωρίς').click();await new Promise(r=>setTimeout(r,30))});
 await render();return {dom,act,calls,render,change,click,selectFile,upload,button,get imageLoads(){return imageLoads},async cleanup(){await act(async()=>root.unmount());dom.window.close();for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
test('mounted payment requires no file/provider and keeps idempotency key after an uncertain response',async()=>{
 let attempts=0;const h=await fixture(call=>{if(call.body?.deferredInvoice){if(++attempts===1)throw Error('lost response');return {pendingInvoiceId:'payment',duplicate:true}}},{allowCreate:true,rows:[]});try{
  const labels=[...document.querySelectorAll('form label')],input=label=>labels.find(x=>x.textContent.startsWith(label)).querySelector('input,select');await h.change(input('Προμηθευτής'),'sup');await h.change(input('Πραγματικός'),'A-100');await h.change(input('Ημερομηνία'),'2026-10-26');await h.change(input('Ποσό'),'2,50');await h.act(async()=>document.querySelector('input[type=checkbox]').click());
  await h.act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.match(document.body.textContent,/ίδιο αναγνωριστικό/);await h.act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  const writes=h.calls.filter(c=>c.body);assert.equal(writes.length,2);assert.equal(writes[0].body.idempotencyKey,writes[1].body.idempotencyKey);assert.equal(writes[0].body.evidenceMode,'NO_DOCUMENT');assert.equal(writes[0].body.attachment,undefined);assert.ok(writes.every(c=>!c.path.includes('ai-reader')));
 }finally{await h.cleanup()}
});
test('mounted plain photo capture lost response retries exact prepared PDF once without AI or another payment',async()=>{
 let captured=false,captures=0;const h=await fixture(call=>{if(call.body?.sourceKind==='PLAIN_CAPTURE'){if(!captured){captured=true;captures++;throw Error('lost after durable capture')}return {sourceKind:'PLAIN_CAPTURE',captured:true,duplicate:true,paymentTransactionId:'payment',attachmentId:'payment',proofId:'proof',checksum:'a'.repeat(64)}}});try{
  await h.click('Ανέβασε το ίδιο');await h.selectFile(true);await h.upload();assert.match(document.body.textContent,/Μην πληρώσεις ξανά/);assert.ok(document.querySelector('input[type=file]'));await h.upload();
  const writes=h.calls.filter(c=>c.body);assert.equal(writes.length,2);assert.equal(captures,1);assert.equal(h.imageLoads,2,'retry must not rebundle/redecode original photos');assert.deepEqual(writes[0].body.attachment,writes[1].body.attachment);assert.equal(writes[0].body.attachment.mimeType,'application/pdf');assert.ok(writes.every(c=>c.body.paymentTransactionId==='payment'&&c.body.expectedPendingInvoice.id==='payment'&&c.body.sourceKind==='PLAIN_CAPTURE'));assert.ok(writes.every(c=>!c.path.includes('ai-reader')&&!c.body.deferredInvoice));assert.match(document.body.textContent,/Δεν έγινε δεύτερη πληρωμή ούτε ανάγνωση AI/);
 }finally{await h.cleanup()}
});
test('mounted altered capture receipt ID is not accepted, and store change removes stale pending data',async()=>{
 const waiting=deferred();let other=false;const h=await fixture(call=>{if(call.body?.sourceKind==='PLAIN_CAPTURE')return {sourceKind:'PLAIN_CAPTURE',captured:true,paymentTransactionId:'foreign'};if(call.path.includes('/other/'))return waiting.promise});try{
  await h.click('Ανέβασε το ίδιο');await h.selectFile();await h.upload();assert.match(document.body.textContent,/Μην πληρώσεις ξανά/);assert.equal(h.calls.filter(c=>c.path.includes('ai-reader')).length,0);await h.render({store:{id:'other'}});assert.doesNotMatch(document.body.textContent,/A-100/);await h.act(async()=>waiting.resolve({storeId:'other',rows:[],count:0}));assert.doesNotMatch(document.body.textContent,/A-100/);assert.equal(document.querySelector('form'),null);
 }finally{await h.cleanup()}
});

test('mounted already-uploaded incomplete source is labelled for existing review without offering source-kind downgrade',async()=>{
 const h=await fixture(null,{rows:[{...row,status:'UPLOADED_AWAITING_REVIEW'}]});try{assert.match(document.body.textContent,/Το πρωτότυπο ανέβηκε/);assert.match(document.body.textContent,/εκκρεμεί σύνδεση ή έλεγχος/);assert.equal(h.button('Αναμονή ελέγχου').disabled,true);assert.equal(document.querySelector('form'),null)}finally{await h.cleanup()}
});

test('retained rendered payment/upload/refresh callbacks cannot act in a replacement store',async()=>{
 const h=await fixture(call=>call.path.includes('/other/')?{storeId:'other',rows:[],count:0,openSession:{id:'other-shift'}}:undefined,{allowCreate:true});try{
  const labels=[...document.querySelectorAll('form label')],input=label=>labels.find(x=>x.textContent.startsWith(label)).querySelector('input,select');await h.change(input('Προμηθευτής'),'sup');await h.change(input('Πραγματικός'),'A-100');await h.change(input('Ημερομηνία'),'2026-10-26');await h.change(input('Ποσό'),'2,50');await h.act(async()=>document.querySelector('input[type=checkbox]').click());
  await h.click('Ανέβασε το ίδιο');await h.selectFile();
  const props=el=>el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))];
  const create=props(document.querySelector('form')).onSubmit,upload=props(h.button('Σύνδεση χωρίς')).onClick,refresh=props(h.button('Ανανέωση')).onClick;
  await h.render({store:{id:'other'}});const before=h.calls.length;
  await h.act(async()=>{await create({preventDefault(){}});await upload();await refresh()});
  assert.equal(h.calls.length,before,'old render must issue no request in either old or new store');assert.equal(h.calls.filter(c=>c.body).length,0);
 }finally{await h.cleanup()}
});

test('confirmed payment or capture followed by list failure asks only for refresh, without uncertain-repeat claims',async()=>{
 for(const payment of [true,false]){
  let accepted=false;const h=await fixture(call=>{if(call.body){accepted=true;return payment?{pendingInvoiceId:'payment',duplicate:false}:{sourceKind:'PLAIN_CAPTURE',captured:true,paymentTransactionId:'payment',attachmentId:'payment',proofId:'proof',checksum:'a'.repeat(64)}}if(accepted)throw Error('list unavailable')},{allowCreate:payment});try{
   if(payment){const labels=[...document.querySelectorAll('form label')],input=label=>labels.find(x=>x.textContent.startsWith(label)).querySelector('input,select');await h.change(input('Προμηθευτής'),'sup');await h.change(input('Πραγματικός'),'A-100');await h.change(input('Ημερομηνία'),'2026-10-26');await h.change(input('Ποσό'),'2,50');await h.act(async()=>document.querySelector('input[type=checkbox]').click());await h.act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))}else{await h.click('Ανέβασε το ίδιο');await h.selectFile();await h.upload()}
   assert.match(document.querySelector('[role=alert]').textContent,/επιβεβαιώθηκε/);assert.match(document.querySelector('[role=alert]').textContent,/Ανανέωση εκκρεμοτήτων/);assert.doesNotMatch(document.querySelector('[role=alert]').textContent,/διατηρούνται|παραμένει|επανάληψη/);assert.equal(h.calls.filter(c=>c.body).length,1);if(!payment)assert.equal(document.querySelector('input[type=file]'),null);
  }finally{await h.cleanup()}
 }
});

async function withCloseForm(run,{write=async()=>({variance:0}),overview=()=>({openSession:{id:'shift',openingSafe:0},suggestedOpening:{safe:0}})}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreShiftClosePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),module={exports:{}};
 new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),writes=[],closed=[];
 const api=async(path,options={})=>{if(options.method){const body=JSON.parse(options.body);writes.push(body);return write(body,writes.length)}if(path.endsWith('/access'))return {shiftClosePolicy:{}};if(path.includes('/transactions/'))return {summary:{}};return overview()};
 const input=async(element,value)=>act(async()=>{assert.ok(element,'expected visible input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const choose=async method=>{const button=[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===method);assert.ok(button,`close form offers ${method}`);await act(async()=>button.click())};
 const submit=async()=>act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,15))});
 try{
  await act(async()=>{root.render(React.createElement(module.exports.default,{api,store:{id:'store'},onClosed:()=>closed.push(true)}));await new Promise(resolve=>setTimeout(resolve,15))});
  await act(async()=>document.querySelector('.cash-form input[type="checkbox"]').click());
  await input(document.querySelector('input[required]'),'0');
  await run({dom,act,input,choose,submit,writes,closed});
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
}


const pending={count:3,missingCount:1,uploadedCount:1,reviewCount:1,fingerprint:'a'.repeat(64),rows:[]};
const view=p=>({openSession:{id:'shift',openingSafe:0},suggestedOpening:{safe:0},pendingInvoices:p});
test('mounted pending ACK gates close and strips credential on decision; counts/status are accurate',async()=>{
 await withCloseForm(async({act,input,choose,submit,writes,closed})=>{
  await choose('PIN');await input(document.querySelector('[name="shift-close-pin"]'),'2468');
  assert.equal(document.querySelector('.cash-submit').disabled,true);assert.match(document.body.textContent,/Προς ανέβασμα: 1/);assert.match(document.body.textContent,/Απαιτούν έλεγχο: 1/);
  await act(async()=>document.querySelector('section[aria-label] input').click());assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');
  await input(document.querySelector('[name="shift-close-pin"]'),'1357');await submit();assert.equal(writes[0].pendingInvoiceAcknowledged,true);assert.equal(writes[0].pendingInvoiceFingerprint,pending.fingerprint);assert.equal(writes[0].pin,'1357');assert.equal(closed.length,1);
 },{overview:()=>view(pending)});
});
test('actual stale409 refreshes fingerprint, keeps count confirmation and requires new ACK and credential',async()=>{
 let current=null;
 await withCloseForm(async({act,input,choose,submit,writes,closed})=>{
  await choose('PIN');await input(document.querySelector('[name="shift-close-pin"]'),'2468');await submit();
  assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');assert.equal(document.querySelector('.cash-form input[type="checkbox"]').checked,true);assert.equal(document.querySelector('input[required]').value,'0');
  assert.equal(document.querySelector('section[aria-label] input').checked,false);assert.equal(writes.length,1);
  await act(async()=>document.querySelector('section[aria-label] input').click());await input(document.querySelector('[name="shift-close-pin"]'),'1357');await submit();assert.equal(writes[1].pendingInvoiceFingerprint,pending.fingerprint);assert.equal(closed.length,1);
 },{overview:()=>view(current),write:async(body,index)=>{if(index===1){current=pending;throw Object.assign(new Error('changed'),{code:'MISSING_INVOICES_CONFIRMATION_REQUIRED'})}return {variance:0}}});
});

test('forced shortage keeps counts after pending409 and requires new ACK plus fresh PIN with current EFTPOS',async()=>{
 let current=null;
 await withCloseForm(async({act,input,choose,submit,writes,closed})=>{
  await choose('PIN');await input(document.querySelector('[name="shift-close-pin"]'),'2468');await submit();
  assert.ok(document.querySelector('.close-shortage'));assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');
  await input(document.querySelector('[name="shift-close-pin"]'),'1357');await act(async()=>document.querySelector('.close-shortage').click());
  assert.equal(writes.length,2);assert.equal(writes[1].forceCloseWithShortage,true);assert.equal(document.querySelector('.cash-form input[type="checkbox"]').checked,true);assert.equal(document.querySelector('input[required]').value,'0');assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');assert.equal(document.querySelector('section[aria-label] input').checked,false);assert.equal(document.querySelector('.close-shortage').disabled,true);
  await act(async()=>document.querySelector('section[aria-label] input').click());await input(document.querySelector('input[required]'),'4.25');await input(document.querySelector('[name="shift-close-pin"]'),'8642');await act(async()=>document.querySelector('.close-shortage').click());
  assert.equal(writes.length,3);assert.equal(writes[2].forceCloseWithShortage,true);assert.equal(writes[2].pin,'8642');assert.equal(writes[2].cardCode,undefined);assert.equal(writes[2].eftposTotal,4.25);assert.equal(writes[2].pendingInvoiceAcknowledged,true);assert.equal(writes[2].pendingInvoiceFingerprint,pending.fingerprint);assert.equal(closed.length,1);
 },{overview:()=>view(current),write:async(body,index)=>{if(index===1)throw Error('Βρέθηκε έλλειμμα — επανακαταμέτρηση');if(index===2){current=pending;throw Object.assign(Error('changed pending'),{code:'MISSING_INVOICES_CONFIRMATION_REQUIRED'})}return {variance:-1}}});
});
