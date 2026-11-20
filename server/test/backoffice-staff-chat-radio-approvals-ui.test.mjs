import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function component(name){
 const r=await build({entryPoints:[new URL(`../../client/src/components/${name}.jsx`,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const mod={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.default;
}
async function mount(Component,props){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','FormData','alert','confirm','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,props)));
 return {dom,act:React.act,async render(next){await React.act(async()=>root.render(React.createElement(Component,next)))},async close(){await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const rowText='SAFE <img src=x onerror=alert(1)> & native';
const chatResult=(path,storeId='a1',name=rowText)=>{
 const q=new URL(path,'https://isolated.invalid').searchParams,topic=q.get('topic')||'GENERAL';
 return {companyId:'a',storeId,store:{id:storeId,companyId:'a',name:storeId},topic,rows:[{id:'m1',body:name,senderName:'Sender',category:topic==='CASH'?'CASH':topic==='INVOICE'?'INVOICE':'GENERAL',createdAt:'2026-11-17T12:00:00Z',hasAttachment:true,attachmentName:'photo.png',attachmentMimeType:'image/png',attachmentSize:4,readByMe:false}],q:q.get('q'),nextCursor:q.get('q')&&!q.get('before')?'m1':null,interactionsAvailable:true,searchForwardAvailable:true,permissions:{canPin:true,canManageSettings:true,canForward:true}};
};
const attachmentResult=(storeId='a1')=>({companyId:'a',storeId,messageId:'m1',filename:'photo.png',mimeType:'image/png',dataUrl:'data:image/png;base64,aGVsbG8='});
const radioResult=(path,storeId='a1',name=rowText)=>({companyId:'a',storeId,moduleActive:true,enabled:true,stations:[{id:'station1',name}],state:{stationId:'station1',volume:.4},terminalPos:'MAIN'});
const approvalResult=(path,storeId='a1',name=rowText)=>({companyId:'a',storeId,items:[{id:path.includes('supplier-settlements')?'s1':path.includes('other-expenses')?'e1':'b1',companyId:'a',storeId,supplierName:name,description:name,type:name,paymentMethod:'BANK_TRANSFER',amount:12,paidAt:'2026-11-17T12:00:00Z',status:'PENDING_REVIEW',attachmentFilename:null}]});
const cases=[
 {key:'chat',component:'store/StoreChatPanel',right:'chat.read',label:'Chat καταστήματος',refresh:'Ανανέωση μηνυμάτων',fixture:chatResult,id:path=>path.match(/\/stores\/([^/]+)/)?.[1],props:(api,id='a1')=>({api,companyId:'a',store:{id,companyId:'a',name:id},readOnly:true,onClose(){}})},
 {key:'radio',component:'store/PosOnlineRadioPlayer',right:'radio.read',label:'Κατάσταση ραδιοφώνου',refresh:'Ανανέωση ραδιοφώνου',fixture:radioResult,id:path=>path.match(/\/stores\/([^/]+)/)?.[1],props:(api,id='a1')=>({api,companyId:'a',store:{id,name:id},readOnly:true,onClose(){}})},
 {key:'approvals',component:'cloud/OwnerPendingApprovals',right:'approvals.read',label:'Εκκρεμείς επιβεβαιώσεις',refresh:'Ανανέωση',fixture:approvalResult,id:path=>new URL(path,'https://isolated.invalid').searchParams.get('storeId'),props:(api,id='a1')=>({api,companyId:'a',store:{id,name:id},readOnly:true})}
];
const inputValue=(element,value)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))};

test('chat radio and approvals mount only independent store GETs without chat receipts, playback or producer controls',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const c of cases){
  const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[c.right]},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');assert.equal(c.id(path),'a1');
   if(c.key==='chat')assert.match(path,/^\/api\/store-chat\/stores\/a1\/messages\?topic=GENERAL$/);
   if(c.key==='radio')assert.equal(path,'/api/store-pos/stores/a1/online-radio');
   if(c.key==='approvals')assert.match(path,/^\/api\/transactions\/(supplier-settlements|other-expenses|bank-ledger)\/review\?storeId=a1$/);
   return c.fixture(path,'a1',rowText);
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,70)));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);assert.equal(document.querySelector('audio'),null);assert.equal(document.querySelector('video'),null);assert.equal(document.querySelector('input[type="file"]'),null);
   for(const text of ['Σημείωση ως διαβασμένο','Επιβεβαίωση ανάγνωσης','Play','Αποστολή','Επιβεβαίωση','Απόκλιση','Ακύρωση εκκρεμούς πληρωμής'])assert.ok(!button(text),text);
   if(c.key==='radio'){assert.ok(document.querySelector('input[type="range"]').disabled);assert.equal(document.querySelector('.pos-online-radio-modal select'),null);assert.ok(document.querySelector('[aria-label="Επιτρεπόμενοι σταθμοί"]'))}
   assert.ok(!calls.some(path=>/delivered|push|settings|forward|\/read|state/.test(path)));
   await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(!document.body.textContent.includes(rowText));assert.ok(!button(c.label));
  }finally{await m.close()}
 }
});

test('readonly chat searches native history and previews scoped attachments without raw fetching, receipts or downloads',async()=>{
 const Chat=await component('store/StoreChatPanel');const paths=[];
 const api=async(path,options={})=>{paths.push(path);assert.equal(options.method||'GET','GET');if(path.endsWith('/attachment'))return attachmentResult();return chatResult(path,'a1',path.includes('/search?')?'SEARCH_ROW':rowText)};
 const m=await mount(Chat,cases[0].props(api));
 try{
  await m.act(async()=>button('Προβολή συνημμένου').click());assert.equal(document.querySelector('.chat-photo-stage img').src,'data:image/png;base64,aGVsbG8=');assert.equal(paths.filter(path=>path.endsWith('/attachment')).length,1);assert.ok(!button('Κατέβασμα'));
  await m.act(async()=>document.querySelector('[aria-label="Κλείσιμο μενού"]').click());assert.equal(document.querySelector('.chat-photo-stage'),null);
  await m.act(async()=>inputValue(document.querySelector('[aria-label="Κείμενο αναζήτησης ιστορικού"]'),'SEARCH'));
  await m.act(async()=>document.querySelector('.store-chat-search form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.ok(document.body.textContent.includes('SEARCH_ROW'));assert.ok(!document.body.textContent.includes(rowText));
  await m.act(async()=>button('Επόμενα αποτελέσματα').click());assert.ok(paths.some(path=>path.includes('before=m1')));
  await m.act(async()=>button('Ταμεία').click());assert.ok(paths.some(path=>path.endsWith('topic=CASH')));assert.equal(document.querySelector('[aria-label="Κείμενο αναζήτησης ιστορικού"]').value,'');
  assert.ok(paths.every(path=>path.includes('/messages?')||path.includes('/messages/search?')||path.endsWith('/messages/m1/attachment')));
 }finally{await m.close()}
});

test('scoped chat media clears late responses, hidden-page previews and rejects foreign objects or unsafe MIME',async()=>{
 const Chat=await component('store/StoreChatPanel');let mode='ok',late;
 const api=async path=>{if(path.endsWith('/attachment')){if(mode==='late')return new Promise(resolve=>{late=resolve});return attachmentResult()}return chatResult(path,path.match(/\/stores\/([^/]+)/)[1])};
 const m=await mount(Chat,cases[0].props(api));
 try{
  await m.act(async()=>button('Προβολή συνημμένου').click());assert.ok(document.querySelector('.chat-photo-stage'));
  await m.act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(document.querySelector('.chat-photo-stage'),null);Object.defineProperty(document,'hidden',{configurable:true,value:false});
  mode='late';await m.act(async()=>button('Προβολή συνημμένου').click());await m.render(cases[0].props(api,'a2'));await m.act(async()=>late(attachmentResult()));assert.equal(document.querySelector('.chat-photo-stage'),null);
 }finally{await m.close()}
 for(const wrong of ['companyId','storeId','messageId','mimeType','dataUrl']){
  const broken=async path=>{if(!path.endsWith('/attachment'))return chatResult(path);const r=attachmentResult();r[wrong]=wrong==='dataUrl'?'data:text/html;base64,PHNjcmlwdD4=':wrong==='mimeType'?'text/html':'foreign';return r};
  const n=await mount(Chat,cases[0].props(broken));
  try{await n.act(async()=>button('Προβολή συνημμένου').click());assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.querySelector('.chat-photo-stage'),null);assert.ok(!document.body.textContent.includes(rowText))}finally{await n.close()}
 }
});

test('chat radio and approval reads clear denied refreshes and discard stale stores without polling',async()=>{
 for(const c of cases){
  const Component=await component(c.component);let mode='ok',late=[];const original=globalThis.setInterval;let polls=0;globalThis.setInterval=(...args)=>{polls++;return original(...args)};
  const api=async(path,options={})=>{assert.equal(options.method||'GET','GET');const id=c.id(path);if(mode==='deny')throw Error('SCOPE_WITHDRAWN');if(mode==='late'&&id==='a1')return new Promise(resolve=>late.push(()=>resolve(c.fixture(path,id,'LATE_SCOPE'))));return c.fixture(path,id,id==='a2'?'SECOND_SCOPE':rowText)};
  const m=await mount(Component,c.props(api));
  try{
   mode='late';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes(rowText));await m.render(c.props(api,'a2'));assert.ok(document.body.textContent.includes('SECOND_SCOPE'));
   await m.act(async()=>late.forEach(resolve=>resolve()));assert.ok(!document.body.textContent.includes('LATE_SCOPE'));mode='deny';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes('SECOND_SCOPE'));assert.match(document.querySelector('[role="alert"]').textContent,/SCOPE_WITHDRAWN/);assert.equal(polls,0);
  }finally{await m.close();globalThis.setInterval=original}
 }
});

test('chat radio and approvals reject foreign envelopes or nested approval items and hide all partial results',async()=>{
 for(const c of cases){
  const Component=await component(c.component),suffixes=c.key==='approvals'?['supplier-settlements','other-expenses','bank-ledger']:[''];
  for(const suffix of suffixes)for(const field of ['companyId','storeId']){
   const api=async path=>{const r=c.fixture(path);if(path.includes(suffix))r[field]='foreign';return r},m=await mount(Component,c.props(api));
   try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
  }
 }
 const Approvals=await component('cloud/OwnerPendingApprovals');
 for(const field of ['companyId','storeId']){
  const api=async path=>{const r=approvalResult(path);if(path.includes('bank-ledger'))r.items[0][field]='foreign';return r},m=await mount(Approvals,cases[2].props(api));
  try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
 }
 const Radio=await component('store/PosOnlineRadioPlayer'),m=await mount(Radio,cases[1].props(async()=>({...radioResult(),stations:[{id:'x',name:rowText,streamUrl:'https://external.invalid/stream'}]})));
 try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText));assert.equal(document.querySelector('audio'),null)}finally{await m.close()}
});

test('native Owner approval actions and radio playback controls remain available by default',async()=>{
 const Approvals=await component('cloud/OwnerPendingApprovals'),paths=[],api=async path=>{paths.push(path);return approvalResult(path)},props={api,store:{id:'a1',name:'A1'}};
 const a=await mount(Approvals,props);
 try{localStorage.setItem('user',JSON.stringify({role:'OWNER'}));await a.render({...props,refreshToken:1});assert.ok(paths.includes('/api/transactions/bank-ledger/review'));assert.ok(button('Επιβεβαίωση'));assert.ok(button('Απόκλιση'));assert.ok(button('Ακύρωση εκκρεμούς πληρωμής'));assert.ok(document.querySelector('input[type="file"]'))}finally{await a.close()}
 const Radio=await component('store/PosOnlineRadioPlayer'),b=await mount(Radio,{api:async()=>({...radioResult(),stations:[{id:'station1',name:'Station',streamUrl:'https://isolated.invalid/radio'}]}),store:{id:'a1',name:'A1'},onClose(){}});
 try{assert.ok(document.querySelector('audio'));assert.ok(button('Play'));assert.ok(!document.querySelector('input[type="range"]').disabled);window.HTMLMediaElement.prototype.pause=()=>{}}finally{await b.close()}
});


test('readonly radio lists all allowed names and marks only an actual saved station',async()=>{
 const Radio=await component('store/PosOnlineRadioPlayer');
 const value={...radioResult(),stations:[{id:'one',name:'First allowed'},{id:'two',name:'Second allowed'}],state:{stationId:null,volume:.4}};
 const m=await mount(Radio,cases[1].props(async()=>value));
 try{
  const list=document.querySelector('[aria-label="Επιτρεπόμενοι σταθμοί"]');assert.equal(list.querySelectorAll('li').length,2);assert.ok(list.textContent.includes('First allowed'));assert.ok(list.textContent.includes('Second allowed'));assert.equal(list.querySelector('[aria-current="true"]'),null);assert.match(document.body.textContent,/Δεν έχει αποθηκευτεί τρέχων σταθμός/);
  await m.render(cases[1].props(async()=>({...value,state:{stationId:'two',volume:.4}})));
  const selected=document.querySelectorAll('[aria-label="Επιτρεπόμενοι σταθμοί"] [aria-current="true"]');assert.equal(selected.length,1);assert.match(selected[0].textContent,/Second allowed/);assert.ok(!document.body.textContent.includes('Δεν έχει αποθηκευτεί τρέχων σταθμός'));assert.equal(document.querySelector('audio'),null);
 }finally{await m.close()}
});
