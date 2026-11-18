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
const rowText='SAFE <img src=x onerror=alert(1)> & name';
const pending=(storeId='a1',body=rowText)=>({companyId:'a',storeId,rows:[{id:'task',storeId,storeName:storeId,category:'GENERAL',status:'OPEN',body,senderName:'Sender',createdAt:'2026-11-17T12:00:00Z'}]});
const promotions=(storeId='a1',name=rowText)=>({companyId:'a',storeId,items:[{id:'promo',productName:name,name:'Offer',promotionType:'LEAFLET',offerMode:'DISCOUNT_PERCENT',discountPercent:10,validFrom:'2026-11-17T12:00:00Z',active:true,stores:[{id:storeId,name:storeId}]}]});
const analysis=(storeId='a1',name='ANALYSIS')=>({companyId:'a',storeId,items:[{id:'promo',productName:name,salesCount:2,soldQuantity:3,salesAmount:12,discountAmount:2,returnedQuantity:1,returnedAmount:4}],totals:{salesAmount:12,discountAmount:2,returnedAmount:4},note:'Only attributed sales'});
const cases=[
 {key:'pending',name:'commerce/PendingCenterPanel',right:'pending.read',label:'Εκκρεμότητες Chat',refresh:'Ανανέωση',props:(api,storeId='a1')=>({api,companyId:'a',scopeStoreId:storeId,stores:[{id:storeId,name:storeId}],readOnly:true}),response:(path,id='a1',name)=>pending(id,name)},
 {key:'promotions',name:'commerce/StaffPromotionsPanel',right:'promotions.read',label:'Προσφορές',refresh:'Ανανέωση προσφορών',props:(api,storeId='a1')=>({api,companyId:'a',store:{id:storeId,name:storeId}}),response:(path,id='a1',name)=>path.includes('/analysis')?analysis(id,name):promotions(id,name)}
];

test('pending and promotions mount only their explicitly granted native store views',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const c of cases){
  const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[c.right]},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');
   assert.equal(new URL(path,'https://isolated.invalid').searchParams.get('storeId'),'a1');
   if(c.key==='pending')assert.match(path,/^\/api\/pending-center\/chat-tasks\?/);else assert.match(path,/^\/api\/price-catalog\/promotions\/(scoped|analysis)\?/);
   return c.response(path);
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,70)));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);
   for(const text of ['Κλείσιμο','Επαναφορά','Παύση','Ενεργοποίηση','Ανανέωση πηγών'])assert.ok(!button(text),`unexpected delegated action ${text}`);
   assert.ok(!calls.some(path=>/invoices|payments|inventory|chat-messages|lookups/.test(path)));
   await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});
   assert.ok(!document.body.textContent.includes(rowText));assert.ok(!button(c.label));
  }finally{await m.close()}
 }
});

test('pending and promotions discard delayed store data and clear denied refreshes',async()=>{
 for(const c of cases){
  const Component=await component(c.name);let mode='ok',resolveLate;
  const api=async(path,options={})=>{
   assert.equal(options.method||'GET','GET');
   const id=new URL(path,'https://isolated.invalid').searchParams.get('storeId');
   if(mode==='denied')throw Error('WITHDRAWN');
   if(mode==='delayed'&&id==='a1')return new Promise(resolve=>{if(path.includes('/analysis'))resolve(c.response(path,id,'LATE'));else resolveLate=()=>resolve(c.response(path,id,'LATE'))});
   return c.response(path,id,id==='a2'?'SECOND':rowText);
  };
  const m=await mount(Component,c.props(api));
  try{
   assert.ok(document.body.textContent.includes(rowText));
   mode='delayed';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes(rowText));
   await m.render(c.props(api,'a2'));assert.ok(document.body.textContent.includes('SECOND'));
   await m.act(async()=>resolveLate());assert.ok(!document.body.textContent.includes('LATE'));
   mode='denied';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes('SECOND'));assert.match(document.querySelector('[role="alert"]').textContent,/WITHDRAWN/);
  }finally{await m.close()}
 }
});

test('both native store views reject foreign company or store envelopes atomically',async()=>{
 for(const c of cases){
  const Component=await component(c.name);
  for(const wrong of ['company','store','nested']){
   const api=async path=>{const result=c.response(path);if(wrong==='company')result.companyId='foreign';if(wrong==='store')result.storeId='a2';if(wrong==='nested'){if(c.key==='pending')result.rows[0].storeId='a2';else if(!path.includes('/analysis'))result.items[0].stores=[{id:'a2',name:'Foreign'}]};return result};
   const m=await mount(Component,c.props(api));
   try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText));assert.ok(!document.body.textContent.includes('ANALYSIS'))}finally{await m.close()}
  }
 }
});

test('shared native promotion list preserves Owner toggles and escapes text in both modes',async()=>{
 const List=await component('commerce/NativePromotionList');let changed=0;
 const items=promotions().items,m=await mount(List,{items,onToggle(){changed++}});
 try{assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);await m.act(async()=>button('Παύση').click());assert.equal(changed,1);await m.render({items,onToggle(){changed++},readOnly:true});assert.ok(!button('Παύση'));assert.equal(document.querySelector('img'),null)}finally{await m.close()}
});

const baking=(storeId='a1',name=rowText)=>({companyId:'a',storeId,products:[{productId:'baked',name,sourceName:'Raw',sourceStock:8,currentStock:2,sameProduct:true}],history:[{id:'b1',name,quantity:2,actorName:'Baker',createdAt:'2026-11-17T12:00:00Z',sourceBefore:10,sourceAfter:8,finishedBefore:0,finishedAfter:2}]});
const invoiceMonth=(storeId='a1',month='2026-10',name=rowText)=>({companyId:'a',storeId,store:{id:storeId},period:{month},readOnly:true,asOf:'2026-11-17T12:00:00Z',coverage:{complete:true},summary:{logicalRecords:1,unposted:1,uploadedAwaitingReview:0,possibleDuplicates:0,identityReview:0,credits:0},items:[{id:'inv1',documentNumber:name,supplierName:'Supplier',issueDay:month+'-01',totalCents:120,categories:['UNPOSTED_DOCUMENT'],reasons:[]}],pendingOriginals:{available:false},nextPage:'page2'});

test('baking and monthly invoice audit are separate scoped native read views without write or email controls',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const kind of ['baking','monthly']){
  const right=kind==='baking'?'baking.read':'monthly-invoice-audit.read',label=kind==='baking'?'Ψησίματα':'Έλεγχος τιμολογίων μήνα',calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[right]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');
   if(kind==='baking'){assert.equal(path,'/api/store-pos/stores/a1/baking');return baking()}
   assert.match(path,/^\/api\/reports\/invoice-month-audit\?/);const params=new URL(path,'https://isolated.invalid').searchParams;assert.equal(params.get('storeId'),'a1');return invoiceMonth('a1',params.get('month'));
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(label).click());await m.act(async()=>new Promise(r=>setTimeout(r,60)));
   if(kind==='monthly')await m.act(async()=>document.querySelector('.invoice-month-audit form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);
   assert.ok(!button('Καταχώριση ψησίματος'));assert.ok(!button('Προεπισκόπηση μηνιαίου email'));
   assert.ok(!calls.some(path=>path.includes('email-preview')));
   if(kind==='baking')assert.equal(document.querySelector('input[type="number"]'),null);
  }finally{await m.close()}
 }
});

test('native baking clears delayed scope and revoked reads and validates selected company and store',async()=>{
 const Baking=await component('store/StoreBakingModal');let mode='ok',resolveLate;
 const api=async path=>{const id=path.split('/')[4];if(mode==='deny')throw Error('BAKE_WITHDRAWN');if(mode==='late'&&id==='a1')return new Promise(resolve=>{resolveLate=()=>resolve(baking('a1','LATE_BAKE'))});return baking(id,id==='a2'?'SECOND_BAKE':rowText)};
 const props=id=>({api,companyId:'a',store:{id,name:id},readOnly:true,onClose(){}}),m=await mount(Baking,props('a1'));
 try{
  assert.ok(document.body.textContent.includes(rowText));mode='late';await m.act(async()=>button('Ανανέωση ψησιμάτων').click());assert.ok(!document.body.textContent.includes(rowText));
  await m.render(props('a2'));assert.ok(document.body.textContent.includes('SECOND_BAKE'));await m.act(async()=>resolveLate());assert.ok(!document.body.textContent.includes('LATE_BAKE'));
  mode='deny';await m.act(async()=>button('Ανανέωση ψησιμάτων').click());assert.ok(!document.body.textContent.includes('SECOND_BAKE'));assert.match(document.querySelector('[role="alert"]').textContent,/BAKE_WITHDRAWN/);
 }finally{await m.close()}
 for(const wrong of ['companyId','storeId']){
  const value=baking();value[wrong]='foreign';const n=await mount(Baking,{...props('a1'),api:async()=>value});
  try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await n.close()}
 }
});

test('delegated monthly audit clears old month pages and denial, hides mail preview and rejects foreign envelopes',async()=>{
 const Audit=await component('commerce/MonthlyInvoiceAuditPanel');let mode='ok',resolveLate;const paths=[];
 const api=async path=>{paths.push(path);assert.ok(!path.includes('email-preview'));const q=new URL(path,'https://isolated.invalid').searchParams;if(mode==='deny')throw Error('AUDIT_WITHDRAWN');if(mode==='late')return new Promise(resolve=>{resolveLate=()=>resolve(invoiceMonth(q.get('storeId'),q.get('month'),'LATE_AUDIT'))});return invoiceMonth(q.get('storeId'),q.get('month'))};
 const props={api,companyId:'a',storeId:'a1',storeName:'A1',initialMonth:'2026-10',delegated:true},m=await mount(Audit,props);
 const submit=()=>m.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 try{
  await submit();assert.ok(document.body.textContent.includes(rowText));assert.ok(!button('Προεπισκόπηση μηνιαίου email'));
  mode='late';await submit();assert.ok(!document.body.textContent.includes(rowText));
  await m.act(async()=>{const input=document.querySelector('input[type="month"]');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,'2026-11');input.dispatchEvent(new Event('input',{bubbles:true}))});
  await m.act(async()=>resolveLate());assert.ok(!document.body.textContent.includes('LATE_AUDIT'));
  mode='ok';await submit();assert.ok(document.body.textContent.includes(rowText));
  await m.act(async()=>button('Επόμενη σελίδα').click());assert.ok(paths.some(path=>path.includes('page=page2')));
  mode='deny';await submit();assert.ok(!document.body.textContent.includes(rowText));assert.match(document.querySelector('[role="alert"]').textContent,/AUDIT_WITHDRAWN/);
 }finally{await m.close()}
 for(const wrong of ['companyId','storeId','nestedStore','month']){
  const n=await mount(Audit,{...props,api:async()=>{const r=invoiceMonth();if(wrong==='companyId')r.companyId='foreign';if(wrong==='storeId')r.storeId='foreign';if(wrong==='nestedStore')r.store.id='foreign';if(wrong==='month')r.period.month='2026-09';return r}});
  try{await n.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await n.close()}
 }
});

const onlineOrders=(storeId='a1',name=rowText)=>({companyId:'a',storeId,store:{id:storeId,name:storeId,isTest:false},rows:[{id:'online1',companyId:'a',storeId,orderNumber:'123',customerName:name,customerPhone:'2100000000',status:'NEW',createdAt:'2026-11-17T12:00:00Z',total:5,paymentMethod:'CASH',fulfillmentType:'PICKUP'}],count:1});
const tableService=(path,storeId='a1',name=rowText)=>{
 const scope={companyId:'a',storeId};
 if(path.endsWith('/history'))return {...scope,orders:[{id:'table-order',companyId:'a',storeId,tableName:name,operatorName:'Waiter',status:'OPEN',createdAt:'2026-11-17T12:00:00Z',total:4,items:[{quantity:1,name:'Coffee',lineTotal:4}]}],waste:[]};
 if(path.endsWith('/preparation-queue'))return {...scope,rows:[{id:'queue1',tableName:name,operatorName:'Waiter',status:'SENT',productionStation:'BAR',createdAt:'2026-11-17T12:00:00Z',items:[{quantity:1,name:'Coffee',notes:'No sugar'}]}]};
 return {...scope,areas:[],tables:[{id:'table1',name,areaId:null,capacity:4,shape:'ROUND',positionX:20,positionY:20}],canConfigure:true};
};
const orderViewCases=[
 {name:'commerce/OnlineOrdersBackofficePanel',right:'online-orders.read',label:'Online Παραγγελίες',match:/^\/api\/public\/kat\/backoffice-managed\/stores\/a1\/orders\?limit=250$/,response:onlineOrders,fixture:(path,id,name)=>onlineOrders(id,name)},
 {name:'commerce/TableServiceBackofficePanel',right:'table-service.read',label:'Τραπέζια και σερβιτόροι',match:/^\/api\/store-pos\/stores\/a1\/table-service(?:\/history|\/preparation-queue)?$/,fixture:tableService}
];

test('delegated online orders and tables reuse native store views without managed store lookups or producers',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const c of orderViewCases){
  const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[c.right]},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');assert.match(path,c.match);return c.fixture(path,'a1',rowText);
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,60)));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);
   assert.ok(!calls.includes('/api/public/kat/backoffice-managed/stores'));
   for(const text of ['ΔΗΜΙΟΥΡΓΙΑ ΣΑΛΑΣ','ΔΗΜΙΟΥΡΓΙΑ ΤΡΑΠΕΖΙΟΥ','ΕΠΕΞΕΡΓΑΣΙΑ','ΕΤΟΙΜΗ ΣΤΟ'])assert.ok(!button(text));
   if(c.right==='table-service.read'){
    assert.ok(document.querySelector('.table-floor-canvas'));assert.ok(document.querySelector('.table-floor-item').disabled);
    assert.equal(document.querySelector('.table-config-forms'),null);
   }else{await m.act(async()=>button('#123').click());assert.match(document.body.textContent,/Εμπορική εγγραφή σε αναμονή/)}
   await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});
   assert.ok(!document.body.textContent.includes(rowText));assert.ok(!button(c.label));
  }finally{await m.close()}
 }
});

test('delegated order views discard delayed stores, clear revoked refreshes and table reads do not poll',async()=>{
 for(const c of orderViewCases){
  const Component=await component(c.name);let mode='ok',late=[];const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');assert.notEqual(path,'/api/public/kat/backoffice-managed/stores');
   const id=path.match(/\/stores\/([^/]+)/)?.[1];
   if(mode==='deny')throw Error('ORDER_VIEW_WITHDRAWN');
   if(mode==='late'&&id==='a1')return new Promise(resolve=>late.push(()=>resolve(c.fixture(path,id,'LATE_ORDER_VIEW'))));
   return c.fixture(path,id,id==='a2'?'SECOND_ORDER_VIEW':rowText);
  };
  const props=id=>({api,companyId:'a',stores:[{id,name:id}],activeStoreId:id,readOnly:true});
  const original=globalThis.setInterval;let polls=0;globalThis.setInterval=(...args)=>{polls++;return original(...args)};
  const m=await mount(Component,props('a1'));
  try{
   assert.ok(document.body.textContent.includes(rowText));mode='late';await m.act(async()=>button('Ανανέωση').click());assert.ok(!document.body.textContent.includes(rowText));
   await m.render(props('a2'));assert.ok(document.body.textContent.includes('SECOND_ORDER_VIEW'));await m.act(async()=>late.forEach(resolve=>resolve()));assert.ok(!document.body.textContent.includes('LATE_ORDER_VIEW'));
   mode='deny';await m.act(async()=>button('Ανανέωση').click());assert.ok(!document.body.textContent.includes('SECOND_ORDER_VIEW'));assert.match(document.querySelector('[role="alert"]').textContent,/ORDER_VIEW_WITHDRAWN/);
   assert.equal(polls,0);assert.ok(calls.every(path=>path.includes('/stores/a1/')||path.includes('/stores/a2/')));
  }finally{await m.close();globalThis.setInterval=original}
 }
});

test('order views reject foreign envelope members and table histories publish only after all three validated responses',async()=>{
 for(const c of orderViewCases){
  const Component=await component(c.name),paths=c.right==='table-service.read'?['/history','/preparation-queue','/table-service']:['/orders'];
  for(const suffix of paths){
   for(const field of ['companyId','storeId']){
    const api=async path=>{const value=c.fixture(path,'a1',rowText);if(path.split('?')[0].endsWith(suffix))value[field]='foreign';return value};
    const m=await mount(Component,{api,companyId:'a',stores:[{id:'a1',name:'A1'}],activeStoreId:'a1',readOnly:true});
    try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
   }
  }
 }
 for(const c of orderViewCases){
  const Component=await component(c.name);
  for(const field of ['companyId','storeId']){
   const api=async path=>{const value=c.fixture(path,'a1',rowText);if(c.right==='online-orders.read')value.rows[0][field]='foreign';else if(path.endsWith('/history'))value.orders[0][field]='foreign';return value};
   const n=await mount(Component,{api,companyId:'a',stores:[{id:'a1',name:'A1'}],activeStoreId:'a1',readOnly:true});
   try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await n.close()}
  }
 }
 const Online=await component('commerce/OnlineOrdersBackofficePanel'),m=await mount(Online,{api:async()=>({...onlineOrders(),store:{id:'a2',name:'Foreign'}}),companyId:'a',stores:[{id:'a1',name:'A1'}],activeStoreId:'a1',readOnly:true});
 try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
});

test('native Owner table view keeps configuration and production actions by default',async()=>{
 const Tables=await component('commerce/TableServiceBackofficePanel');
 const m=await mount(Tables,{api:async path=>tableService(path),stores:[{id:'a1',name:'A1'}],activeStoreId:'a1'});
 try{assert.ok(button('ΔΗΜΙΟΥΡΓΙΑ ΣΑΛΑΣ'));assert.ok(button('ΔΗΜΙΟΥΡΓΙΑ ΤΡΑΠΕΖΙΟΥ'));assert.ok(button('ΕΠΕΞΕΡΓΑΣΙΑ'));assert.ok(button('ΕΤΟΙΜΗ ΣΤΟ'));assert.ok(!document.querySelector('.table-floor-item').disabled)}finally{await m.close()}
});

const aiJobs=(storeId='a1',name=rowText)=>({companyId:'a',storeId,items:[{id:'job1',companyId:'a',storeId,filename:name,stage:'LOCAL',status:'AWAITING_APPROVAL',localConfidence:91,documentNumber:'INV1',totalGross:12,purchaseDocumentId:'draft1',canApproveStandaloneDraft:true,result:{pdfNote:'Persisted OCR',productLines:[{code:'X',description:name,quantity:2,netAmount:10,grossAmount:12,vatRate:24}],posHandoff:{documentNumber:'INV1'}}}]});
const transferHistory=(path,storeId='a1',name=rowText)=>({companyId:'a',storeId,items:path.endsWith('/credit')?[{id:'credit1',createdAt:'2026-11-17T12:00:00Z',sourceName:name,destinationName:'Other store',payable:12,canPayCash:true}]:path.endsWith('/pending-cash-receipts')?[{id:'receipt1',destinationName:name,amount:4}]:[{id:'external1',createdAt:'2026-11-17T12:00:00Z',destinationName:name}]});
const transferAiCases=[
 {name:'store/PosInternalTransfer',right:'stock-transfers.read',label:'Διακινήσεις αποθήκης',refresh:'Ανανέωση διακινήσεων',fixture:transferHistory,path:/^\/api\/store-pos\/stores\/a1\/internal-transfers\/(credit|pending-cash-receipts|external-history)$/,id:path=>path.match(/\/stores\/([^/]+)/)?.[1]},
 {name:'commerce/AiReaderPanel',right:'invoice-ai.read',label:'Αναγνώσεις τιμολογίων',refresh:'Ανανέωση',fixture:(path,id,name)=>aiJobs(id,name),path:/^\/api\/commerce\/ai-reader\/jobs\?storeId=a1$/,id:path=>new URL(path,'https://isolated.invalid').searchParams.get('storeId')}
];

test('transfer and invoice AI views grant only existing history reads and never expose producers or company bootstraps',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const c of transferAiCases){
  const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[c.right]},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');assert.match(path,c.path);return c.fixture(path,'a1',rowText);
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,60)));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);
   for(const text of ['Εξόφληση','Καταχώριση είσπραξης','Αποστολή PDF','Υπολογισμός αξίας','Ελαχιστοποίηση','Έναρξη τοπικού OCR','Έλεγχος & αντιστοίχιση','Επανέλεγχος με AI','Έγκριση αποθήκης'])assert.ok(!button(text),text);
   assert.equal(document.querySelector('input[type="file"]'),null);assert.ok(!calls.some(path=>/destinations|products|suppliers|status/.test(path)));
   if(c.right==='invoice-ai.read')assert.ok(document.querySelector('summary').textContent.includes('Διαγνωστικά OCR'));
   if(c.right==='stock-transfers.read'){
    await m.act(async()=>button('Κλείσιμο').click());assert.equal(document.querySelector('.pos-transfer-overlay'),null);
    await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,30)));
   }
   await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(!document.body.textContent.includes(rowText));assert.ok(!button(c.label));
  }finally{await m.close()}
 }
});

test('transfer and invoice job reads clear withdrawn data and discard delayed stores',async()=>{
 for(const c of transferAiCases){
  const Component=await component(c.name);let mode='ok',late=[];
  const api=async(path,options={})=>{
   assert.equal(options.method||'GET','GET');const id=c.id(path);
   if(mode==='deny')throw Error('HISTORY_WITHDRAWN');
   if(mode==='late'&&id==='a1')return new Promise(resolve=>late.push(()=>resolve(c.fixture(path,id,'LATE_HISTORY'))));
   return c.fixture(path,id,id==='a2'?'SECOND_HISTORY':rowText);
  };
  const props=id=>({api,companyId:'a',storeId:id,readOnly:true,onClose(){},focusJobId:'job1'}),m=await mount(Component,props('a1'));
  try{
   assert.ok(document.body.textContent.includes(rowText));mode='late';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes(rowText));
   await m.render(props('a2'));assert.ok(document.body.textContent.includes('SECOND_HISTORY'));await m.act(async()=>late.forEach(resolve=>resolve()));assert.ok(!document.body.textContent.includes('LATE_HISTORY'));
   mode='deny';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes('SECOND_HISTORY'));assert.match(document.querySelector('[role="alert"]').textContent,/HISTORY_WITHDRAWN/);
   assert.equal(document.querySelector('.ai-confirm'),null);
  }finally{await m.close()}
 }
});

test('transfer histories publish atomically after all scoped responses and invoice jobs validate nested scope',async()=>{
 for(const c of transferAiCases){
  const Component=await component(c.name),suffixes=c.right==='stock-transfers.read'?['/credit','/pending-cash-receipts','/external-history']:['/jobs'];
  for(const suffix of suffixes)for(const field of ['companyId','storeId']){
   const api=async path=>{const r=c.fixture(path,'a1',rowText);if(path.split('?')[0].endsWith(suffix))r[field]='foreign';return r};
   const m=await mount(Component,{api,companyId:'a',storeId:'a1',readOnly:true,onClose(){}});
   try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
  }
 }
 const Ai=await component('commerce/AiReaderPanel');
 for(const field of ['companyId','storeId']){
  const api=async()=>{const r=aiJobs();r.items[0][field]='foreign';return r},m=await mount(Ai,{api,companyId:'a',storeId:'a1',readOnly:true});
  try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
 }
});

test('native transfer and OCR Owner modes retain destinations and producer controls',async()=>{
 const Transfer=await component('store/PosInternalTransfer');
 const a=await mount(Transfer,{api:async path=>path.endsWith('/destinations')?[{id:'a2',name:'Other store'}]:transferHistory(path).items,storeId:'a1',scanCatalog:{exact(){}},onClose(){},onMinimize(){}});
 try{assert.ok(button('Ελαχιστοποίηση'));assert.ok(button('Εξόφληση'));assert.ok(button('Καταχώριση είσπραξης'));assert.ok(button('Αποστολή PDF'));assert.ok(button('Υπολογισμός αξίας'))}finally{await a.close()}
 const Ai=await component('commerce/AiReaderPanel'),paths=[];
 const b=await mount(Ai,{api:async path=>{paths.push(path);return path.includes('/jobs?')?aiJobs().items:[]},storeId:'a1',status:{localConfidenceThreshold:65}});
 try{assert.ok(button('Έναρξη τοπικού OCR'));assert.ok(button('Έλεγχος & αντιστοίχιση'));assert.ok(button('Επανέλεγχος με AI'));assert.ok(button('Έγκριση αποθήκης'));assert.ok(paths.includes('/api/commerce/products'));assert.ok(paths.includes('/api/commerce/suppliers'))}finally{await b.close()}
});

const wholesaleOrder=(storeId='a1',name=rowText,id='o1')=>({id,companyId:'a',storeId,status:'SUBMITTED',createdAt:'2026-11-17T12:00:00Z',grossTotal:'12.00',notes:'Stored notes',snapshot:{storeId,customerName:name,items:[{productId:'p1',name,unit:'PC',quantity:'2',netTotal:'10.00',vatTotal:'2.00',grossTotal:'12.00'}],totals:{net:'10.00',vat:'2.00',gross:'12.00'}}});
const wholesaleView=(path,storeId='a1',name=rowText)=>{
 const q=new URL(path,'https://isolated.invalid').searchParams,id=path.split('?')[0].match(/\/orders\/([^/]+)/)?.[1];
 return id?{companyId:'a',storeId,order:wholesaleOrder(storeId,name,id)}:{companyId:'a',storeId,items:[wholesaleOrder(storeId,name,Number(q.get('page'))===2?'o2':'o1')],total:51,page:Number(q.get('page')||1),pageSize:50};
};
const videoView=(path,storeId='a1',name=rowText)=>({companyId:'a',storeId,store:{id:storeId,name},connection:{provider:'DAHUA',protocol:'ONVIF',connectionStatus:'READY',retentionDays:30},cameras:[{cameraKey:'CAM1',displayName:name,zone:'POS_1',active:true}],connector:{online:true,deviceName:'Connector',version:'2'}});
const printerView=(path,storeId='a1',name=rowText)=>({companyId:'a',storeId,canConfigure:true,jobs:[{id:'j1',batchId:name,status:'UNKNOWN',createdAt:'2026-11-17T12:00:00Z'}]});
const otherReadCases=[
 {key:'wholesale',name:'commerce/WholesaleB2BPanel',right:'wholesale.read',label:'Παραγγελίες χονδρικής',refresh:'Ανανέωση παραγγελιών',fixture:wholesaleView,id:path=>new URL(path,'https://isolated.invalid').searchParams.get('storeId'),props:(api,id='a1')=>({api,companyId:'a',stores:[{id,name:id}],activeStoreId:id,readOnly:true})},
 {key:'video',name:'commerce/BackofficeVideoAuditPanel',right:'video.read',label:'Κάμερες / Video Audit',refresh:'Ανανέωση κατάστασης',fixture:videoView,id:path=>path.match(/\/stores\/([^/]+)/)?.[1],props:(api,id='a1')=>({api,companyId:'a',storeId:id,readOnly:true})},
 {key:'printers',name:'store/ProductionPrinterStatusPanel',right:'printers.read',label:'Κατάσταση εκτυπώσεων',refresh:'Ανανέωση εκτυπώσεων',fixture:printerView,id:path=>path.match(/\/stores\/([^/]+)/)?.[1],props:(api,id='a1')=>({api,companyId:'a',store:{id,name:id},onClose(){}})}
];

test('wholesale video and printer view grants reuse native presentation and admit only their scoped GETs',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const c of otherReadCases){
  const calls=[];
  const api=async(path,options={})=>{
   calls.push(path);assert.equal(options.method||'GET','GET');
   if(path.endsWith('/me'))return {companyId:'a',stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:[c.right]},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:[]}]};
   assert.equal(options.headers['x-backoffice-store-id'],'a1');assert.equal(c.id(path),'a1');
   if(c.key==='wholesale')assert.match(path,/^\/api\/wholesale\/orders(?:\/o[12])?\?/);
   if(c.key==='video')assert.equal(path,'/api/video-admin/stores/a1');
   if(c.key==='printers')assert.equal(path,'/api/production-printers/stores/a1');
   return c.fixture(path,'a1',rowText);
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout(){}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button(c.label).click());await m.act(async()=>new Promise(r=>setTimeout(r,60)));
   assert.ok(document.body.textContent.includes(rowText));assert.equal(document.querySelector('img'),null);
   for(const text of ['Νέος πελάτης','Νέος τιμοκατάλογος','Υπολογισμός τιμών','Δημιουργία κωδικού Video Connector','Αποθήκευση καμερών','Λήψη connector Windows','Κωδικός ζεύξης','Καταγραφή ελέγχου','Αποθήκευση σύνδεσης'])assert.ok(!button(text),text);
   assert.ok(!calls.some(path=>/customers|price-lists|quotes|products|packages|connector|pairing/.test(path)));
   if(c.key==='wholesale'){
    await m.act(async()=>document.querySelector('.wholesale-order-list-row').click());assert.ok(document.querySelector('[aria-label="Λεπτομέρειες παραγγελίας"]'));assert.ok(document.querySelector('table').textContent.includes(rowText));
    await m.act(async()=>button('Επόμενες παραγγελίες').click());assert.ok(calls.some(path=>path.includes('page=2')));assert.equal(document.querySelector('[aria-label="Λεπτομέρειες παραγγελίας"]'),null);
   }
   if(c.key==='video'){assert.ok([...document.querySelectorAll('.commerce-form input,.commerce-form select')].every(input=>input.disabled));assert.ok(!document.body.textContent.includes('Δεν έχει ρυθμιστεί'))}
   await m.act(async()=>{const select=document.querySelector('select');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(!document.body.textContent.includes(rowText));assert.ok(!button(c.label));
  }finally{await m.close()}
 }
});

test('native wholesale video and printer read views discard late stores and clear denied refreshes',async()=>{
 for(const c of otherReadCases){
  const Component=await component(c.name);let mode='ok',late=[];
  const api=async(path,options={})=>{assert.equal(options.method||'GET','GET');const id=c.id(path);if(mode==='deny')throw Error('NATIVE_READ_WITHDRAWN');if(mode==='late'&&id==='a1')return new Promise(resolve=>late.push(()=>resolve(c.fixture(path,id,'LATE_NATIVE'))));return c.fixture(path,id,id==='a2'?'SECOND_NATIVE':rowText)};
  const m=await mount(Component,c.props(api));
  try{
   assert.ok(document.body.textContent.includes(rowText));mode='late';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes(rowText));
   await m.render(c.props(api,'a2'));assert.ok(document.body.textContent.includes('SECOND_NATIVE'));await m.act(async()=>late.forEach(resolve=>resolve()));assert.ok(!document.body.textContent.includes('LATE_NATIVE'));
   mode='deny';await m.act(async()=>button(c.refresh).click());assert.ok(!document.body.textContent.includes('SECOND_NATIVE'));assert.match(document.querySelector('[role="alert"]').textContent,/NATIVE_READ_WITHDRAWN/);
  }finally{await m.close()}
 }
});

test('new native views reject mismatched envelopes and wholesale nested store or detail identities',async()=>{
 for(const c of otherReadCases){
  const Component=await component(c.name);
  for(const field of ['companyId','storeId']){
   const api=async path=>{const r=c.fixture(path,'a1',rowText);r[field]='foreign';return r},m=await mount(Component,c.props(api));
   try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
  }
 }
 const Wholesale=await component('commerce/WholesaleB2BPanel');
 for(const wrong of ['nestedCompany','nestedStore','snapshotStore','detailId','detailEnvelope','detailNestedStore']){
  const api=async path=>{const r=wholesaleView(path);if(r.items){if(wrong==='nestedCompany')r.items[0].companyId='foreign';if(wrong==='nestedStore')r.items[0].storeId='a2';if(wrong==='snapshotStore')r.items[0].snapshot.storeId='a2'}else{if(wrong==='detailId')r.order.id='another';if(wrong==='detailEnvelope')r.companyId='foreign';if(wrong==='detailNestedStore')r.order.snapshot.storeId='a2'}return r};
  const m=await mount(Wholesale,otherReadCases[0].props(api));
  try{if(wrong.startsWith('detail'))await m.act(async()=>document.querySelector('.wholesale-order-list-row').click());assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
 }
 const Video=await component('commerce/BackofficeVideoAuditPanel'),m=await mount(Video,{...otherReadCases[1].props(async()=>({...videoView(),store:{id:'a2',name:rowText}}))});
 try{assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes(rowText))}finally{await m.close()}
});

test('native Owner video controls and printer configuration remain available by default',async()=>{
 const Video=await component('commerce/BackofficeVideoAuditPanel');
 const a=await mount(Video,{api:async()=>videoView(),storeId:'a1'});
 try{assert.ok(button('Δημιουργία κωδικού Video Connector'));assert.ok(button('Αποθήκευση καμερών'));assert.ok([...document.querySelectorAll('.commerce-form input')].some(input=>!input.disabled))}finally{await a.close()}
 const Printer=await component('store/ProductionPrinterSettings'),b=await mount(Printer,{api:async()=>({}),store:{id:'a1',name:'A1'},state:{canConfigure:true,jobs:[]},cart:[],onClose(){},onSaved(){}});
 try{assert.ok(button('Αποθήκευση σύνδεσης'));assert.ok(button('Λήψη connector Windows'));assert.ok(button('Κωδικός ζεύξης'))}finally{await b.close()}
});

test('delegated monthly audit preserves paid financial observation separately from posting without preview or added permission',async()=>{const Audit=await component('commerce/MonthlyInvoiceAuditPanel'),calls=[];let available=true;const api=async(path,options={})=>{calls.push(path);assert.equal(options.method,undefined);assert.match(path,/^\/api\/reports\/invoice-month-audit\?/);const q=new URL(path,'https://isolated.invalid').searchParams,d=invoiceMonth(q.get('storeId'),q.get('month'));return {...d,paymentCoverage:{available},financialSummary:{paid:1,financialPending:0,reviewRequired:0,notLinked:0,notApplicable:0},allClear:true,items:d.items.map(row=>({...row,payment:available?{status:'PAID',paidCents:120,remainingCents:0,overpaymentCents:0,paymentCount:1}:{status:'UNAVAILABLE',paidCents:null,remainingCents:null}}))}},m=await mount(Audit,{api,companyId:'a',storeId:'a1',storeName:'Named store',initialMonth:'2026-10',delegated:true});try{const submit=()=>m.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await submit();assert.match(document.querySelector('.ima-payment').textContent,/Εξοφλημένο/);assert.match(document.querySelector('.ima-workflow-review').textContent,/Δεν έχει καταχωριστεί/);assert.equal(document.querySelector('.ima-workflow-review').open,false);assert.ok(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]'));assert.ok(!button('Προεπισκόπηση μηνιαίου email'));available=false;await submit();assert.equal(document.querySelector('.ima-safe'),null);assert.equal(document.querySelector('[aria-label="Οικονομικά σύνολα επιλεγμένου μήνα"]'),null);assert.match(document.querySelector('.ima-financial').textContent,/οικονομικό υπόλοιπο είναι άγνωστο/);assert.ok(calls.every(path=>!path.includes('email')&&!path.includes('payment')))}finally{await m.close()}});
