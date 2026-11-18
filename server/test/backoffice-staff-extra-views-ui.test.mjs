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
