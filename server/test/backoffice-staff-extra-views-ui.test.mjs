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
