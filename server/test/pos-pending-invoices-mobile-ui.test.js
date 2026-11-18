import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const row={id:'payment-a',supplierId:'supplier',supplierName:'Synthetic Supplier',documentNumber:'ΆνευΧ-12345',documentDate:'2026-11-17',amount:12.34,fingerprint:'fingerprint-a'};
const other={...row,id:'payment-b',documentNumber:'B-2',fingerprint:'fingerprint-b'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const jpeg=new Uint8Array([255,216,255,...Array(200).fill(42)]);
const receipt=id=>({sourceKind:'PLAIN_CAPTURE',captured:true,paymentTransactionId:id,attachmentId:id,proofId:'proof',checksum:'a'.repeat(64)});
const bundles=new Map();
async function fixture(responder=()=>undefined,{rows=[row,other],media,fast=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'});
 const keys=['window','document','navigator','HTMLElement','Node','Event','FileReader','File','Image','fetch','setInterval','clearInterval','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 globalThis.Image=class {naturalWidth=20;naturalHeight=30;set src(value){queueMicrotask(()=>this.onload())}};
 const intervals=new Map();let timerId=0;
 globalThis.setInterval=fn=>{intervals.set(++timerId,fn);return timerId};globalThis.clearInterval=id=>intervals.delete(id);
 globalThis.fetch=async url=>{assert.match(url,/^data:image\/jpeg/);return {blob:async()=>new dom.window.Blob([jpeg],{type:'image/jpeg'})}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:media||{getUserMedia:async()=>{throw Error('No camera fixture')}}});
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 dom.window.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new dom.window.Blob([jpeg],{type:'image/jpeg'}))};
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const entry=fast?'StoreShiftClosePanel':'StorePendingInvoicePanel';
 if(!bundles.has(entry))bundles.set(entry,await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/store/${entry}.jsx`,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}));
 const module={exports:{}};new Function('require','module','exports',bundles.get(entry).outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const Component=fast?module.exports.FastPaymentDraft:module.exports.default;
 const calls=[],changes=[];
 const api=async(path,options={})=>{
  const call={path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null};calls.push(call);
  const result=responder(call);if(result!==undefined)return result;
  if(path==='/api/commerce/mobile-invoice-upload-sessions')return {id:'upload-session',url:'https://synthetic.invalid/upload'};
  if(path.startsWith('/api/commerce/mobile-invoice-upload-sessions/'))return {files:[]};
  if(path.endsWith('/attachment'))return receipt(call.body.paymentTransactionId);
  if(path.endsWith('/fast-handoff'))return {draftReady:true,paymentTransactionId:call.body.paymentTransactionId};
  const storeId=path.split('/')[4];return {storeId,rows:storeId==='s'?rows:[],count:storeId==='s'?rows.length:0};
 };
 const root=createRoot(document.getElementById('root'));let props={api,store:{id:'s'},storeId:'s',row,onChanged:()=>changes.push(true)};
 const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,30))});
 const render=async next=>{props={...props,...next};await act(async()=>root.render(React.createElement(Component,props)));await flush()};
 const buttons=text=>[...document.querySelectorAll('button')].filter(b=>b.textContent.includes(text));
 const click=async(text,index=0)=>{assert.ok(buttons(text)[index],text);await act(async()=>buttons(text)[index].click());await flush()};
 const select=async(files)=>act(async()=>{const input=document.querySelector('input[type=file]');assert.ok(input);Object.defineProperty(input,'files',{configurable:true,value:files});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const photo=(name='one.jpg',size=jpeg.length)=>new dom.window.File([new Uint8Array(size)],name,{type:'image/jpeg'});
 const pdf=()=>new dom.window.File(['%PDF-1.4\n'+'original '.repeat(30)+'%%EOF'],'original.pdf',{type:'application/pdf'});
 const date=async()=>act(async()=>{const input=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'2026-11-17');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const tick=async()=>{const fn=[...intervals.values()][0];assert.ok(fn,'QR poll is scheduled');await act(async()=>fn());await flush()};
 await render();
 return {dom,act,calls,changes,render,flush,click,buttons,select,photo,pdf,date,tick,intervals,async cleanup(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}};
}
const mobileFiles=()=>({files:[{filename:'page1.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,/9j/'},{filename:'page2.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,/9j/'}]});

test('mobile QR receives all pages for the selected original payment; uncertain upload retries the identical attachment',async()=>{
 let writes=0;const h=await fixture(call=>{if(call.path.endsWith('/upload-session'))return mobileFiles();if(call.path.endsWith('/attachment')){if(++writes===1)throw Error('lost response');return receipt(row.id)}});
 try{
  await h.click('Ανέβασε το ίδιο');await h.click('QR από κινητό');assert.ok(document.querySelector('img[alt="QR upload τιμολογίου"]'));
  assert.deepEqual(h.calls.find(c=>c.path==='/api/commerce/mobile-invoice-upload-sessions').body,{storeId:'s',maxFiles:5});
  await h.tick();assert.match(document.body.textContent,/page1.jpg/);assert.match(document.body.textContent,/page2.jpg/);assert.equal(h.intervals.size,0);
  await h.click('Σύνδεση χωρίς');assert.match(document.body.textContent,/Μην πληρώσεις ξανά/);await h.click('Σύνδεση χωρίς');
  const uploads=h.calls.filter(c=>c.path.endsWith('/attachment'));assert.equal(uploads.length,2);assert.deepEqual(uploads[0].body,uploads[1].body);
  assert.equal(uploads[0].body.paymentTransactionId,row.id);assert.equal(uploads[0].body.expectedPendingInvoice.fingerprint,row.fingerprint);assert.equal(uploads[0].body.sourceKind,'PLAIN_CAPTURE');assert.equal(uploads[0].body.attachment.mimeType,'application/pdf');assert.equal(h.changes.length,1);
  assert.ok(h.calls.every(c=>!c.path.includes('ai-reader')&&!c.body?.deferredInvoice));
 }finally{await h.cleanup()}
});

test('changing selected payment fences an in-flight mobile result and cancels its poll',async()=>{
 const waiting=deferred();const h=await fixture(call=>call.path.endsWith('/upload-session')?waiting.promise:undefined);
 try{
  await h.click('Ανέβασε το ίδιο');await h.click('QR από κινητό');const fn=[...h.intervals.values()][0];let poll;
  await h.act(async()=>{poll=fn();await Promise.resolve()});await h.click('Ανέβασε το ίδιο',1);
  await h.act(async()=>{waiting.resolve(mobileFiles());await poll});
  assert.equal(h.intervals.size,0);assert.doesNotMatch(document.body.textContent,/page1.jpg/);assert.match(document.querySelector('[aria-label="Σύνδεση πρωτοτύπου με αρχική πληρωμή"]').textContent,/B-2/);assert.equal(h.buttons('Σύνδεση χωρίς')[0].disabled,true);
 }finally{await h.cleanup()}
});

test('store or API replacement discards a pending QR creation without importing into the new context',async()=>{
 for(const changeApi of [false,true]){
  const waiting=deferred();const h=await fixture(call=>call.path==='/api/commerce/mobile-invoice-upload-sessions'?waiting.promise:undefined);
  try{
   await h.click('Ανέβασε το ίδιο');await h.click('QR από κινητό');
   await h.render(changeApi?{api:async()=>({storeId:'s',rows:[row],count:1})}:{store:{id:'other'}});
   await h.act(async()=>waiting.resolve({id:'late',url:'https://synthetic.invalid/late'}));await h.flush();
   assert.equal(h.intervals.size,0);assert.equal(document.querySelector('img[alt="QR upload τιμολογίου"]'),null);assert.equal(document.querySelector('input[type=file]'),null);
  }finally{await h.cleanup()}
 }
});

test('cancel stops QR polling and preserves no selected pages',async()=>{
 const h=await fixture();try{await h.click('Ανέβασε το ίδιο');await h.click('QR από κινητό');assert.equal(h.intervals.size,1);await h.click('Ακύρωση',1);assert.equal(h.intervals.size,0);assert.equal(document.querySelector('input[type=file]'),null)}finally{await h.cleanup()}
});

test('page additions enforce five pages, PDF exclusivity and size without dropping the existing selection',async()=>{
 const h=await fixture();try{
  await h.click('Ανέβασε το ίδιο');await h.select([h.photo()]);await h.select([h.pdf()]);assert.match(document.querySelector('[role=alert]').textContent,/Δεν συνδυάζονται/);assert.match(document.body.textContent,/one.jpg/);assert.doesNotMatch(document.querySelector('[aria-label="Σελίδες παραστατικού"]').textContent,/original.pdf/);
  await h.select(Array.from({length:5},(_,i)=>h.photo(`extra${i}.jpg`)));assert.match(document.querySelector('[role=alert]').textContent,/μέχρι 5/);
  await h.select([h.photo('too-big.jpg',6500001)]);assert.match(document.querySelector('[role=alert]').textContent,/6,5 MB/);
  await h.select(Array.from({length:4},(_,i)=>h.photo(`page${i}.jpg`)));assert.equal(h.buttons('QR από κινητό')[0].disabled,true);assert.equal(h.buttons('Λήψη από κάμερα')[0].disabled,true);
 }finally{await h.cleanup()}
});

test('camera captures an original page, releases the camera and submits against the same payment once',async()=>{
 let stops=0;const track={stop(){stops++}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};const waiting=deferred();
 const h=await fixture(call=>call.path.endsWith('/attachment')?waiting.promise:undefined,{media:{getUserMedia:async()=>stream}});
 try{
  await h.click('Ανέβασε το ίδιο');await h.click('Λήψη από κάμερα');const video=document.querySelector('video');assert.ok(video);assert.equal(video.srcObject,stream);
  Object.defineProperties(video,{readyState:{value:4},videoWidth:{value:100},videoHeight:{value:200}});
  await h.click('Φωτογράφιση');assert.ok(stops>0);assert.equal(document.querySelector('video'),null);assert.match(document.body.textContent,/timologio-/);
  await h.click('Σύνδεση χωρίς');await h.click('Σύνδεση χωρίς');const uploads=h.calls.filter(c=>c.path.endsWith('/attachment'));assert.equal(uploads.length,1);assert.equal(uploads[0].body.paymentTransactionId,row.id);assert.equal(uploads[0].body.attachment.mimeType,'image/jpeg');
  await h.act(async()=>waiting.resolve(receipt(row.id)));await h.flush();assert.equal(h.changes.length,1);
 }finally{await h.cleanup()}
});

test('late camera permission after cancel, selection change or unmount releases its stream',async()=>{
 for(const action of ['cancel','selection','unmount']){
  const permission=deferred();let stops=0;const track={stop(){stops++}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};const h=await fixture(()=>undefined,{media:{getUserMedia:()=>permission.promise}});let cleaned=false;
  try{
   await h.click('Ανέβασε το ίδιο');await h.click('Λήψη από κάμερα');assert.match(document.body.textContent,/Άνοιγμα κάμερας/);
   if(action==='cancel')await h.click('Κλείσιμο κάμερας');else if(action==='selection')await h.click('Ανέβασε το ίδιο',1);else{await h.cleanup();cleaned=true}
   if(cleaned){permission.resolve(stream);await new Promise(r=>setTimeout(r,10))}else{await h.act(async()=>permission.resolve(stream));await h.flush();assert.equal(document.querySelector('video'),null)}
   assert.ok(stops>0,action+' releases late stream');
  }finally{if(!cleaned)await h.cleanup()}
 }
});


test('upper fast-payment recovery accepts mobile pages and retries the same handoff without another payment',async()=>{
 let writes=0;const h=await fixture(call=>{if(call.path.endsWith('/upload-session'))return mobileFiles();if(call.path.endsWith('/fast-handoff')){if(++writes===1)throw Error('lost response');return {draftReady:true,paymentTransactionId:row.id}}},{fast:true});
 try{
  await h.date();await h.click('QR από κινητό');await h.tick();assert.match(document.body.textContent,/page2.jpg/);assert.doesNotMatch(document.body.textContent,/Δεν γίνεται ανάγνωση AI/);
  await h.click('Σύνδεση χωρίς');assert.match(document.body.textContent,/Μην πληρώσεις ξανά/);await h.click('Σύνδεση χωρίς');
  const uploads=h.calls.filter(c=>c.path.endsWith('/fast-handoff'));assert.equal(uploads.length,2);assert.deepEqual(uploads[0].body,uploads[1].body);assert.equal(uploads[0].body.paymentTransactionId,row.id);assert.equal(uploads[0].body.settlementMode,'PAID');assert.equal(uploads[0].body.documentNumber,row.documentNumber);assert.equal(uploads[0].body.useStoredPaymentAttachment,false);assert.equal(uploads[0].body.pages[0].mimeType,'application/pdf');assert.equal(h.changes.length,1);
  assert.ok(h.calls.every(c=>!c.path.startsWith('/api/transactions/')),'no payment writer called');
 }finally{await h.cleanup()}
});

test('upper recovery accepts a replacement PDF only after explicit submit and fences stale store results',async()=>{
 const waiting=deferred();const h=await fixture(call=>call.path.endsWith('/fast-handoff')?waiting.promise:undefined,{fast:true});
 try{
  await h.select([h.pdf()]);assert.equal(h.buttons('Σύνδεση χωρίς')[0].disabled,true);assert.equal(h.calls.filter(c=>c.body).length,0);
  await h.date();await h.click('Σύνδεση χωρίς');await h.render({storeId:'other',row:other});
  await h.act(async()=>waiting.resolve({draftReady:true,paymentTransactionId:row.id}));await h.flush();
  assert.equal(h.changes.length,0);assert.doesNotMatch(document.body.textContent,/Το πρόχειρο συνδέθηκε/);assert.equal(document.querySelector('input[type=date]').value,'');assert.equal(h.calls.filter(c=>c.path.endsWith('/fast-handoff')).length,1);
 }finally{await h.cleanup()}
});

test('upper recovery cancels mobile sessions and late camera permission on selected payment replacement',async()=>{
 const permission=deferred();let stops=0;const track={stop(){stops++}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};const h=await fixture(()=>undefined,{fast:true,media:{getUserMedia:()=>permission.promise}});
 try{
  await h.click('QR από κινητό');assert.equal(h.intervals.size,1);await h.click('Ακύρωση QR');await h.click('Λήψη από κάμερα');
  await h.render({row:other});await h.act(async()=>permission.resolve(stream));await h.flush();
  assert.ok(stops>0);assert.equal(h.intervals.size,0);assert.equal(document.querySelector('video'),null);assert.match(document.body.textContent,/B-2/);
 }finally{await h.cleanup()}
});
