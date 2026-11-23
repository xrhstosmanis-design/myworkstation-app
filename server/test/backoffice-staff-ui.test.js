import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
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
const identity={userId:'staff',companyId:'a',fullName:'Fixture',username:'fixture',stores:[{id:'a1',name:'A1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:['cash.read']}]};
const button=text=>{
  const buttons=[...document.querySelectorAll('button')].filter(b=>!b.closest('.staff-menu-groups'));
  return buttons.find(b=>b.textContent.trim()===text) || buttons.find(b=>b.textContent.includes(text));
};
test('personal inventory page navigation clears old detail, uses scoped cursors and refresh resets to page one',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const row=id=>({id,name:'PAGE '+id,status:'DRAFT',storeId:'a1',lines:[]});
 const api=async(path,options={})=>{
  calls.push({path,options});assert.equal(options.method||'GET','GET');
  if(path.endsWith('/me'))return identity;
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  if(path.endsWith('/stocktakes'))return {storeId:'a1',stocktakes:[row('first')],nextCursor:'first'};
  if(path.endsWith('?after=first'))return {storeId:'a1',stocktakes:[row('second')],nextCursor:null};
  return row('first');
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(r=>setTimeout(r,60)));
  assert.equal(button('Προηγούμενες απογραφές').disabled,true);
  await m.act(async()=>document.querySelector('.inv2-history-open').click());assert.match(document.querySelector('.inv2-work').textContent,/PAGE first/);
  await m.act(async()=>button('Επόμενες απογραφές').click());
  assert.equal(document.querySelector('.inv2-work h3'),null);assert.match(document.querySelector('.inv2-history').textContent,/PAGE second/);
  assert.equal(button('Επόμενες απογραφές').disabled,true);assert.match(document.querySelector('.inv2-list-pages').textContent,/Σελίδα 2/);
  await m.act(async()=>button('Προηγούμενες απογραφές').click());assert.match(document.querySelector('.inv2-history').textContent,/PAGE first/);
  await m.act(async()=>button('Επόμενες απογραφές').click());await m.act(async()=>button('Φόρτωση / Ανανέωση').click());
  assert.match(document.querySelector('.inv2-list-pages').textContent,/Σελίδα 1/);assert.equal(button('Προηγούμενες απογραφές').disabled,true);
  assert.ok(calls.some(x=>x.path.endsWith('?after=first')));
 }finally{await m.close()}
});
test('personal detail pages and barcode lookup remain scoped to the open stocktake',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 const draft={id:'draft',storeId:'a1',name:'Paged draft',status:'DRAFT'};
 const first={id:'line-1',name:'First page item',barcodes:['111'],countedQuantity:null};
 const second={id:'line-2',name:'Second page item',barcodes:['000123'],countedQuantity:null};
 const base='/api/backoffice-staff/inventory/stores/a1/stocktakes';
 const api=async(path,options={})=>{
  assert.equal(options.method||'GET','GET');
  if(path.endsWith('/me'))return identity;
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  if(path===base)return {storeId:'a1',stocktakes:[draft]};
  if(path===base+'/draft?paged=1')return {...draft,lines:[first],nextCursor:first.id};
  if(path===base+'/draft?paged=1&after=line-1'||path===base+'/draft?paged=1&code=000123')return {...draft,lines:[second],nextCursor:null};
  assert.fail(path);
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
  await m.act(async()=>document.querySelector('.inv2-history-open').click());
  const table=()=>document.querySelector('.inv2-table-wrap').textContent;
  assert.match(table(),/First page item/);
  assert.doesNotMatch(table(),/Second page item/);
  await m.act(async()=>button('Επόμενες γραμμές').click());
  assert.match(table(),/Second page item/);
  assert.equal(button('Επόμενες γραμμές').disabled,true);
  await m.act(async()=>button('Προηγούμενες γραμμές').click());
  assert.match(table(),/First page item/);
  const input=document.querySelector('input[placeholder="Barcode, SKU ή περιγραφή"]');
  await m.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'000123');input.dispatchEvent(new Event('input',{bubbles:true}))});
  await m.act(async()=>input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.match(document.querySelector('.inv2-work').textContent,/Second page item/);
 }finally{await m.close()}
});
test('actual personal workspace wires the independent theory flag and does not invent a difference for an uncounted row',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 const calls=[],row={id:'st',storeId:'a1',name:'Theory-only draft',status:'DRAFT',lines:[{id:'line',name:'Not counted',sku:'NC',barcodes:[],countedQuantity:null,expectedQuantity:'7',countVersion:0}]};
 const api=async(path,options={})=>{calls.push({path,options});assert.equal(options.method||'GET','GET');if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['inventory.read','inventory.expected.read']}]};return path.endsWith('/stocktakes')?{storeId:'a1',stocktakes:[row]}:row};
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(r=>setTimeout(r,50)));await m.act(async()=>document.querySelector('.inv2-history-open').click());
  const table=document.querySelector('.inv2-table-wrap');assert.ok(table);assert.match(table.textContent,/Απόθεμα/);assert.match(table.textContent,/Διαφορά/);assert.ok(!table.textContent.includes('-7'));
  assert.equal(table.querySelector('tfoot th:nth-last-child(2)').textContent,'—');
  assert.equal(document.querySelector('[title="Διόρθωση"]'),null);assert.equal(button('Οριστικοποίηση'),undefined);assert.ok(!table.textContent.includes('Αξία κόστους'));
  assert.ok(calls.filter(x=>!x.path.endsWith('/me')).every(x=>x.options.headers['x-backoffice-store-id']==='a1'));
 }finally{await m.close()}
});
test('native personal finalized history separates theoretical visibility from all edits and financial fields',async()=>{
 const Center=await component('inventory/InventoryV2Center');
 const current={id:'st',name:'History fixture',status:'FINALIZED',lines:[{id:'line',name:'Fixture',sku:'SKU',barcodes:['123'],countVersion:4,countedQuantity:'4',expectedQuantity:'991',unitCost:879,salePrice:982}]};
 for(const expected of [false,true]){
  const delegated={storeId:'a1',storeName:'A1',stocktakes:[current],listLoaded:true,current,canCount:true,canClear:true,canBulkZero:true,canFinalize:false,canSeeExpected:expected,onLoad:()=>{},onOpen:()=>{},setError:()=>{}};
  const m=await mount(Center,{current,stores:[{id:'a1',name:'A1'}],delegated,api:async()=>assert.fail('personal history must not call Owner endpoints')});
  try{
   assert.ok(document.querySelector('.inv2-table-wrap'));
   assert.equal(document.body.textContent.includes('991'),expected);
   assert.equal(document.querySelector('[title="Διόρθωση"]'),null);assert.equal(document.querySelector('[title="Διαγραφή καταμέτρησης"]'),null);
   assert.equal(document.querySelector('[aria-label="Επιλογή Fixture"]'),null);
   assert.equal(button('Οριστικοποίηση'),undefined);assert.equal(button('Ομαδική καταμέτρηση'),undefined);
   assert.equal(button('Full Audit'),undefined);assert.equal(button('Excel / CSV'),undefined);
   assert.ok(document.querySelector('[aria-label="Αναζήτηση είδους"]'));
   for(const hidden of ['879','982','Αξία κόστους','Αξία λιανικής'])assert.ok(!document.body.textContent.includes(hidden));
  }finally{await m.close()}
 }
});
test('personal destructive inventory retry retains exact request identity and freezes navigation until a verified reply',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const kind of ['clear','bulk-zero','delete']){
  const writes=[],store={id:'a1',name:'A1'},take={id:'st',storeId:'a1',name:'Draft fixture',status:'DRAFT',lines:[{id:'line',name:'Fixture',countedQuantity:2,countVersion:6,barcodes:['123']}]};let reply=false;
  const api=async(path,options={})=>{
   if(options.method){writes.push({path,options});if(!reply)throw Error('Uncertain network reply');return {ok:true,stocktakeId:'st',updated:1,deleted:true}}
   if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['inventory.read','inventory.'+kind]}]};
   return path.endsWith('/stocktakes')?{storeId:'a1',stocktakes:[take]}:take;
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
   globalThis.confirm=()=>true;
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(r=>setTimeout(r,70)));
   if(kind!=='delete'){
    await m.act(async()=>document.querySelector('.inv2-history button').click());
    if(kind==='bulk-zero')await m.act(async()=>document.querySelector('[aria-label="Επιλογή Fixture"]').click());
   }
   const target=kind==='delete'?document.querySelector('.inv2-history-delete'):kind==='clear'?document.querySelector('[title="Διαγραφή καταμέτρησης"]'):button('Ομαδική καταμέτρηση');
   assert.ok(target,kind);await m.act(async()=>target.click());assert.equal(writes.length,1);
   assert.equal(document.querySelector('select').disabled,true);assert.ok(button('Επαλήθευση ίδιας ενέργειας'));
   reply=true;await m.act(async()=>button('Επαλήθευση ίδιας ενέργειας').click());
   assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.equal(writes[0].options.headers['x-backoffice-store-id'],'a1');
   assert.equal(document.querySelector('select').disabled,false);assert.equal(button('Επαλήθευση ίδιας ενέργειας'),undefined);
  }finally{await m.close()}
 }
});
test('native clear and selected-zero controls work independently of ordinary counting and preserve exact versions',async()=>{
 const Count=await component('inventory/InventoryFastCount'),calls=[];
 const current={id:'take',status:'DRAFT',lines:[{id:'line',name:'Fixture item',countedQuantity:3,countVersion:4,barcodes:['123']}]};
 let delegated={canCount:false,canClear:true,canBulkZero:false,onClear:async request=>{calls.push(request);return true}};
 const m=await mount(Count,{current,api:async()=>{throw Error('Owner API must not run')},setError:()=>{},delegated});
 try{
  globalThis.confirm=()=>true;
  assert.equal(document.querySelector('[title="Διόρθωση"]'),null);
  assert.equal(document.querySelector('[aria-label="Επιλογή Fixture item"]'),null);
  await m.act(async()=>document.querySelector('[title="Διαγραφή καταμέτρησης"]').click());
  assert.equal(calls.length,1);assert.equal(calls[0].body.expectedVersion,4);assert.equal(calls[0].lineId,'line');assert.match(calls[0].body.clientEventId,/^[a-f0-9-]{36}$/);
  delegated={canCount:false,canBulkZero:true,onBulkZero:async request=>{calls.push(request);return true}};
  await m.render({current,api:async()=>{throw Error('Owner API must not run')},setError:()=>{},delegated});
  assert.equal(document.querySelector('[title="Διαγραφή καταμέτρησης"]'),null);
  await m.act(async()=>document.querySelector('[aria-label="Επιλογή Fixture item"]').click());
  await m.act(async()=>button('Ομαδική καταμέτρηση').click());
  assert.deepEqual(calls[1].body.lines,[{lineId:'line',expectedVersion:4}]);assert.match(calls[1].body.clientBatchId,/^[a-f0-9-]{36}$/);
  await m.render({current,api:async()=>{},setError:()=>{},delegated:{...delegated,locked:true}});
  assert.equal(document.querySelector('[aria-label="Επιλογή Fixture item"]').disabled,true);
 }finally{await m.close()}
});
test('delegated payment history requires only payments.read and does not expose payment actions',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['payments.read']}]};
  assert.equal(path,'/api/backoffice-staff/payments/stores/a1');
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  assert.equal(options.headers['x-mws-terminal-pos'],undefined);
  return {storeId:'a1',suppliers:[],purchaseDocuments:[],recentBankTransfers:[
    {id:'transfer-1',occurredAt:'2026-11-13T14:20:00Z',amount:42,supplierName:'Fixture Supplier',type:'SUPPLIER_PAYMENT',status:'PENDING_REVIEW',documentNumbers:['INV-1']},
    {id:'transfer-2',occurredAt:'2026-11-12T11:00:00Z',amount:6,supplierName:null,type:'OTHER_EXPENSE',status:null}
  ]};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Πληρωμές').click());
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  const history=document.querySelector('[aria-label="Ιστορικό τραπεζικών μεταφορών"]');
  assert.match(history.textContent,/Fixture Supplier.*INV-1.*42,00.*Σε αναμονή ελέγχου/);
  assert.match(history.textContent,/Λοιπό έξοδο.*6,00.*Καταχωρισμένη/);
  assert.equal(document.querySelector('[aria-label="Ταμείο"]'),null);
  assert.equal(button('Πληρωμή Προμηθευτή'),undefined);
  assert.equal(button('Λοιπά Έξοδα'),undefined);
  await m.act(async()=>[...history.parentElement.querySelectorAll('button')].find(item=>item.textContent==='Ανανέωση').click());
  assert.equal(calls.filter(x=>x.path.endsWith('/payments/stores/a1')).length,2);
  assert.ok(calls.every(x=>!x.options.method));
 }finally{await m.close()}
});
test('supplier bank settlement receipt remains visible when the delegated form closes',async()=>{
 const QuickActions=await component('cloud/OwnerPaymentQuickActions'),calls=[];
 const supplier={id:'supplier-1',name:'Fixture Supplier'};
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.includes('/backoffice-staff/payments/'))return {storeId:'a1',suppliers:[supplier],purchaseDocuments:[],recentBankTransfers:[]};
  if(path.includes('/supplier-open-invoices?'))return {items:[{id:'doc-1',documentNumber:'INV-1',outstandingAmount:42}]};
  if(path.endsWith('/supplier-settlements'))return {transaction:{id:'transfer-1'},status:'PENDING_REVIEW'};
  assert.fail(path);
 };
 const m=await mount(QuickActions,{api,store:{id:'a1',name:'A1'},delegatedCapabilities:['payments.read','payments.supplier']});
 try{
  await m.act(async()=>button('Πληρωμή Προμηθευτή').click());
  await m.act(async()=>{const s=document.querySelector('.pos-open-invoice-form select');s.value=supplier.id;s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>{
   const input=document.querySelector('[aria-label="Ποσό για INV-1"]');
   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'42');
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await m.act(async()=>button('Τραπεζική μεταφορά').click());
  await m.act(async()=>button('Δηλώνω υπεύθυνα ότι παρέδωσα τα χρήματα').click());
  await m.act(async()=>button('Καταχώριση πληρωμής προς έλεγχο').click());
  assert.equal(document.querySelector('.pos-open-invoice-form'),null);
  assert.match(document.body.textContent,/Fixture Supplier καταχωρίστηκε σε αναμονή ελέγχου/);
  const posts=calls.filter(x=>x.options.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(JSON.parse(posts[0].options.body).paymentMethod,'BANK_TRANSFER');
  assert.equal(calls.filter(x=>x.path.includes('/backoffice-staff/payments/')).length,2);
 }finally{await m.close()}
});
test('delegated expense form exposes only its granted action, requires declaration and sends one scoped stable-key pending-review input',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[],store={id:'a1',name:'A1'};
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['sales.read','payments.read','payments.expense']}]};if(path.endsWith('/terminals'))return {storeId:'a1',terminals:['POS2']};if(path.includes('/backoffice-staff/payments/'))return {storeId:'a1',suppliers:[],purchaseDocuments:[]};if(options.method)return {id:'synthetic',amount:2};return {store,openSession:null}};
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});await m.act(async()=>button('Πληρωμές').click());
  await m.act(async()=>{const s=document.querySelector('[aria-label="Ταμείο"]');s.value='POS2';s.dispatchEvent(new Event('change',{bubbles:true}))});await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  assert.equal(button('Πληρωμή Προμηθευτή'),undefined);assert.equal(button('Εισαγωγή αρχείου τράπεζας'),undefined);assert.equal(button('Μεταφορά Ποσού'),undefined);
  await m.act(async()=>button('Λοιπά Έξοδα').click());
  const form=document.querySelector('form'),amount=form.querySelector('input[inputmode="decimal"]');
  await m.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(amount,'2');amount.dispatchEvent(new Event('input',{bubbles:true}))});
  await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.filter(c=>c.options.method).length,0);
  assert.equal(form.querySelector('option[value="CASH_SHIFT"]'),null);
  await m.act(async()=>form.querySelector('input[type="checkbox"]').click());await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const writes=calls.filter(c=>c.options.method);assert.equal(writes.length,1);const body=JSON.parse(writes[0].options.body);assert.equal(body.type,'OTHER_EXPENSE');assert.equal(body.amount,2);assert.equal(body.responsibilityAcknowledged,true);assert.equal(body.paymentSource,'EXTERNAL');assert.equal(body.paymentMethod,'CORPORATE_CARD');assert.ok(body.idempotencyKey);assert.equal(body.supplierId,null);assert.equal(writes[0].options.headers['x-backoffice-store-id'],'a1');
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,700)));
  assert.match(document.body.textContent,/Λοιπά Έξοδα: καταχωρίστηκε/);
 }finally{await m.close()}
});
test('delegated cancellation is visibly reachable outside POS, uses selected terminal and never offers RETURN',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[],shift={id:'shift',shiftLabel:'Synthetic',terminalPos:'POS2',status:'OPEN'},store={id:'a1',name:'A1'};
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['sales.read','sales.cancel']}]};if(path.endsWith('/terminals'))return {storeId:'a1',terminals:['POS2']};if(path.endsWith('/sales/recent'))return {rows:[{id:'sale',total:6,occurredAt:'2026-10-31T08:00Z',lines:[],payments:[]}]};if(path.endsWith('/reverse'))return {total:6};return {store,openSession:shift,openSessions:[shift],recent:[],summaryBySession:{shift:{}},access:{}}};
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  const style=document.createElement('style');style.textContent=await readFile(new URL('../../client/src/components/commerce/pos-sale-actions.css',import.meta.url),'utf8')+await readFile(new URL('../../client/src/components/backoffice-staff.css',import.meta.url),'utf8');document.head.appendChild(style);
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});await m.act(async()=>button('Πωλήσεις και βάρδιες').click());
  assert.equal(button('ΠΩΛΗΣΕΙΣ / ΑΚΥΡΩΣΗ'),undefined);
  await m.act(async()=>{const s=document.querySelector('[aria-label="Ταμείο"]');s.value='POS2';s.dispatchEvent(new Event('change',{bubbles:true}))});await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  const dock=document.querySelector('.pos-sale-actions-dock');assert.ok(dock);assert.equal(window.getComputedStyle(dock).display,'flex');assert.equal(window.getComputedStyle(dock).position,'static');
  await m.act(async()=>button('ΠΩΛΗΣΕΙΣ / ΑΚΥΡΩΣΗ').click());assert.equal(button('Επιστροφή'),undefined);
  await m.act(async()=>button('Ακύρωση').click());
  await m.act(async()=>{const input=document.querySelector('.pos-sale-actions-modal textarea');Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,'Synthetic cancellation');input.dispatchEvent(new Event('input',{bubbles:true}))});
  await m.act(async()=>button('Καταχώρηση ακύρωσης').click());
  const writes=calls.filter(c=>c.options.method);assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{kind:'CANCEL',reason:'Synthetic cancellation'});assert.equal(writes[0].options.headers['x-backoffice-store-id'],'a1');assert.equal(writes[0].options.headers['x-mws-terminal-pos'],'POS2');
 }finally{await m.close()}
});
test('actual invoice editor separates read, edit and approval controls and locks navigation while canonical approval is pending',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const action of [null,'invoices.edit','invoices.approve']){
  const calls=[],rights=['invoices.read',...(action?[action]:[])],order={id:'order',storeId:'a1',storeName:'A1',supplierId:'sup',supplierName:'Synthetic',status:'NEW',sourceType:'POS_OCR_DRAFT',invoiceNumber:'SYN-1'},line={id:'line',orderId:'order',productId:'p',description:'Synthetic row',quantity:1,unitCost:1,netAmount:1,grossAmount:1.24,vatRate:24};
  let release;const pending=new Promise(resolve=>release=resolve);
  const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:rights}]};
   if(path.startsWith('/api/purchase-orders/report?'))return {stores:[{id:'a1',name:'A1'}],suppliers:[{id:'sup',name:'Synthetic'}],orders:[order],summary:{count:1}};
   if(path.endsWith('/detail'))return {order,lines:[line],totals:{quantity:1,net:1,gross:1.24}};
   if(options.method==='PATCH'){await pending;Object.assign(order,JSON.parse(options.body));return {ok:true,status:order.status};}
   return {items:[],suppliers:[],total:0,archiveTotal:0};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
  try{
   window.confirm=globalThis.confirm=()=>true;window.alert=globalThis.alert=message=>assert.fail(message);
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button('Τιμολόγια').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
   await m.act(async()=>button('Αγορές και πρόχειρα τιμολογίων').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
   assert.equal(document.querySelector('[data-po-store]').disabled,true);assert.equal(document.querySelector('[data-po-new]'),null);
   await m.act(async()=>document.querySelector('[data-po-open]').click());
   for(const selector of ['[data-invoice-assistant]','[data-reopen]','[data-email]','[data-product-card]','[data-barcodes]'])assert.equal(document.querySelector(selector),null);
   assert.equal(Boolean(document.querySelector('[data-add-line]')),action==='invoices.edit');
   assert.equal(Boolean(document.querySelector('[data-line-edit]')),action==='invoices.edit');assert.equal(Boolean(document.querySelector('[data-finalize]')),action==='invoices.approve');
   assert.equal(calls.some(c=>c.options.method),false,'opening an invoice must never auto-repair, recover or post');
   if(action){
    if(action==='invoices.edit')document.querySelector('[data-order-description]').value='Reviewed description';
    await m.act(async()=>document.querySelector(action==='invoices.edit'?'[data-save-meta]':'[data-finalize]').click());
    assert.equal(document.querySelector('select[aria-label="Κατάστημα"]').disabled,true);assert.equal(button('Έξοδος').disabled,true);
    const write=calls.filter(c=>c.options.method);assert.equal(write.length,1);assert.equal(write[0].path,'/api/purchase-orders/order');assert.equal(write[0].options.headers['x-backoffice-store-id'],'a1');
    assert.equal(JSON.parse(write[0].options.body)[action==='invoices.edit'?'description':'status'],action==='invoices.edit'?'Reviewed description':'FINAL');
    await m.act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,20))});assert.equal(document.querySelector('select[aria-label="Κατάστημα"]').disabled,false);
   }
  }finally{release();await m.close()}
 }
});
test('staff line editor saves VAT department and category metadata together in the selected store',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const store={id:'a1',name:'A1'},productId='p';
 const order={id:'order',storeId:store.id,storeName:store.name,supplierId:'sup',supplierName:'Synthetic',status:'NEW',sourceType:'POS_OCR_DRAFT',invoiceNumber:'SYN-2'};
 const line={id:'line',orderId:order.id,productId,description:'Synthetic row',quantity:1,unitCost:1,netAmount:1,grossAmount:1.24,vatRate:24};
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['invoices.read','invoices.edit']}]};
  if(path.startsWith('/api/purchase-orders/report?'))return {stores:[store],suppliers:[{id:'sup',name:'Synthetic'}],orders:[order],summary:{count:1}};
  if(path.endsWith('/detail'))return {order,lines:[line],totals:{quantity:1,net:1,gross:1.24}};
  if(path.includes('/ocr-lines/line/options?'))return {product:{categoryId:'old',subcategoryId:'old-sub',vatDepartmentId:'old-vat'},
   categories:[{id:'old',name:'Old'},{id:'new',name:'New'}],
   subcategories:[{id:'old-sub',categoryId:'old',name:'Old sub'},{id:'new-sub',categoryId:'new',name:'New sub'}],
   vatDepartments:[{id:'old-vat',description:'Old VAT'},{id:'new-vat',description:'New VAT'}]};
  if(options.method==='PATCH')return {ok:true};
  return {items:[],suppliers:[],total:0,archiveTotal:0};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  window.alert=globalThis.alert=message=>assert.fail(message);
  await m.act(async()=>{const select=document.querySelector('select');select.value=store.id;select.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Τιμολόγια').click());
  await m.act(async()=>button('Αγορές και πρόχειρα τιμολογίων').click());
  await m.act(async()=>document.querySelector('[data-po-open]').click());
  await m.act(async()=>document.querySelector('[data-line-edit]').click());
  const form=document.querySelector('.po-line-form');
  const optionsCall=calls.find(call=>call.path.includes('/ocr-lines/line/options?'));
  assert.match(optionsCall.path,/storeId=a1&productId=p$/);
  assert.equal(optionsCall.options.headers['x-backoffice-store-id'],store.id);
  const {categoryId,subcategoryId,vatDepartmentId}=form.elements;
  assert.equal(categoryId.value,'old');
  assert.equal(subcategoryId.value,'old-sub');
  assert.equal(vatDepartmentId.value,'old-vat');
  for(const field of [categoryId,subcategoryId,vatDepartmentId])assert.equal(field.disabled,false);
  assert.equal(calls.filter(call=>call.options.method).length,0);
  await m.act(async()=>{categoryId.value='new';categoryId.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.deepEqual([...subcategoryId.options].map(option=>option.value),['','new-sub']);
  await m.act(async()=>{
   subcategoryId.value='new-sub';subcategoryId.dispatchEvent(new Event('change',{bubbles:true}));
   vatDepartmentId.value='new-vat';vatDepartmentId.dispatchEvent(new Event('change',{bubbles:true}));
   form.querySelector('[type=submit]').click();
  });
  const writes=calls.filter(call=>call.options.method);
  assert.equal(writes.length,1);
  assert.equal(writes[0].path,'/api/purchase-orders/order/lines/line');
  assert.equal(writes[0].options.headers['x-backoffice-store-id'],store.id);
  const body=JSON.parse(writes[0].options.body);
  assert.deepEqual(body.productTaxonomy,{categoryId:'new',subcategoryId:'new-sub',vatDepartmentId:'new-vat'});
  assert.equal(body.productId,productId);
  assert.equal(body.vatRate,24,'item VAT department is separate from the invoice line VAT rate');
 }finally{await m.close()}
});
test('invoice-only operator reads the existing inbox and safe original preview without sync, delete, review or AI writes',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const item={id:'invoice',filename:'Synthetic.pdf',issueDate:'2026-10-31',receivedAt:'2026-10-31T08:00:00Z',supplierName:'Synthetic',status:'RECEIVED',processingStatus:'PENDING',hasAttachment:true,mark:'SYNTHETIC',linkedOrderId:'order'};
  const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['invoices.read']}]};if(path.endsWith('/file'))return {filename:'<script>UNTRUSTED</script>',mimeType:'image/png',dataUrl:'data:image/png;base64,AAAA'};return {items:[item],total:1,archiveTotal:1,suppliers:['Synthetic']}};
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}}),preview=new JSDOM('<!doctype html><body></body>');
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Τιμολόγια').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
    assert.match(document.body.textContent,/Synthetic.pdf/);
    assert.equal(document.querySelector('.invoice-inbox input[type=file]'),null);
    for(const label of ['Διαγραφή φωτογραφίας','Επανεπεξεργασία γραμμών','Έλεγχος από βοηθό AI','Έλεγχος εγγραφής','Άνοιγμα υπάρχοντος'])assert.equal(button(label),undefined);
    assert.equal(button('Λήψη από myDATA').hidden,true);
    window.open=()=>({document:preview.window.document,opener:window,close(){}});
    await m.act(async()=>button('Πρωτότυπο φωτογραφία/PDF').click());
    assert.equal(preview.window.document.querySelector('script'),null);assert.equal(preview.window.document.title,'<script>UNTRUSTED</script>');assert.equal(preview.window.document.querySelector('img').src,'data:image/png;base64,AAAA');
    assert.ok(calls.filter(c=>!c.path.endsWith('/me')).every(c=>c.options.headers['x-backoffice-store-id']==='a1'&&!c.options.method));
    assert.ok(calls.every(c=>!c.path.includes('/mydata/')));
  }finally{preview.window.close();await m.close()}
});
test('separately granted inbox upload stores a synthetic original in the selected store only',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const api=async(path,options={})=>{
    calls.push({path,options});
    if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['invoices.read','invoices.upload-original']}]};
    if(options.method==='POST')return {id:'fixture',status:'RECEIVED'};
    return {items:[],total:0,archiveTotal:0,suppliers:[]};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Τιμολόγια').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,80)));
    const input=document.querySelector('.invoice-inbox input[type=file]');
    const file=new window.File(['%PDF-1.7\n'+'synthetic fixture\n'.repeat(8)],'synthetic.pdf',{type:'application/pdf'});
    Object.defineProperty(input,'files',{value:[file]});
    await m.act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,60));});
    const posts=calls.filter(c=>c.options.method==='POST');
    assert.equal(posts.length,1);
    assert.equal(posts[0].path,'/api/commerce/documents/inbox');
    assert.equal(posts[0].options.headers['x-backoffice-store-id'],'a1');
    const body=JSON.parse(posts[0].options.body);
    assert.equal(body.storeId,'a1');
    assert.equal(body.file.filename,'synthetic.pdf');
    assert.match(body.file.dataUrl,/^data:application\/pdf;base64,/);
    assert.match(document.body.textContent,/Το πρωτότυπο αποθηκεύτηκε στη θυρίδα/);
  }finally{await m.close()}
});
test('separately granted provider original download attaches one PDF without reopening the invoice',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const item={id:'fixture',filename:'Synthetic.pdf',mark:'SYNTHETIC',issueDate:'2026-10-31',receivedAt:'2026-10-31T08:00:00Z',status:'RECEIVED',processingStatus:'PENDING',hasProviderOriginal:true,hasAttachment:false};
  const api=async(path,options={})=>{
    calls.push({path,options});
    if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['invoices.read','invoices.fetch-original']}]};
    if(options.method==='POST'){
      item.hasAttachment=true;
      return {id:'fixture',downloaded:true,reused:false,attachmentOnly:true};
    }
    return {items:[item],total:1,archiveTotal:1,suppliers:[]};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Τιμολόγια').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
    await m.act(async()=>{
      const download=button('Λήψη πρωτότυπου PDF παρόχου');
      download.click();
      download.click();
    });
    const posts=calls.filter(c=>c.options.method==='POST');
    assert.equal(posts.length,1);
    assert.equal(posts[0].path,'/api/commerce/documents/inbox/fixture/provider-original');
    assert.equal(posts[0].options.headers['x-backoffice-store-id'],'a1');
    assert.deepEqual(JSON.parse(posts[0].options.body),{storeId:'a1'});
    assert.match(document.body.textContent,/Το πρωτότυπο PDF επισυνάφθηκε στη θυρίδα/);
    assert.ok(button('Πρωτότυπο φωτογραφία/PDF'));
    assert.equal(button('Άνοιγμα υπάρχοντος προχείρου'),undefined);
  }finally{await m.close()}
});
test('delegated myDATA receiving is manual and submits only the selected store',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const api=async(path,options={})=>{
    calls.push({path,options});
    if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['invoices.read','invoices.sync-mydata']}]};
    if(options.method==='POST')return {created:1,message:'1 νέα παραστατικά μπήκαν στη θυρίδα.'};
    return {items:[],total:0,archiveTotal:0,suppliers:[]};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Τιμολόγια').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
    assert.ok(!calls.some(c=>c.path.includes('/mydata/')));
    await m.act(async()=>{
      const sync=button('Λήψη από myDATA');
      assert.equal(sync.hidden,false);
      sync.click();
      sync.click();
    });
    const requests=calls.filter(c=>c.path.includes('/mydata/'));
    assert.equal(requests.length,1);
    assert.equal(requests[0].path,'/api/commerce/documents/mydata/sync');
    assert.equal(requests[0].options.method,'POST');
    assert.equal(requests[0].options.headers['x-backoffice-store-id'],'a1');
    assert.deepEqual(JSON.parse(requests[0].options.body),{storeId:'a1'});
    assert.match(document.body.textContent,/νέα παραστατικά μπήκαν στη θυρίδα/);
  }finally{await m.close()}
});
test('owner entry reuses existing POS operator administration only after explicit same-company store selection',async()=>{
  const Admin=await component('BackofficeStaffAdmin'),calls=[];
  const api=async(path,options={})=>{calls.push({path,options});return path==='/api/backoffice-staff/admin'?{accounts:[],stores:[{id:'a1',name:'A1'},{id:'a2',name:'A2'}]}:{operators:[]}};
  const m=await mount(Admin,{api});
  try{
    await m.act(async()=>button('Χειριστές POS').click());
    assert.equal(calls.length,1);assert.equal(document.querySelector('.operator-management-suite'),null);
    await m.act(async()=>{const s=document.querySelector('section[aria-label="Δικαιώματα χειριστών POS"] select');s.value='a2';s.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.ok(document.querySelector('.operator-management-suite'));
    assert.ok(calls.some(c=>c.path==='/api/operator-management/stores/a2/operators'));
    assert.ok(calls.every(c=>!c.options.method));
  }finally{await m.close()}
});
test('sales-only operator mounts the normal shift centre but cannot close a shift even with a stale action flag',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const shift={id:'shift',status:'OPEN',shiftLabel:'Synthetic shift',openedAt:'2026-10-31T08:00:00Z',terminalPos:'MAIN',openingOperational:4};
  const store={id:'a1',name:'A1'};
  const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['sales.read']}]};if(path.endsWith('/terminals'))return {storeId:'a1',terminals:['MAIN']};if(path.includes('/store-pos/'))return {rows:[]};if(path.includes('/transactions/'))return {store,openSession:shift,openSessions:[shift],recent:[],summaryBySession:{shift:{cashSales:0,cardSales:0,expensesTotal:0,transferIn:0,transferOut:0}},access:{canForceClose:true}};return {store,openSession:shift,recent:[shift]}};
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.equal(button('Απογραφή'),undefined);assert.equal(button('Είδη και αποθήκη'),undefined);
    await m.act(async()=>button('Πωλήσεις και βάρδιες').click());
    await m.act(async()=>{const s=document.querySelector('select[aria-label="Ταμείο"]');s.value='MAIN';s.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.match(document.body.textContent,/Κέντρο βαρδιών/);assert.match(document.body.textContent,/Synthetic shift/);
    assert.equal(button('Κλείσιμο βάρδιας'),undefined);
    assert.ok(calls.filter(c=>!c.path.endsWith('/me')).every(c=>c.options.headers['x-backoffice-store-id']==='a1'&&!c.options.method));
  }finally{await m.close()}
});
test('operator uses actual archive read-only without edit, import, transfer or creation controls',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['products.read']}]};return {store:{id:'a1',name:'A1'},page:1,pageSize:100,pages:1,total:1,categories:[],subcategories:[],items:[{productId:'water',name:'Scoped virtual water',currentStock:4,salePrice:1}],totals:{}}};
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Είδη και αποθήκη').click());
    assert.match(document.body.textContent,/Scoped virtual water/);
    for(const label of ['Νέο είδος','Εισαγωγή από Excel','Μεταφορά','Ομαδική διόρθωση'])assert.equal(button(label),undefined);
    assert.equal(document.querySelector('[title="Διόρθωση είδους"]').hidden,true);
    assert.ok(calls.some(c=>c.path.startsWith('/api/inventory-archive?')&&c.options.headers['x-backoffice-store-id']==='a1'));
    assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
  }finally{await m.close()}
});
test('mounted personal workspace requires store selection and discards delayed old-store data',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];let resolve;
  const api=async(path,options)=>{calls.push({path,options});if(path.endsWith('/me'))return identity;return new Promise(r=>{resolve=r})};
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    assert.equal(document.querySelector('select').value,'');assert.equal(button('Απογραφή'),undefined);assert.equal(calls.length,1);
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Απογραφή').click());await m.act(async()=>button('Φόρτωση').click());
    assert.equal(calls.at(-1).options.headers['x-backoffice-store-id'],'a1');
    await m.act(async()=>{const s=document.querySelector('select');s.value='a2';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>resolve({storeId:'a1',stocktakes:[{id:'old',name:'PRIVATE OLD STORE'}]}));
    assert.ok(!document.body.textContent.includes('PRIVATE OLD STORE'));assert.equal(button('Απογραφή'),undefined);assert.ok(button('Έλεγχος ταμείων'));assert.ok(!document.body.textContent.includes('Οριστικοποίηση'));
  }finally{await m.close()}
});
test('mounted uncertain count freezes the same event identity and preserves count-only UI',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),writes=[];let uncertain=true;
  const detail={storeId:'a1',id:'st',name:'Draft',status:'DRAFT',lines:[{id:'line',name:'Water',sku:'001',barcodes:['01234567'],countVersion:0,countedQuantity:null}]};
  const api=async(path,options={})=>{
    if(path.endsWith('/me'))return identity;
    if(path.endsWith('/count')){writes.push(JSON.parse(options.body));if(uncertain)throw Error('network uncertain');return {replayed:true}}
    if(path.endsWith('/stocktakes'))return {storeId:'a1',stocktakes:[{id:'st',name:'Draft'}]};return detail;
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Απογραφή').click());await m.act(async()=>button('Φόρτωση').click());await m.act(async()=>button('Draft').click());
    assert.ok(!document.body.textContent.includes('Οριστικοποίηση'));assert.ok(!document.body.textContent.includes('Πληρωμή'));
    assert.ok(document.querySelector('.inv2-layout .inv2-work .inv2-table-wrap'),'actual native inventory layout and count table');
    await m.act(async()=>document.querySelector('button[title="Διόρθωση"]').click());
    await m.act(async()=>{const input=document.querySelector('input[name="quantity"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'7');input.dispatchEvent(new Event('input',{bubbles:true}))});
    await m.act(async()=>document.querySelector('.inv2-quantity-row button').click());
    assert.equal(writes.length,1);assert.equal(document.querySelector('select').disabled,true);assert.equal(document.querySelector('.inv2-quantity-row button').disabled,true);assert.ok(button('Επαλήθευση ίδιας καταχώρισης'));
    uncertain=false;await m.act(async()=>button('Επαλήθευση ίδιας καταχώρισης').click());assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(button('Επαλήθευση ίδιας καταχώρισης'),undefined);
  }finally{await m.close()}
});

test('mounted account form saves username and four-digit PIN without a required password or broadened store',async()=>{
  const Admin=await component('BackofficeStaffAdmin'),writes=[];
  const api=async(path,options={})=>{if(options.method==='POST'){writes.push(JSON.parse(options.body));return {id:'created',revision:1}}return {accounts:writes.map(({fullName,username,grants})=>({id:'created',fullName,username,active:true,revision:1,grants})),stores:[{id:'a1',name:'A1'},{id:'a2',name:'A2'}]}};
  const m=await mount(Admin,{api});
  try{
    await m.act(async()=>button('Νέος χειριστής').click());
    const form=document.querySelector('form'),password=form.elements.password,pin=form.elements.pin;
    assert.equal(password.required,false);assert.equal(password.checkValidity(),true);
    password.value='short';assert.equal(password.minLength,10);password.value='';
    for(const value of ['123','12a4']){pin.value=value;assert.equal(pin.checkValidity(),false)}
    pin.value='0483';assert.equal(pin.checkValidity(),true);
    form.elements.fullName.value='Isolated Counter';form.elements.username.value='counter.fixture';
    await m.act(async()=>document.querySelector('.staff-grant input[type="checkbox"]').click());
    assert.equal(document.querySelectorAll('.staff-permission-matrix input:checked').length,0);
    await m.act(async()=>button('Εφαρμογή προτεινόμενων').click());
    assert.equal(form.checkValidity(),true);
    await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(writes.length,1);assert.equal(Object.hasOwn(writes[0],'password'),false);assert.equal(writes[0].pin,'0483');
    assert.deepEqual(writes[0].grants,[{storeId:'a1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']}]);
    assert.equal(document.querySelector('form'),null);assert.match(document.body.textContent,/Αποθηκεύτηκε/);
  }finally{await m.close()}
});

test('owner permission matrix exposes all supported actions regardless of role and preserves explicit choices on role change',async()=>{
  const Admin=await component('BackofficeStaffAdmin'),writes=[];
  const api=async(path,options={})=>{if(options.method==='POST'){writes.push(JSON.parse(options.body));return {id:'created'}}return {accounts:[],stores:[{id:'a1',name:'A1'},{id:'a2',name:'A2'}]}};
  const m=await mount(Admin,{api});
  try{
    await m.act(async()=>button('Νέος χειριστής').click());
    await m.act(async()=>document.querySelector('.staff-grant input[type="checkbox"]').click());
    const form=document.querySelector('form');
    form.elements.fullName.value='Owner configured';form.elements.username.value='custom.fixture';form.elements.pin.value='0483';
    const checkbox=label=>[...document.querySelectorAll('input[type="checkbox"]')].find(el=>el.getAttribute('aria-label')===label);
    await m.act(async()=>checkbox('A1: Έλεγχος ταμείων — Προβολή αναφοράς').click());
    await m.act(async()=>{const role=document.querySelector('.staff-grant select');role.value='AUDITOR';role.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.equal(checkbox('A1: Έλεγχος ταμείων — Προβολή αναφοράς').checked,true);
    await m.act(async()=>checkbox('A1: Απογραφή — Καταμέτρηση').click());
    assert.equal(checkbox('A1: Απογραφή — Προβολή').checked,true);
    await m.act(async()=>{const role=document.querySelector('.staff-grant select');role.value='MANAGER';role.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.equal(checkbox('A1: Απογραφή — Καταμέτρηση').checked,true);
    await m.act(async()=>checkbox('A1: Απογραφή — Προβολή').click());
    assert.equal(checkbox('A1: Απογραφή — Καταμέτρηση').checked,false);
    await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(writes[0].grants,[{storeId:'a1',profile:'MANAGER',capabilities:['cash.read']}]);
  }finally{await m.close()}
});

test('owner can replace extra store rights with four exact grants, verify the saved result and revoke one store',async()=>{
  const Admin=await component('BackofficeStaffAdmin'),writes=[];
  const stores=[{id:'a1',name:'A1'},{id:'a2',name:'A2'}];
  const otherStore={storeId:'a2',profile:'AUDITOR',capabilities:['cash.read']};
  let account={id:'staff',fullName:'Fixture',username:'fixture',active:true,revision:1,grants:[
    {storeId:'a1',profile:'MANAGER',capabilities:['cash.read','inventory.read','inventory.count','invoices.edit','invoices.read']},otherStore
  ]};
  let retainExtra=true;
  const api=async(path,options={})=>{
    if(!options.method)return {accounts:[account],stores};
    assert.equal(path,'/api/backoffice-staff/admin/accounts/staff');
    assert.equal(options.method,'PUT');
    const body=JSON.parse(options.body);
    writes.push(body);
    assert.equal(body.expectedRevision,account.revision);
    account={...account,revision:account.revision+1,grants:body.grants.map(grant=>({
      ...grant,capabilities:[...grant.capabilities].reverse().concat(retainExtra&&grant.storeId==='a1'?['cash.read']:[])
    }))};
    return {id:account.id,revision:account.revision};
  };
  const m=await mount(Admin,{api});
  const select=label=>document.querySelector(`input[aria-label="A1: ${label}"]`).click();
  const submit=()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  try{
    await m.act(async()=>button('Δικαιώματα / Απενεργοποίηση').click());
    const store=()=>document.querySelector('.staff-grant');
    await m.act(async()=>[...store().querySelectorAll('button')].find(el=>el.textContent==='Μόνο διαθέσιμες προβολές').click());
    assert.match(store().querySelector('.staff-permission-summary').textContent,/\d+ προβολές · 0 ενέργειες/);
    assert.equal(document.querySelector('input[aria-label="A1: Τιμολόγια — Επεξεργασία πρόχειρου τιμολογίου"]').checked,false);
    assert.equal(document.querySelectorAll('.staff-grant')[1].querySelectorAll('.staff-permission-matrix input:checked').length,1);
    await m.act(async()=>[...store().querySelectorAll('button')].find(el=>el.textContent==='Καθαρισμός επιλογών').click());
    await m.act(async()=>select('Τιμολόγια — Επαναφορά οριστικοποιημένου τιμολογίου'));
    await m.act(async()=>select('Τιμολόγια — Ακύρωση καταχωρισμένου τιμολογίου'));
    await m.act(async()=>select('Πωλήσεις και βάρδιες — Συγκεντρωτική προβολή βαρδιών'));
    assert.match(store().querySelector('.staff-permission-summary').textContent,/2 προβολές · 2 ενέργειες/);
    await m.act(async()=>submit());
    const grants=[{storeId:'a1',profile:'MANAGER',capabilities:['invoices.reopen','invoices.read','invoices.cancel','shifts.read']},otherStore];
    assert.deepEqual(writes[0].grants,grants);
    assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκαν/);
    assert.equal(document.querySelector('[role="status"]:not([aria-label="Διαθεσιμότητα εταιρικών προβολών"])'),null);

    assert.match(document.querySelector('[aria-label="Διαθεσιμότητα εταιρικών προβολών"]').textContent,/Δεν επιβεβαιώθηκε/);
    retainExtra=false;
    await m.act(async()=>button('Δικαιώματα / Απενεργοποίηση').click());
    await m.act(async()=>select('Έλεγχος ταμείων — Προβολή αναφοράς'));
    await m.act(async()=>submit());
    assert.match(document.querySelector('[role="status"]:not([aria-label="Διαθεσιμότητα εταιρικών προβολών"])').textContent,/Αποθηκεύτηκε και επαληθεύτηκε/);
    assert.deepEqual(new Set(writes[1].grants[0].capabilities),new Set(grants[0].capabilities));

    await m.act(async()=>button('Δικαιώματα / Απενεργοποίηση').click());
    await m.act(async()=>store().querySelector('input[type="checkbox"]').click());
    await m.act(async()=>submit());
    assert.deepEqual(writes[2].grants,[otherStore]);
    assert.match(document.querySelector('[role="status"]:not([aria-label="Διαθεσιμότητα εταιρικών προβολών"])').textContent,/Αποθηκεύτηκε και επαληθεύτηκε/);
  }finally{await m.close()}
});

test('uncertain stocktake creation reuses one event and finalization verifies by GET without a second write',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),writes=[];
  const draft={storeId:'a1',id:'st',name:'Lifecycle draft',status:'DRAFT',lines:[{id:'line',name:'Water',sku:'001',countVersion:1,countedQuantity:'12',expectedQuantity:'10'}]};
  let createAttempts=0,finalized=false;
  const api=async(path,options={})=>{
    if(path.endsWith('/me'))return {...identity,stores:[{...identity.stores[0],capabilities:['inventory.read','inventory.create','inventory.count','inventory.finalize']}]};
    if(options.method==='POST'){
      writes.push({path,body:JSON.parse(options.body)});
      if(path.endsWith('/finalize')){finalized=true;throw Error('network uncertain')}
      if(createAttempts++===0)throw Error('network uncertain');return {id:'st',status:'DRAFT',replayed:true};
    }
    return path.endsWith('/stocktakes')?{storeId:'a1',stocktakes:[{id:'st',name:'Lifecycle draft'}]}:{...draft,status:finalized?'FINALIZED':'DRAFT'};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Απογραφή').click());
    await m.act(async()=>{const n=document.querySelector('input[name="name"]');n.value='Lifecycle draft';n.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    assert.equal(writes.length,1);assert.equal(document.querySelector('select').disabled,true);
    await m.act(async()=>button('Επαλήθευση ίδιας δημιουργίας').click());assert.deepEqual(writes[0],writes[1]);assert.equal(document.querySelector('select').disabled,false);
    await m.act(async()=>button('Lifecycle draft').click());
    assert.equal(document.querySelector('.inv2-table-wrap tbody tr').children[2].textContent,'10');
    await m.act(async()=>{const r=document.querySelector('input[name="reason"]');r.value='Synthetic correction';r.form.elements.confirm.checked=true;r.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    assert.equal(writes.length,3);assert.equal(document.querySelector('select').disabled,true);
    await m.act(async()=>button('Έλεγχος αποτελέσματος οριστικοποίησης').click());
    assert.equal(writes.length,3);assert.equal(document.querySelector('select').disabled,false);assert.equal(button('Οριστικοποίηση και ενημέρωση αποθέματος'),undefined);assert.equal(button('Καταχώρηση μέτρησης'),undefined);assert.equal(document.querySelector('input[name="quantity"]'),null);assert.equal(document.querySelector('button[title="Διόρθωση"]'),null);
    assert.match(document.body.textContent,/Οριστικοποιημένη απογραφή/);
  }finally{await m.close()}
});

test('common store commerce shortcut is present only for an explicitly granted commerce function, never an ungranted cash fallback',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const products of [false,true]){
  const store={id:'a1',name:'A1'},calls=[];
  const api=async(path,options={})=>{calls.push({path,options});assert.equal(options.method||'GET','GET');if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'AUDITOR',capabilities:['sales.read',...(products?['products.read']:[])]}]};if(path.endsWith('/terminals'))return {storeId:'a1',terminals:['POS2']};if(path.includes('/sales/recent'))return {rows:[]};return {store,openSession:null,openSessions:[],recent:[],summaryBySession:{}}};
  const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
  try{
   await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button('Πωλήσεις και βάρδιες').click());
   await m.act(async()=>{const s=document.querySelector('[aria-label="Ταμείο"]');s.value='POS2';s.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
   assert.equal(Boolean(button('Εμπορική λειτουργία')),products);
   assert.equal(button('Έλεγχος ταμείων'),undefined);
   assert.ok(calls.every(c=>!c.path.includes('/backoffice-staff/cash/')));
  }finally{await m.close()}
 }
});


test('actual native inventory personal mode denies Owner-only controls and masks cost, price and blind expected data through revocation',async()=>{
 const Center=await component('inventory/InventoryV2Center'),calls=[],writes=[];
 const current={id:'st',storeId:'a1',name:'Synthetic blind draft',status:'DRAFT',lines:[{id:'line',name:'Water',sku:'001',barcodes:['11111111','22222222'],countVersion:3,countedQuantity:'4',expectedQuantity:'991',unitCost:873,salePrice:974}]};
 const api=async(path)=>{calls.push(path);throw Error('Owner endpoint must not be called')};
 let delegated={storeId:'a1',storeName:'A1',stocktakes:[current],current,canCount:true,canCreate:false,canFinalize:false,locked:false,onLoad:()=>{},onOpen:()=>{},onNew:()=>{},onCount:async r=>{writes.push(r);return false},setError:message=>{if(message)throw Error(message)}};
 const props=()=>({api,stores:[{id:'a1',name:'A1'}],loadCatalog:()=>assert.fail('no company catalog for personal inventory'),delegated});
 const m=await mount(Center,props());
 const type=async(selector,value)=>m.act(async()=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))});
 try{
  assert.ok(document.querySelector('.inv2-layout .inv2-work .inv2-fast-entry'));
  for(const text of ['Αξία κόστους','Αξία λιανικής','Απόθεμα','Διαφορά','QR/PIN','Full Audit','Excel / CSV','Εισαγωγή CSV','Νέα ζώνη','Ομαδική καταμέτρηση','Καταχώρηση νέου είδους','Συνέχεια ως ελεύθερη','Οριστικοποίηση'])assert.ok(!document.body.textContent.includes(text),text);
  assert.equal(document.querySelector('button[title="Διαγραφή καταμέτρησης"]'),null);assert.equal(document.querySelector('button[title="Εκτύπωση barcode"]'),null);assert.equal(document.querySelector('.inv2-history-delete'),null);
  await type('.inv2-scan-row input','22222222');await m.act(async()=>document.querySelector('.inv2-fast-entry form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.match(document.querySelector('.inv2-selected-product').textContent,/Water/);assert.ok(!document.querySelector('.inv2-selected-product').textContent.includes('991'));
  await type('input[name="quantity"]','2');await m.act(async()=>document.querySelector('.inv2-quantity-row button').click());
  assert.equal(writes.length,1);assert.equal(writes[0].stocktakeId,'st');assert.equal(writes[0].body.quantity,6);assert.equal(writes[0].body.expectedVersion,3);assert.equal(writes[0].body.source,'SCANNER');assert.match(writes[0].body.clientEventId,/^[a-f0-9-]{36}$/);
  delegated={...delegated,locked:true};await m.render(props());assert.equal(document.querySelector('input[name="quantity"]').value,'2','uncertain callback does not clear the draft');assert.equal(document.querySelector('.inv2-quantity-row button').disabled,true);
  await m.act(async()=>window.dispatchEvent(new CustomEvent('mws:product-created',{detail:{id:'foreign'}})));assert.deepEqual(calls,[]);
  delegated={...delegated,locked:false,canFinalize:true};await m.render(props());assert.match(document.querySelector('.inv2-table-wrap').textContent,/991/);assert.ok(!document.body.textContent.includes('Αξία κόστους'));
  delegated={...delegated,canCount:false,canFinalize:false};await m.render(props());assert.equal(document.querySelector('.inv2-fast-entry'),null);assert.equal(document.querySelector('button[title="Διόρθωση"]'),null);assert.ok(!document.querySelector('.inv2-table-wrap').textContent.includes('991'));assert.ok(document.querySelector('input[aria-label="Αναζήτηση είδους"]'));assert.deepEqual(calls,[]);
 }finally{await m.close()}
});

test('ordinary Owner inventory retains real count table and native zone, grant, audit, import and destructive controls',async()=>{
 const Center=await component('inventory/InventoryV2Center'),calls=[];
 const current={id:'st',storeId:'a1',storeName:'A1',name:'Owner synthetic',status:'DRAFT',scopeType:'FULL',lines:[{id:'line',name:'Water',sku:'001',barcode:'11111111',countVersion:3,countedQuantity:4,expectedQuantity:9,unitCost:2,salePrice:3}]};
 const api=async(path)=>{calls.push(path);if(path.endsWith('/stocktakes'))return [current];if(path.includes('/zones'))return [];return current};
 const m=await mount(Center,{api,stores:[{id:'a1',name:'A1'}]});
 try{
  await m.act(async()=>button('Owner synthetic').click());
  assert.ok(document.querySelector('.inv2-layout .inv2-work .inv2-fast-entry'));
  for(const text of ['Αξία κόστους','Αξία λιανικής','Απόθεμα','Διαφορά','QR/PIN','Full Audit','Excel / CSV','Εισαγωγή CSV','Νέα ζώνη','Ομαδική καταμέτρηση','Συνέχεια ως ελεύθερη','Οριστικοποίηση'])assert.ok(document.body.textContent.includes(text),text);
  assert.ok(document.querySelector('button[title="Διαγραφή καταμέτρησης"]'));assert.ok(document.querySelector('button[title="Εκτύπωση barcode"]'));assert.ok(document.querySelector('.inv2-history-delete'));
  assert.deepEqual(calls,['/api/inventory-v2/stocktakes','/api/inventory-v2/stocktakes/st','/api/inventory-v2/zones?storeId=a1']);
 }finally{await m.close()}
});


test('read-only personal inventory loads only the selected redacted endpoints and never offers a write',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const api=async(path,options={})=>{
  calls.push({path,options});assert.equal(options.method||'GET','GET');
  if(path==='/api/backoffice-staff/me')return {...identity,stores:[{...identity.stores[0],capabilities:['inventory.read']}]};
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  if(path==='/api/backoffice-staff/inventory/stores/a1/stocktakes')return {storeId:'a1',stocktakes:[{id:'st',name:'Readonly draft',status:'DRAFT'}]};
  if(path==='/api/backoffice-staff/inventory/stores/a1/stocktakes/st?paged=1')return {id:'st',storeId:'a1',name:'Readonly draft',status:'DRAFT',lines:[{id:'l',name:'Water',sku:'W',barcodes:['11111111'],countVersion:2,countedQuantity:'4'}]};
  assert.fail('Unexpected native Owner or foreign read: '+path);
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
  await m.act(async()=>button('Readonly draft').click());
  assert.match(document.querySelector('.inv2-work tbody').textContent,/Water/);assert.equal(document.querySelector('.inv2-fast-entry'),null);assert.equal(document.querySelector('input[name="name"]'),null);assert.equal(document.querySelector('input[name="reason"]'),null);assert.equal(document.querySelector('button[title="Διόρθωση"]'),null);
  for(const text of ['Απόθεμα','Διαφορά','Αξία κόστους','Νέα απογραφή','Οριστικοποίηση'])assert.ok(!document.querySelector('.inv2').textContent.includes(text));
  assert.deepEqual(calls.map(c=>c.path),['/api/backoffice-staff/me','/api/backoffice-staff/inventory/stores/a1/stocktakes','/api/backoffice-staff/inventory/stores/a1/stocktakes/st?paged=1']);
 }finally{await m.close()}
});

const nativeCashReport=(storeId,period,text)=>({storeId,period,generation:'0',head:'0'.repeat(64),rows:[],context:[],text,historyPage:0,historyPages:2,historyTotal:51,history:[{id:'h',actorName:'Fixture',kind:'CHECKPOINT',note:'Accepted history',createdAt:'2026-10-15T12:00Z'}],issueRegister:{status:'AVAILABLE',issues:[{id:'i',day:'2026-10-15',operatorName:'Fixture',code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:100,status:'OPEN',transactionId:'t',occurredAt:'2026-10-15T12:00Z',current:true,repliesCount:0}]},handoffRegister:{status:'AVAILABLE',issues:[{id:'hi',previousDay:'2026-10-15',nextDay:'2026-10-15',previousOperator:'Fixture',nextOperator:'Fixture',previousSessionId:'p',nextSessionId:'n',terminalPos:'POS1',differenceCents:100,previousClosingCents:10000,nextOpeningCents:9900,status:'OPEN',current:true,repliesCount:0}]}});

test('personal cash read uses real Owner cash frame, period fields and reconciliation report without Owner endpoints or write/export/import controls',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[],copies=[];
 const api=async(path,options={})=>{
  calls.push({path,options});assert.equal(options.method||'GET','GET');
  if(path==='/api/backoffice-staff/me')return {...identity,stores:[{...identity.stores[0],capabilities:['cash.read']}]};
  assert.equal(options.headers['x-backoffice-store-id'],'a1');assert.ok(path.startsWith('/api/backoffice-staff/cash/stores/a1?'),path);
  const q=new URL(path,'https://isolated.invalid').searchParams,period={from:q.get('from'),to:q.get('to')};return nativeCashReport('a1',period,`Verified ${period.from} / ${period.to}`);
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>copies.push(value)}});
  await m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});await m.act(async()=>button('Έλεγχος ταμείων').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,40)));
  assert.ok(document.querySelector('.cloud-panel.cash-module .cash-heading'));assert.equal(calls.length,1,'no Owner automatic overview/pending-invoice/daily reads');
  await m.act(async()=>button('Έλεγχος με επανυπολογισμούς').click());
  const report=document.querySelector('.cash-reconciliation-panel pre').textContent;assert.match(report,/Verified/);assert.match(document.querySelector('.cash-reconciliation-panel').textContent,/Accepted history/);
  assert.equal(document.querySelector('.cash-module form'),null);
  for(const label of ['Απάντηση στην εκκρεμότητα','Απάντηση στην παράδοση','Excel με επανυπολογισμούς','Παλαιότερες καταχωρήσεις','Καταχώριση ελέγχου','Ανάγνωση χειρόγραφων'])assert.equal(button(label),undefined,label);
  assert.equal(document.querySelector('.cash-kiosk-import-panel'),null);assert.equal(document.querySelector('.cash-module .cash-daily-summary'),null,'unavailable overview is not invented as zero');
  await m.act(async()=>button('Αντιγραφή ελεγμένης αναφοράς').click());assert.deepEqual(copies,[report]);
  await m.act(async()=>{const s=document.querySelector('.cash-shift-search select');s.value='MONTH';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>{const input=document.querySelector('.cash-shift-search input[type="date"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'2026-10-15');input.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(document.querySelector('.cash-reconciliation-panel pre'),null);assert.equal(button('Αντιγραφή ελεγμένης αναφοράς'),undefined,'old period cannot be copied');
  await m.act(async()=>button('Έλεγχος με επανυπολογισμούς').click());
  const q=new URL(calls.at(-1).path,'https://isolated.invalid').searchParams;assert.equal(q.get('from'),'2026-10-01');assert.equal(q.get('to'),'2026-10-31');assert.match(document.querySelector('.cash-reconciliation-panel pre').textContent,/2026-10-01 \/ 2026-10-31/);
  assert.ok(calls.slice(1).every(c=>c.path.startsWith('/api/backoffice-staff/cash/stores/a1?')&&c.options.headers['x-backoffice-store-id']==='a1'));
 }finally{await m.close()}
});

test('personal native cash discards an old-store response and rejects a wrong-period report before copy',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];let release,wrong=false;
 const api=async(path,options={})=>{
  calls.push({path,options});assert.equal(options.method||'GET','GET');
  if(path==='/api/backoffice-staff/me')return {...identity,stores:identity.stores.map(s=>({...s,capabilities:['cash.read']}))};
  const match=/^\/api\/backoffice-staff\/cash\/stores\/(a1|a2)\?/.exec(path);assert.ok(match,path);assert.equal(options.headers['x-backoffice-store-id'],match[1]);
  const q=new URL(path,'https://isolated.invalid').searchParams,period={from:q.get('from'),to:q.get('to')};
  if(match[1]==='a1')return new Promise(resolve=>{release=()=>resolve(nativeCashReport('a1',period,'PRIVATE OLD STORE'))});
  return nativeCashReport('a2',wrong?{...period,to:'2000-01-01'}:period,wrong?'WRONG PERIOD PRIVATE':'CURRENT A2 REPORT');
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 const choose=async id=>m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value=id;s.dispatchEvent(new Event('change',{bubbles:true}))});
 try{
  await choose('a1');await m.act(async()=>button('Έλεγχος ταμείων').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,30)));await m.act(async()=>button('Έλεγχος με επανυπολογισμούς').click());assert.equal(typeof release,'function');
  await choose('a2');await m.act(async()=>release());assert.ok(!document.body.textContent.includes('PRIVATE OLD STORE'));
  await m.act(async()=>button('Έλεγχος ταμείων').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,30)));await m.act(async()=>button('Έλεγχος με επανυπολογισμούς').click());assert.match(document.body.textContent,/CURRENT A2 REPORT/);
  wrong=true;await m.act(async()=>button('Ανανέωση ελέγχου').click());assert.ok(!document.body.textContent.includes('CURRENT A2 REPORT'));assert.ok(!document.body.textContent.includes('WRONG PERIOD PRIVATE'));assert.equal(button('Αντιγραφή ελεγμένης αναφοράς'),undefined);assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκε/);
 }finally{release?.();await m.close()}
});

test('native inventory Enter on quantity saves selected count, not barcode lookup',async()=>{
 const Count=await component('inventory/InventoryFastCount'),calls=[],errors=[];
 const current={id:'take-enter',status:'DRAFT',lines:[{id:'line-1',name:'Synthetic item',sku:'SKU1',barcodes:['5200000000001'],countedQuantity:null,countVersion:0}]};
 const delegated={canCount:true,canClear:false,canBulkZero:false,locked:false,onCount:async request=>{calls.push(request);return true}};
 const m=await mount(Count,{current,delegated,setError:value=>errors.push(value),api:async()=>{throw Error('Unexpected owner write')},reload:async()=>{}});
 try{
  const barcode=document.querySelector('input[placeholder="Barcode, SKU ή περιγραφή"]');
  await m.act(async()=>{
   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(barcode,'5200000000001');
   barcode.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await m.act(async()=>barcode.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const quantity=document.querySelector('input[aria-label="Ποσότητα καταμέτρησης"]');
  assert.equal(quantity.disabled,false);
  await m.act(async()=>{
   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(quantity,'3.25');
   quantity.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const enterEvent=new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
  await m.act(async()=>quantity.dispatchEvent(enterEvent));
  assert.equal(enterEvent.defaultPrevented,true,'Enter must cancel the enclosing barcode lookup form submission');
  assert.equal(calls.length,1);
  assert.equal(calls[0].stocktakeId,'take-enter');
  assert.equal(calls[0].body.lineId,'line-1');
  assert.equal(calls[0].body.quantity,3.25);
  assert.equal(calls[0].body.source,'SCANNER');
  assert.equal(calls[0].body.expectedVersion,0);
  assert.match(calls[0].body.clientEventId,/^[a-f0-9-]{36}$/);
  assert.equal(errors.filter(Boolean).length,0);
 }finally{await m.close()}
});

test('inventory counted-only filter survives detail unmount and stays scoped to the stocktake', async () => {
 const Center = await component('inventory/InventoryV2Center');
 const current = {id:'take-1',name:'First count',status:'DRAFT',lines:[
  {id:'a',name:'Already counted',sku:'COUNT',barcodes:['111'],countedQuantity:2,countVersion:1},
  {id:'b',name:'Not counted',sku:'UNC',barcodes:['222'],countedQuantity:null,countVersion:0},
 ]};
 const other = {...current,id:'take-2',name:'Second count'};
 const stores = [{id:'a1',name:'A1'}];
 const props = detail => ({
  stores,
  delegated:{storeId:'a1',storeName:'A1',stocktakes:[current,other],listLoaded:true,current:detail,onLoad:()=>{},onOpen:()=>{},setError:()=>{}},
  api:async()=>assert.fail('display preferences must not call Owner endpoints'),
 });
 const m = await mount(Center,props(current));
 try {
  assert.ok(button('Μόνο καταμετρημένα'));
  await m.act(async()=>button('Μόνο καταμετρημένα').click());
  await m.render(props(null));
  assert.equal(document.querySelector('.inv2-table-wrap'),null);
  await m.render(props({...current,lines:current.lines.map(line=>({...line}))}));
  assert.ok(button('Εμφάνιση όλων'));
  assert.match(document.querySelector('.inv2-table-wrap').textContent,/Already counted/);
  assert.doesNotMatch(document.querySelector('.inv2-table-wrap').textContent,/Not counted/);
  await m.render(props(other));
  assert.ok(button('Μόνο καταμετρημένα'));
  assert.match(document.querySelector('.inv2-table-wrap').textContent,/Not counted/);
 } finally {
  await m.close();
 }
});


test('delegated unknown-barcode button requires both explicit product permission and DRAFT',async()=>{
 const Count=await component('inventory/InventoryFastCount'),events=[],current={id:'draft-a',status:'DRAFT',scopeType:'FULL',lines:[]};
 const props=(allowed,locked=false,stocktake=current)=>({api:async()=>assert.fail('No Owner endpoint for a missing barcode'),current:stocktake,reload:async()=>{},setError:()=>{},delegated:{canCount:true,canCreateProduct:allowed,locked,onCreateProduct:code=>events.push(code)}});
 const m=await mount(Count,props(false));
 try{
  const input=document.querySelector('input[placeholder="Barcode, SKU ή περιγραφή"]');assert.ok(input);
  await m.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'5200123456789');input.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(document.querySelector('.inv2-new-product'),null,'count permission alone cannot create product');
  await m.render(props(true));
  assert.ok(document.querySelector('.inv2-new-product'));
  await m.act(async()=>document.querySelector('.inv2-new-product').click());assert.deepEqual(events,['5200123456789']);
  await m.render(props(true,true));
  await m.act(async()=>document.querySelector('.inv2-new-product').click());assert.equal(events.length,1,'locked draft cannot open another card');
  await m.render(props(true,false,{...current,status:'FINALIZED'}));
  assert.equal(document.querySelector('.inv2-new-product'),null,'finalized draft never permits this action');
 }finally{await m.close()}
});

test('personal inventory opens the existing store-scoped new-product card without stock/count writes',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),writes=[];
 const current={id:'draft-a',storeId:'a1',name:'Unknown barcode draft',status:'DRAFT',scopeType:'FULL',lines:[]};
 const staff={...identity,stores:[{id:'a1',name:'A1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count','products.read','products.create']}]};
 const api=async(path,options={})=>{
  if(options.method&&options.method!=='GET'){writes.push({path,options});throw Error('No state-changing call expected');}
  if(path==='/api/backoffice-staff/me')return staff;
  if(path==='/api/backoffice-staff/inventory/stores/a1/stocktakes')return {storeId:'a1',stocktakes:[current]};
  if(path==='/api/backoffice-staff/inventory/stores/a1/stocktakes/draft-a?paged=1'||path==='/api/backoffice-staff/inventory/stores/a1/stocktakes/draft-a?paged=1&code=5200123456789')return current;
  if(path.includes('/new-card/options'))return {categories:[],brands:[],vatDepartments:[],suppliers:[],supplierCodes:[]};
  return {};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('select');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,45)));
  await m.act(async()=>document.querySelector('.inv2-history-open').click());
  const input=document.querySelector('input[placeholder="Barcode, SKU ή περιγραφή"]');assert.ok(input);
  await m.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'5200123456789');input.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(document.querySelector('.inv2-new-product'),null);
  await m.act(async()=>input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const create=document.querySelector('.inv2-new-product');assert.ok(create);
  await m.act(async()=>create.click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,80)));
  const dialog=document.querySelector('[role="dialog"][aria-label="Νέο είδος · Πλήρης καρτέλα"]');assert.ok(dialog,'existing full product card must open');
  assert.equal(writes.length,0,'no product, quantity or stock mutation without Save');
  const stockInput=[...dialog.querySelectorAll('label')].find(x=>x.textContent.includes('Αρχικό απόθεμα'))?.querySelector('input');
  assert.ok(stockInput);assert.equal(stockInput.disabled,true,'opening stock is always disabled in inventory entry');
 }finally{await m.close()}
});

test('close-only staff can open the counted shift form without reading sales history',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['shifts.close']}]};
  if(path==='/api/backoffice-staff/shifts/stores/a1/terminals')return {storeId:'a1',terminals:['POS2']};
  assert.equal(path,'/api/cash/stores/a1/close-context');
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  assert.equal(options.headers['x-mws-terminal-pos'],'POS2');
  return {openSession:{id:'shift',openingOperational:10,openingSafe:0},summaryBySession:{shift:{cashSales:23,cardSales:31,expensesTotal:2,transferIn:9,transferOut:3}}};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(button('Πωλήσεις και βάρδιες'),undefined);
  await m.act(async()=>button('Κλείσιμο βάρδιας').click());
  await m.act(async()=>{const s=document.querySelector('[aria-label="Ταμείο"]');s.value='POS2';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  assert.match(document.body.textContent,/Κλείσιμο & Παράδοση βάρδιας/);
  assert.ok([...document.querySelectorAll('input')].some(el=>el.readOnly&&el.value==='23'));
  assert.ok([...document.querySelectorAll('input')].some(el=>el.readOnly&&el.value==='37'));
  assert.ok(calls.every(x=>!x.options.method&&!x.path.includes('/transactions/')));
 }finally{await m.close()}
});

test('posted invoice cancellation appears and submits only with the independent store grant',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const action of ['invoices.reopen','invoices.cancel']){
  const calls=[];
  const order={id:'order',storeId:'a1',storeName:'A1',supplierName:'Synthetic',status:'INVOICED',invoiceNumber:'SYN-CANCEL'};
  const base='/api/purchase-orders/order';
  const api=async(path,options={})=>{
   calls.push({path,options});
   if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:['invoices.read',action]}]};
   if(path.startsWith('/api/purchase-orders/report?'))return {stores:[{id:'a1',name:'A1'}],suppliers:[],orders:[order],summary:{count:1}};
   if(path===base+'/detail')return {order,lines:[],totals:{quantity:0,net:0,gross:0}};
   if(path===base+'/cancel-preview?storeId=a1')return {version:'fixture-version',expenseDelta:-1.24,negativeStockCount:1,stockChanges:[{name:'Fixture stock',before:0,delta:-1,after:-1}]};
   if(path===base+'/cancel'&&options.method==='POST'){order.status='CANCELLED';return {status:order.status};}
   return {items:[],suppliers:[],total:0,archiveTotal:0};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
  try{
   await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
   await m.act(async()=>button('Τιμολόγια').click());
   await m.act(async()=>button('Αγορές και πρόχειρα τιμολογίων').click());
   await m.act(async()=>document.querySelector('[data-po-open]').click());
   const cancel=document.querySelector('[data-cancel-invoice]');
   assert.equal(Boolean(cancel),action==='invoices.cancel');
   assert.equal(Boolean(document.querySelector('[data-reopen]')),action==='invoices.reopen');
   assert.equal(calls.some(c=>c.path.startsWith(base+'/cancel')),false);
   if(!cancel)continue;
   await m.act(async()=>cancel.click());
   const form=document.querySelector('[data-cancel-form]');
   const submit=()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
   form.elements.reason.value='Synthetic duplicate invoice';
   form.elements.confirm.checked=true;
   await m.act(async()=>submit());
   assert.equal(calls.some(c=>c.options.method==='POST'),false,'negative stock needs explicit confirmation');
   form.elements.negative.checked=true;
   await m.act(async()=>submit());
   const preview=calls.find(c=>c.path===base+'/cancel-preview?storeId=a1');
   assert.equal(preview.options.headers['x-backoffice-store-id'],'a1');
   const writes=calls.filter(c=>c.options.method==='POST');
   assert.equal(writes.length,1);
   assert.equal(writes[0].path,base+'/cancel');
   assert.equal(writes[0].options.headers['x-backoffice-store-id'],'a1');
   assert.deepEqual(JSON.parse(writes[0].options.body),{storeId:'a1',version:'fixture-version',reason:'Synthetic duplicate invoice',confirm:true,confirmNegativeStock:true});
   assert.equal(document.querySelector('[data-cancel-invoice]'),null);
  }finally{await m.close()}
 }
});

test('shift report needs only its own grant and opens without a selected till',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 const store={id:'a1',name:'A1'};
 const shift={id:'shift',status:'OPEN',openedByName:'Synthetic report operator',transactionCount:1,openedAt:'2026-11-16T08:00:00Z',terminalPos:'MAIN',cashSales:13};
 const calls=[];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{...store,profile:'MANAGER',capabilities:['shifts.read']}]};
  assert.equal(path,'/api/cash-control/stores/a1/reporting-overview');
  assert.equal(options.method||'GET','GET');
  assert.equal(options.headers['x-backoffice-store-id'],'a1');
  assert.equal(options.headers['x-mws-terminal-pos'],undefined);
  return {store,timeZone:'Europe/Athens',recent:[shift],openSessions:[shift],recentTransactions:[{id:'entry',sessionId:'shift',type:'SALE_CASH',amount:13,description:'Synthetic report transaction',occurredAt:'2026-11-16T08:01:00Z'}]};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα"]');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(button('Πωλήσεις και βάρδιες'),undefined);
  assert.equal(button('Κλείσιμο βάρδιας'),undefined);
  await m.act(async()=>button('Αναφορά βαρδιών').click());
  assert.equal(document.querySelector('[aria-label="Ταμείο"]'),null);
  assert.match(document.body.textContent,/Synthetic report operator/);
  await m.act(async()=>button('1 · Προβολή').click());
  assert.match(document.body.textContent,/Synthetic report transaction/);
  await m.act(async()=>button('Ανανέωση αναφοράς βαρδιών').click());
  assert.equal(calls.filter(call=>call.path.endsWith('/reporting-overview')).length,2);
 }finally{await m.close();}
});

test('supplier comparison uses its independent store right, drops late results and clears displayed prices after denied refresh',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let resolveFirst,denyRefresh=false;
  const first=new Promise(resolve=>{resolveFirst=resolve});
  const supplierRow=(name)=>({productId:'product',productName:name,sku:'001',unitLabel:'τεμάχιο',supplierId:'supplier',supplierName:'Scoped supplier',lastCost:2,bestCost:1.5,comparablePurchaseCount:1,excludedPurchaseCount:0});
  const api=async(path,options={})=>{
    calls.push({path,options});
    assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,stores:[
      {id:'a1',name:'A1',profile:'MANAGER',capabilities:['supplier-price-comparison.read']},
      {id:'a2',name:'A2',profile:'AUDITOR',capabilities:['supplier-price-comparison.read']},
      {id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}
    ]};
    const url=new URL(path,'https://isolated.invalid');
    assert.equal(url.pathname,'/api/commerce/supplier-price-comparison');
    assert.equal(options.headers['x-backoffice-store-id'],url.searchParams.get('storeId'));
    if(url.searchParams.get('storeId')==='a1')return first;
    assert.equal(url.searchParams.get('storeId'),'a2');
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    return [supplierRow('Current store product')];
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  try{
    assert.equal(button('Σύγκριση προμηθευτών'),undefined);
    assert.equal(calls.length,1);
    await selectStore('a1');
    assert.equal(button('Τιμολόγια'),undefined);
    assert.equal(button('Είδη και αποθήκη'),undefined);
    await m.act(async()=>button('Σύγκριση προμηθευτών').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.equal(calls.length,2);
    await selectStore('a2');
    assert.equal(document.querySelector('.supplier-comparison'),null);
    await m.act(async()=>button('Σύγκριση προμηθευτών').click());
    assert.match(document.querySelector('.supplier-comparison').textContent,/Current store product/);
    await m.act(async()=>resolveFirst([supplierRow('Late previous store product')]));
    assert.doesNotMatch(document.body.textContent,/Late previous store product/);
    denyRefresh=true;
    await m.act(async()=>button('Ανανέωση σύγκρισης').click());
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Current store product/);
    await selectStore('a3');
    assert.equal(button('Σύγκριση προμηθευτών'),undefined);
    assert.equal(document.querySelector('.supplier-comparison'),null);
    assert.equal(calls.length,4);
  }finally{await m.close()}
});

test('delegated low-value report opens independently, scopes calculations to its store and hides revoked results',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let denyRefresh=false;
  const api=async(path,options={})=>{
    calls.push({path,options});
    assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,stores:[
      {id:'a1',name:'A1',profile:'AUDITOR',capabilities:['low-value-products.read']},
      {id:'a2',name:'A2',profile:'MANAGER',capabilities:['products.read']}
    ]};
    const url=new URL(path,'https://isolated.invalid');
    assert.equal(url.pathname,'/api/commerce/low-value-products');
    assert.equal(url.searchParams.get('storeId'),'a1');
    assert.equal(options.headers['x-backoffice-store-id'],'a1');
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    return {storeId:'a1',options:{historyDays:30,slowDays:90,marginPercent:20},rows:[{
      productId:'scoped',name:'Scoped low-margin product',sku:'001',unitLabel:'τεμάχιο',
      currentStock:4,soldQuantity:1,returnedQuantity:0,netQuantity:1,daysOfStock:120,
      salesNet:10,costValue:9,profit:1,margin:10,flags:['LOW_MARGIN'],warnings:[],costEvidence:[]
    }]};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  try{
    assert.equal(button('Προϊόντα Χαμηλής Απόδοσης'),undefined);
    assert.equal(calls.length,1);
    await selectStore('a1');
    assert.equal(button('Είδη και αποθήκη'),undefined);
    assert.equal(button('Τιμολόγια'),undefined);
    assert.equal(button('Σύγκριση προμηθευτών'),undefined);
    await m.act(async()=>button('Προϊόντα Χαμηλής Απόδοσης').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.match(document.querySelector('.low-value-products').textContent,/Scoped low-margin product/);
    assert.match(document.querySelector('.low-value-products').textContent,/Χαμηλό περιθώριο/);
    assert.equal(calls.length,2);
    denyRefresh=true;
    await m.act(async()=>document.querySelector('.low-value-options').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Scoped low-margin product/);
    await selectStore('a2');
    assert.equal(button('Προϊόντα Χαμηλής Απόδοσης'),undefined);
    assert.equal(document.querySelector('.low-value-products'),null);
    assert.equal(calls.length,3);
  }finally{await m.close()}
});

test('delegated order suggestions opens standalone and groups suppliers within the selected store',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  const {buildSupplierOrderGroups}=await import('../src/lib/supplier-order-groups.js');
  const flat={storeId:'a1',options:{historyDays:30,coverageDays:7,leadDays:3},generatedAt:'2026-11-17T12:00:00.000Z',from:'2026-10-18T12:00:00.000Z',to:'2026-11-17T12:00:00.000Z',rows:[{
    productId:'product',name:'Scoped suggested product',sku:'001',unitLabel:'τεμάχιο',currentStock:1,minStock:2,targetStock:10,
    soldQuantity:30,returnedQuantity:0,netQuantity:30,dailyDemand:1,suggestedQuantity:9,reason:'Demand.',warnings:[]
  }]};
  const evidence=[{productId:'product',supplierId:'supplier',supplierName:'Scoped supplier',documentId:'document'}];
  const grouped={...flat,...buildSupplierOrderGroups(flat.rows,evidence,{complete:true}),supplierEvidence:{from:flat.from,to:flat.to,historyDays:30,limit:20000,complete:true,observedDocumentProductSupplierCount:1,physicalDeliveryFrequencyVerified:false}};
  let denyRefresh=false;
  const api=async(path,options={})=>{
    calls.push({path,options});
    assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,stores:[
      {id:'a1',name:'A1',profile:'AUDITOR',capabilities:['order-suggestions.read']},
      {id:'a2',name:'A2',profile:'MANAGER',capabilities:[]}
    ]};
    const url=new URL(path,'https://isolated.invalid');
    assert.ok(['/api/commerce/order-suggestions','/api/commerce/order-suggestions/by-supplier'].includes(url.pathname));
    assert.equal(url.searchParams.get('storeId'),'a1');
    assert.equal(options.headers['x-backoffice-store-id'],'a1');
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    return url.pathname.endsWith('/by-supplier')?grouped:flat;
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  try{
    assert.equal(button('Προτάσεις παραγγελίας'),undefined);
    await selectStore('a1');
    assert.equal(button('Είδη και αποθήκη'),undefined);
    assert.equal(button('Τιμολόγια'),undefined);
    await m.act(async()=>button('Προτάσεις παραγγελίας').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.match(document.querySelector('.order-suggestions').textContent,/Scoped suggested product/);
    await m.act(async()=>{const select=document.querySelector('[aria-label="Προβολή προτάσεων"]');select.value='supplier';select.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.match(document.querySelector('.order-suggestions').textContent,/Scoped supplier/);
    assert.match(document.querySelector('.order-suggestions').textContent,/PROXY/);
    assert.equal(calls.length,3);
    denyRefresh=true;
    await m.act(async()=>document.querySelector('.order-suggestions-options').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Scoped suggested product/);
    assert.equal(button('CSV πρότασης').disabled,true);
    await selectStore('a2');
    assert.equal(button('Προτάσεις παραγγελίας'),undefined);
    assert.equal(document.querySelector('.order-suggestions'),null);
    assert.equal(calls.length,4);
  }finally{await m.close()}
});

test('delegated analytics restricts its native store selector and discards old or denied reports',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let resolveFirst,denyRefresh=false;
  const first=new Promise(resolve=>{resolveFirst=resolve});
  const report=storeId=>({storeId,categories:[],employees:[],products:[{description:`Analytics product ${storeId}`,quantity:1,revenue:10,discounts:0}]});
  const api=async(path,options={})=>{
    calls.push({path,options});assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,stores:[
      ...['a1','a2'].map(id=>({id,name:id.toUpperCase(),profile:'AUDITOR',capabilities:['analytics.read','sales.read','shifts.read']})),
      {id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}
    ]};
    const url=new URL(path,'https://isolated.invalid'),storeId=options.headers['x-backoffice-store-id'];
    assert.ok(['a1','a2'].includes(storeId));
    if(url.pathname.endsWith('/terminals'))return {storeId,terminals:[]};
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    if(url.pathname==='/api/commerce/sales/advanced-report'){
      assert.equal(url.searchParams.get('storeId'),storeId);
      assert.ok(url.searchParams.get('from'));assert.ok(url.searchParams.get('to'));
      return storeId==='a1'?first:report(storeId);
    }
    assert.ok([`/api/cash-control/stores/${storeId}/reporting-overview`,`/api/transactions/stores/${storeId}/overview`].includes(url.pathname));
    const shift={id:`shift-${storeId}`,openedAt:'2026-11-17T08:00:00Z',closedAt:'2026-11-17T09:00:00Z',openedByName:`Operator ${storeId}`,cashSales:10,cardSales:0};
    return {store:{id:storeId},recent:url.pathname.endsWith('/reporting-overview')?[shift]:[],openSessions:[],recentTransactions:[]};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  try{
    await selectStore('a1');
    await m.act(async()=>button('Ανάλυση πωλήσεων').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.equal(document.querySelector('.kiosk-sales .kiosk-top-controls select').options.length,1);
    assert.equal(document.querySelector('.kiosk-sales .kiosk-top-controls select').value,'a1');
    assert.doesNotMatch(document.body.textContent,/Operator a1/,'contexts remain hidden until report completes');
    await selectStore('a2');
    assert.equal(document.querySelector('.kiosk-sales'),null);
    await m.act(async()=>button('Ανάλυση πωλήσεων').click());
    assert.match(document.querySelector('.kiosk-sales').textContent,/Analytics product a2/);
    assert.equal(document.querySelector('.kiosk-sales .kiosk-top-controls select').options.length,1);
    assert.equal(document.querySelector('.kiosk-sales .kiosk-top-controls select').value,'a2');
    await m.act(async()=>resolveFirst(report('a1')));
    assert.doesNotMatch(document.body.textContent,/Analytics product a1|Operator a1/);
    denyRefresh=true;
    await m.act(async()=>document.querySelector('.kiosk-top-controls button').click());
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Analytics product a2|Operator a2/);
    await selectStore('a3');
    assert.equal(button('Ανάλυση πωλήσεων'),undefined);
    assert.equal(document.querySelector('.kiosk-sales'),null);
  }finally{await m.close()}
});

test('native analytics rejects mismatched store identity from any report context',async()=>{
  const Analytics=await component('commerce/AdvancedSalesAnalytics');
  for(const mismatch of ['cash','ledger','report']){
    const api=async path=>{
      if(path.includes('/sales/advanced-report'))return {storeId:mismatch==='report'?'other':'a1',products:[{description:'Unconfirmed store product'}]};
      const cash=path.includes('/cash-control/');
      return {store:{id:mismatch===(cash?'cash':'ledger')?'other':'a1'},recent:cash?[{id:'shift',openedAt:'2026-11-17T08:00:00Z',closedAt:'2026-11-17T09:00:00Z',openedByName:'Unconfirmed operator'}]:[],openSessions:[]};
    };
    const m=await mount(Analytics,{api,stores:[{id:'a1',name:'A1'}],initialStoreId:'a1'});
    try{
      assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκε το κατάστημα/);
      assert.doesNotMatch(document.body.textContent,/Unconfirmed store product|Unconfirmed operator/);
    }finally{await m.close()}
  }
});

test('delegated handover is scoped read-only and suppresses late attachments and revoked lists',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[],popups=[];
  let resolveAttachment,denyRefresh=false;
  const pendingAttachment=new Promise(resolve=>{resolveAttachment=resolve});
  const row=storeId=>({id:`handover-${storeId}`,priority:'HIGH',status:'OPEN',message:`Handover ${storeId}`,fromName:'Named operator',hasAttachment:true});
  const api=async(path,options={})=>{
    calls.push({path,options});assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,stores:[
      ...['a1','a2'].map(id=>({id,name:id.toUpperCase(),profile:'AUDITOR',capabilities:['handover.read']})),
      {id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}
    ]};
    const url=new URL(path,'https://isolated.invalid'),storeId=options.headers['x-backoffice-store-id'];
    assert.equal(url.searchParams.get('storeId'),storeId);
    if(url.pathname.endsWith('/attachment'))return storeId==='a1'?pendingAttachment:{dataUrl:'data:image/jpeg;base64,AAAA',filename:'handover.jpg'};
    assert.equal(url.pathname,'/api/commerce/handover');
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    return [row(storeId)];
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  window.open=()=>{const popup={document:document.implementation.createHTMLDocument('')};popups.push(popup);return popup};
  try{
    assert.equal(button('Παράδοση βάρδιας'),undefined);
    await selectStore('a1');
    await m.act(async()=>button('Παράδοση βάρδιας').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.match(document.querySelector('.store-handover').textContent,/Handover a1/);
    assert.equal(document.querySelector('.store-handover form'),null);
    assert.equal(button('Επιβεβαίωση παραλαβής'),undefined);
    await m.act(async()=>button('Συνημμένο').click());
    await selectStore('a2');
    await m.act(async()=>button('Παράδοση βάρδιας').click());
    assert.match(document.querySelector('.store-handover').textContent,/Handover a2/);
    await m.act(async()=>resolveAttachment({dataUrl:'data:image/jpeg;base64,AAAA',filename:'late.jpg'}));
    assert.equal(popups.length,0);
    await m.act(async()=>button('Συνημμένο').click());
    assert.equal(popups.length,1);
    assert.equal(popups[0].document.querySelector('img').alt,'handover.jpg');
    denyRefresh=true;
    await m.act(async()=>document.querySelector('.store-handover .cloud-panel-head button').click());
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Handover a2/);
    await selectStore('a3');
    assert.equal(button('Παράδοση βάρδιας'),undefined);
    assert.equal(document.querySelector('.store-handover'),null);
  }finally{await m.close()}
});

test('native handover preserves Owner creation and acknowledgement by default',async()=>{
  const Panel=await component('store/StoreHandoverPanel'),writes=[];
  const api=async(path,options={})=>{
    if(options.method){writes.push({path,body:JSON.parse(options.body)});return {ok:true}}
    return [{id:'handover',priority:'NORMAL',status:'OPEN',message:'Existing handover'}];
  };
  const m=await mount(Panel,{api,store:{id:'a1'}});
  try{
    const form=document.querySelector('.store-handover form');
    form.elements.message.value='New Owner handover';
    await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(writes[0],{path:'/api/commerce/handover',body:{storeId:'a1',priority:'NORMAL',message:'New Owner handover',attachment:null}});
    assert.equal(form.elements.message.value,'');
    assert.match(document.body.textContent,/Η παράδοση στάλθηκε/);
    await m.act(async()=>button('Επιβεβαίωση παραλαβής').click());
    assert.deepEqual(writes[1],{path:'/api/commerce/handover/handover/ack',body:{}});
    assert.match(document.body.textContent,/Η παραλαβή επιβεβαιώθηκε/);
    await m.render({api,store:{id:'a1'},readOnly:true});
    assert.equal(document.querySelector('form'),null);
    assert.equal(button('Επιβεβαίωση παραλαβής'),undefined);
    assert.equal(writes.length,2);
  }finally{await m.close()}
});

test('delegated personnel reuses native cards with scoped list/detail reads and suppresses payroll and late profiles',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let resolveDetail,denyRefresh=false;
  const pendingDetail=new Promise(resolve=>{resolveDetail=resolve});
  const employee=storeId=>({id:`employee-${storeId}`,companyId:'a',fullName:`Employee ${storeId}`,phone:'2100000000',email:'staff@example.invalid',active:true,baseStoreId:storeId,baseStoreName:storeId.toUpperCase(),primaryRole:{name:'Ταμίας'},storeAccess:[{storeId,active:true}],maxDaysPerWeek:5,maxHoursPerWeek:40,minimumDaysOff:2,worksMorning:true,paymentType:'FIXED_MONTHLY',fixedMonthlyAmount:98765});
  const api=async(path,options={})=>{
    calls.push({path,options});assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,companyId:'a',stores:[
      ...['a1','a2'].map(id=>({id,name:id.toUpperCase(),profile:'AUDITOR',capabilities:['employees.read']})),
      {id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}
    ]};
    const storeId=options.headers['x-backoffice-store-id'];
    const base=`/api/platform/store-modules/companies/a/stores/${storeId}/workforce-v2/employees`;
    assert.ok(path===base||path===`${base}/employee-${storeId}`);
    if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    if(path!==base)return storeId==='a1'?pendingDetail:{companyId:'a',storeId,item:employee(storeId)};
    return {companyId:'a',storeId,items:[employee(storeId)],count:1};
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{
    const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  try{
    assert.equal(button('Προσωπικό'),undefined);
    await selectStore('a1');
    await m.act(async()=>button('Προσωπικό').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.match(document.querySelector('.workforce-employee-list').textContent,/Employee a1/);
    assert.equal(document.querySelector('.workforce-editor-card'),null);
    assert.equal(button('Επεξεργασία'),undefined);
    assert.equal(button('Εκτύπωση κάρτας'),undefined);
    assert.equal(button('Αποστολή εφαρμογής'),undefined);
    assert.equal(button('Απόδοση & Ταμεία'),undefined);
    assert.equal(button('Απενεργοποίηση'),undefined);
    assert.equal(document.querySelector('.workforce-tabs'),null);
    assert.doesNotMatch(document.body.textContent,/98765|Σταθερό|Ωρομίσθιο|Μισθοδοσία/);
    await m.act(async()=>button('Προβολή καρτέλας').click());
    await selectStore('a2');
    await m.act(async()=>button('Προσωπικό').click());
    assert.match(document.querySelector('.workforce-employee-list').textContent,/Employee a2/);
    await m.act(async()=>resolveDetail({companyId:'a',storeId:'a1',item:{...employee('a1'),email:'late-profile@example.invalid'}}));
    assert.doesNotMatch(document.body.textContent,/Employee a1|late-profile/);
    await m.act(async()=>button('Προβολή καρτέλας').click());
    assert.match(document.querySelector('.workforce-employee-detail').textContent,/staff@example.invalid/);
    denyRefresh=true;
    await m.act(async()=>button('Ανανέωση προσωπικού').click());
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Employee a2|staff@example.invalid/);
    await selectStore('a3');
    assert.equal(button('Προσωπικό'),undefined);
    assert.equal(document.querySelector('.workforce-personnel-read'),null);
    assert.equal(calls.length,6);
  }finally{await m.close()}
});

test('personnel read view rejects same-company replies for another store in list and detail',async()=>{
  const Panel=await component('platform/WorkforceV2EmployeesPanel');
  const employee={id:'employee',companyId:'a',fullName:'Unconfirmed personnel',active:true,maxDaysPerWeek:5,maxHoursPerWeek:40};
  for(const mismatch of ['list','detail']){
    const api=async path=>path.endsWith('/employees')
      ?{companyId:'a',storeId:mismatch==='list'?'other':'a1',items:[employee],count:1}
      :{companyId:'a',storeId:'other',item:{...employee,email:'foreign-profile@example.invalid'}};
    const m=await mount(Panel,{company:{id:'a'},store:{id:'a1',name:'A1'},request:api,readOnly:true});
    try{
      if(mismatch==='detail')await m.act(async()=>button('Προβολή καρτέλας').click());
      assert.ok(document.querySelector('[role="alert"]'));
      assert.doesNotMatch(document.body.textContent,/Unconfirmed personnel|foreign-profile@example.invalid/);
    }finally{await m.close()}
  }
});

test('schedule, attendance and leave views each use an independent native store read without other workforce requests',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace');
  for(const [key,label,endpoint,selector] of [
    ['schedule','Πρόγραμμα','schedules','.workforce-schedule-workspace'],
    ['attendance','Παρουσίες','attendance','.workforce-attendance-workspace'],
    ['leaves','Άδειες και ρεπό','leaves','.workforce-schedule-workspace']
  ]){
    const calls=[];
    let resolveOld,pendingRefresh=false,denyRefresh=false;
    const old=new Promise(resolve=>{resolveOld=resolve});
    const payload=(storeId,date)=>{
      const employee={id:`employee-${storeId}`,fullName:`Scoped worker ${storeId}`};
      const envelope={companyId:'a',storeId};
      if(key==='leaves')return {...envelope,items:[{id:'leave',employee,leaveType:'DAY_OFF',status:'REQUESTED',startDate:date,endDate:date}]};
      if(key==='schedule')return {...envelope,items:[{id:'schedule',periodStart:date,periodEnd:date,status:'DRAFT',version:1,assignments:[{id:'assignment',date,slot:1,employeeId:employee.id,employee,shiftTemplate:{id:'template',name:'Πρωινή',startTime:'08:00',endTime:'16:00'},warningState:'NEEDS_APPROVAL'}]}]};
      return {...envelope,date,employees:[employee],canApprove:true,summary:{open:1,closed:0,workedMinutes:60,scheduledMinutes:480,varianceMinutes:-420,review:1,workedAmount:98765},items:[{id:'attendance',employee,status:'NEEDS_APPROVAL',startedAt:'2026-11-17T08:00:00Z',workedMinutes:60,scheduledMinutes:480,varianceMinutes:-420,hourlyRate:98765,workedAmount:98765}]};
    };
    const api=async(path,options={})=>{
      calls.push({path,options});assert.equal(options.method||'GET','GET');
      if(path.endsWith('/me'))return {...identity,companyId:'a',stores:[
        ...['a1','a2'].map(id=>({id,name:id.toUpperCase(),profile:'AUDITOR',capabilities:[`${key}.read`]})),
        {id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}
      ]};
      const storeId=options.headers['x-backoffice-store-id'];
      const url=new URL(path,'https://isolated.invalid');
      assert.equal(url.pathname,`/api/platform/store-modules/companies/a/stores/${storeId}/workforce-v2/${endpoint}`);
      if(denyRefresh)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
      if(pendingRefresh&&storeId==='a1')return old;
      return payload(storeId,url.searchParams.get(key==='attendance'?'date':'from'));
    };
    const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
    const selectStore=async(id)=>m.act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))});
    try{
      await selectStore('a1');
      for(const otherLabel of ['Προσωπικό','Πρόγραμμα','Παρουσίες','Άδειες και ρεπό'].filter(item=>item!==label))assert.equal(button(otherLabel),undefined);
      await m.act(async()=>button(label).click());
      await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
      assert.match(document.querySelector(selector).textContent,/Scoped worker a1/);
      for(const forbidden of ['Νέο πρόχειρο πρόγραμμα','Έλεγχος προγράμματος','Δημοσίευση','Έγκριση','Αφαίρεση','Καταχώριση αιτήματος','Απόρριψη','Διόρθωση ωρών','Έναρξη','Λήξη'])assert.equal(button(forbidden),undefined,`${key}: ${forbidden}`);
      assert.equal(document.querySelector('.workforce-schedule-sections'),null);
      assert.equal(document.querySelector('.workforce-leave-form'),null);
      assert.doesNotMatch(document.querySelector(selector).textContent,/98765|Ωρομίσθιο|Αξία ωρών|Αξία πραγματικών ωρών/);
      if(key==='schedule'){
        await m.act(async()=>button('Ανά εργαζόμενο').click());
        assert.match(document.querySelector('.workforce-employee-schedule').textContent,/Scoped worker a1/);
      }
      pendingRefresh=true;
      const refresh=()=>document.querySelector(`${selector} .workforce-v2-section-title button`);
      await m.act(async()=>refresh().click());
      assert.doesNotMatch(document.querySelector(selector).textContent,/Scoped worker a1/);
      await selectStore('a2');
      await m.act(async()=>button(label).click());
      assert.match(document.querySelector(selector).textContent,/Scoped worker a2/);
      await m.act(async()=>resolveOld(payload('a1','2026-11-17')));
      assert.doesNotMatch(document.querySelector(selector).textContent,/Scoped worker a1/);
      denyRefresh=true;
      await m.act(async()=>refresh().click());
      assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
      assert.doesNotMatch(document.querySelector(selector).textContent,/Scoped worker a2/);
      await selectStore('a3');
      assert.equal(button(label),undefined);
      assert.equal(document.querySelector(selector),null);
      assert.equal(calls.length,5);
    }finally{await m.close()}
  }
});

test('read-only workforce schedule, leaves and attendance reject a foreign store envelope',async()=>{
  const Schedule=await component('platform/WorkforceV2ScheduleTab'),Attendance=await component('platform/WorkforceV2AttendanceTab');
  for(const [Panel,extra] of [[Schedule,{}],[Schedule,{readOnlySection:'LEAVE'}],[Attendance,{}]]){
    const request=async()=>({companyId:'a',storeId:'foreign',items:[{id:'foreign'}]});
    const m=await mount(Panel,{company:{id:'a'},store:{id:'a1'},request,readOnly:true,...extra});
    try{assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκε το κατάστημα/)}finally{await m.close()}
  }
});

test('stock movements use the native selected-product history table and discard stale dates and revoked reads',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let resolveOld,attempt=0,wrongProduct=false,deny=false;
  const old=new Promise(resolve=>{resolveOld=resolve});
  const movement=note=>({companyId:'a',storeId:'a1',product:{id:'p1',currentStock:5},reconciliationAccess:{allowed:true},reconciliation:{status:'AGREEMENT',ledgerStock:5,difference:0,movementCount:1,duplicateCandidates:[]},movements:[{id:'move',createdAt:'2026-11-17T08:00:00Z',movementType:'PURCHASE',actorName:'Scoped stock operator',unitCost:1,salePrice:2,inQty:5,outQty:0,stockAfter:5,note}]});
  const api=async(path,options={})=>{
    calls.push({path,options});assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,companyId:'a',stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['stock.read','products.read']},{id:'a2',name:'A2',profile:'MANAGER',capabilities:['products.read']}]};
    const url=new URL(path,'https://isolated.invalid');
    assert.equal(options.headers['x-backoffice-store-id'],'a1');
    assert.equal(url.searchParams.get('storeId'),'a1');
    if(url.pathname==='/api/inventory-archive')return {store:{id:'a1'},items:[{productId:'p1',name:'Scoped stock product',currentStock:5}],categories:[],subcategories:[],page:1,pages:1,total:1,totals:{}};
    assert.equal(url.pathname,'/api/inventory-ledger/p1/movements');
    assert.ok(url.searchParams.get('from'));assert.ok(url.searchParams.get('to'));
    if(deny)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    if(++attempt===1)return old;
    const result=movement('Current stock movement');
    return wrongProduct?{...result,product:{id:'other'}}:result;
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  try{
    await m.act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα"]');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
    await m.act(async()=>button('Κινήσεις αποθήκης').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.equal(button('Κινήσεις είδους').disabled,true);
    await m.act(async()=>document.querySelector('.ia-row.data').click());
    assert.equal(document.querySelector('[title="Διόρθωση είδους"]').hidden,true);
    await m.act(async()=>button('Κινήσεις είδους').click());
    await m.act(async()=>{const input=document.querySelector('[aria-label="Κινήσεις από"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'2026-01-01');input.dispatchEvent(new Event('input',{bubbles:true}))});
    assert.equal(button('Ανανέωση κινήσεων').disabled,false);
    await m.act(async()=>document.querySelector('.ia-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.match(document.querySelector('.ia-modal table').textContent,/Scoped stock operator/);
    assert.match(document.querySelector('.ia-modal table').textContent,/Current stock movement/);
    assert.match(document.querySelector('.ia-modal table').textContent,/Τιμή πώλησης/);
    assert.match(document.querySelector('.ia-modal').textContent,/ΣΥΜΦΩΝΙΑ STOCK/);
    assert.equal([...document.querySelectorAll('.ia-modal button')].some(el=>el.textContent.includes('Excel')),false);
    await m.act(async()=>resolveOld(movement('Stale stock movement')));
    assert.doesNotMatch(document.querySelector('.ia-modal').textContent,/Stale stock movement/);
    wrongProduct=true;
    await m.act(async()=>button('Ανανέωση κινήσεων').click());
    assert.equal(document.querySelector('.ia-modal'),null);
    assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκε το κατάστημα και το είδος/);
    wrongProduct=false;
    await m.act(async()=>button('Κινήσεις είδους').click());
    assert.match(document.querySelector('.ia-modal table').textContent,/Current stock movement/);
    deny=true;
    await m.act(async()=>button('Ανανέωση κινήσεων').click());
    assert.equal(document.querySelector('.ia-modal'),null);
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Current stock movement/);
    await m.act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα"]');select.value='a2';select.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.equal(button('Κινήσεις αποθήκης'),undefined);
    assert.equal(document.querySelector('.ia-shell'),null);
  }finally{await m.close()}
});

test('delegated payroll reads native periods, detail and preview while hiding writers and rejecting old store or month results',async()=>{
  const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
  let resolveDetail,resolvePreview,previewAttempts=0,deny=false;
  const oldDetail=new Promise(resolve=>{resolveDetail=resolve}),oldPreview=new Promise(resolve=>{resolvePreview=resolve});
  const period=storeId=>({id:`period-${storeId}`,name:`Payroll ${storeId}`,status:'DRAFT',periodStart:'2026-11-01T00:00:00.000Z',periodEnd:'2026-12-01T00:00:00.000Z'});
  const detail=storeId=>({...period(storeId),companyId:'a',storeId,lines:[{id:'line',employeeId:'employee',employeeName:`Payroll worker ${storeId}`,plannedMinutes:480,actualMinutes:480,absenceMinutes:0,grossAmount:120,paidAmount:20,balanceAmount:100}],payments:[]});
  const api=async(path,options={})=>{
    calls.push({path,options});assert.equal(options.method||'GET','GET');
    if(path.endsWith('/me'))return {...identity,companyId:'a',stores:[...['a1','a2'].map(id=>({id,name:id.toUpperCase(),profile:'AUDITOR',capabilities:['payroll.read']})),{id:'a3',name:'A3',profile:'MANAGER',capabilities:[]}]};
    const storeId=options.headers['x-backoffice-store-id'],url=new URL(path,'https://isolated.invalid');
    const base=`/api/platform/store-modules/companies/a/stores/${storeId}/workforce-v2/payroll`;
    assert.ok([`${base}/periods`,`${base}/periods/period-${storeId}`,`${base}/preview`].includes(url.pathname));
    if(deny)throw Object.assign(new Error('Η πρόσβαση ανακλήθηκε.'),{status:403});
    if(url.pathname===`${base}/periods`)return {companyId:'a',storeId,items:[period(storeId)]};
    if(url.pathname===`${base}/periods/period-${storeId}`)return storeId==='a1'?oldDetail:detail(storeId);
    const preview={companyId:'a',storeId,from:url.searchParams.get('from'),to:url.searchParams.get('to'),entries:[{employeeId:'employee'}],totalAmount:321};
    return ++previewAttempts===1?oldPreview:preview;
  };
  const m=await mount(Workspace,{api,user:{fullName:'Fixture'},onLogout:()=>{}});
  const selectStore=async(id)=>m.act(async()=>{const select=document.querySelector('[aria-label="Κατάστημα"]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))});
  try{
    await selectStore('a1');
    assert.equal(button('Προσωπικό'),undefined);
    await m.act(async()=>button('Μισθοδοσία').click());
    await m.act(async()=>new Promise(resolve=>setTimeout(resolve,60)));
    assert.doesNotMatch(document.body.textContent,/Payroll worker a1/);
    await selectStore('a2');
    await m.act(async()=>button('Μισθοδοσία').click());
    assert.match(document.querySelector('.workforce-payroll-table').textContent,/Payroll worker a2/);
    await m.act(async()=>resolveDetail(detail('a1')));
    assert.doesNotMatch(document.body.textContent,/Payroll worker a1/);
    for(const label of ['Δημιουργία περιόδου','Επανυπολογισμός περιόδου','Καταχώριση πληρωμής','Οριστικό κλείδωμα'])assert.equal(button(label),undefined);
    assert.equal(document.querySelector('.workforce-payroll-payment'),null);
    assert.equal(document.querySelector('.workforce-payroll-guide'),null);
    await m.act(async()=>button('Υπολογισμός').click());
    const previous=calls.at(-1),oldQuery=new URL(previous.path,'https://isolated.invalid').searchParams;
    await m.act(async()=>{const input=document.querySelector('input[type="month"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'2026-10');input.dispatchEvent(new Event('input',{bubbles:true}))});
    await m.act(async()=>resolvePreview({companyId:'a',storeId:'a2',from:oldQuery.get('from'),to:oldQuery.get('to'),entries:[],totalAmount:99999}));
    assert.doesNotMatch(document.body.textContent,/99999|99.999/);
    await m.act(async()=>button('Υπολογισμός').click());
    assert.match(document.querySelector('.workforce-payroll-preview').textContent,/2026-10/);
    assert.match(document.querySelector('.workforce-payroll-preview').textContent,/321/);
    deny=true;
    await m.act(async()=>button('Υπολογισμός').click());
    assert.match(document.querySelector('[role="alert"]').textContent,/Η πρόσβαση ανακλήθηκε/);
    assert.doesNotMatch(document.body.textContent,/Payroll worker a2|Payroll a2|321/);
    await selectStore('a3');
    assert.equal(button('Μισθοδοσία'),undefined);
    assert.equal(document.querySelector('.workforce-payroll-workspace'),null);
  }finally{await m.close()}
});

test('native payroll read-only rejects foreign periods, detail and preview envelopes',async()=>{
  const Panel=await component('platform/WorkforceV2PayrollTab');
  const period={id:'period',name:'Scoped period',status:'DRAFT',periodStart:'2026-11-01T00:00:00Z',periodEnd:'2026-12-01T00:00:00Z'};
  for(const mismatch of ['list','detail','preview']){
    const request=async path=>{
      const url=new URL(path,'https://isolated.invalid');
      if(url.pathname.endsWith('/periods'))return {companyId:'a',storeId:mismatch==='list'?'other':'a1',items:[period]};
      if(url.pathname.endsWith('/periods/period'))return {...period,companyId:'a',storeId:mismatch==='detail'?'other':'a1',lines:[],payments:[]};
      return {companyId:'a',storeId:'other',from:url.searchParams.get('from'),to:url.searchParams.get('to'),entries:[],totalAmount:99999};
    };
    const m=await mount(Panel,{company:{id:'a'},store:{id:'a1'},request,readOnly:true});
    try{
      if(mismatch==='preview')await m.act(async()=>button('Υπολογισμός').click());
      assert.ok(document.querySelector('[role="alert"]'));
      assert.doesNotMatch(document.body.textContent,/Scoped period|99999|99.999/);
    }finally{await m.close()}
  }
});

test('invoice supplier correction searches the directory and sends only a scoped confirmed change',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 const calls=[],order={id:'order',storeId:'a1',storeName:'A1',supplierId:'old',supplierName:'Παλαιός',status:'FINAL',sourceType:'POS_OCR_DRAFT',invoiceNumber:'SYN-1'};
 const suppliers=[{id:'old',name:'Παλαιός',taxId:'111111111'},{id:'new',name:'Νέος',taxId:'222222222'},{id:'other',name:'Άλλος',taxId:'333333333'}];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'MANAGER',capabilities:['invoices.read','invoices.correct-supplier']}]};
  if(path.startsWith('/api/purchase-orders/report?'))return {stores:[{id:'a1',name:'A1'}],suppliers,orders:[order],summary:{count:1}};
  if(path.endsWith('/detail'))return {order,lines:[],totals:{quantity:0,net:0,gross:0}};
  if(path.includes('/supplier-correction-preview?'))return {version:'a'.repeat(64),beforeSupplier:suppliers[0],targetSupplier:suppliers[1],totalGross:1,payment:{amount:1}};
  if(path.endsWith('/supplier-correction'))return {ok:true};
  return {items:[],suppliers:[],total:0,archiveTotal:0};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Τιμολόγια').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  await m.act(async()=>button('Αγορές και πρόχειρα τιμολογίων').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  await m.act(async()=>document.querySelector('[data-po-open]').click());
  await m.act(async()=>document.querySelector('[data-correct-supplier]').click());
  const form=document.querySelector('[data-supplier-correction]');
  const search=form.elements.supplierSearch;
  search.value='νεος';search.dispatchEvent(new Event('input',{bubbles:true}));
  assert.equal(form.elements.supplierId.querySelector('[value="other"]').hidden,true);
  form.elements.supplierId.value='new';form.elements.supplierId.dispatchEvent(new Event('change',{bubbles:true}));
  await m.act(async()=>form.querySelector('[data-preview]').click());
  const submit=form.querySelector('[type="submit"]');
  assert.equal(submit.disabled,true);
  form.elements.reason.value='Έλεγχος πρωτοτύπου';
  form.elements.original.checked=true;
  form.elements.original.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(submit.disabled,true,'linked payment requires independent confirmation');
  form.elements.payment.checked=true;
  form.elements.payment.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal(submit.disabled,false);
  await m.act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const [write]=calls.filter(c=>c.options.method==='POST');
  assert.equal(write.path,'/api/purchase-orders/order/supplier-correction');
  assert.equal(write.options.headers['x-backoffice-store-id'],'a1');
  assert.deepEqual(JSON.parse(write.options.body),{storeId:'a1',supplierId:'new',version:'a'.repeat(64),reason:'Έλεγχος πρωτοτύπου',confirmOriginal:true,confirmPaymentSupplier:true});
 }finally{await m.close()}
});

test('invoice line product and barcode views require the store product grant and stay read-only',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 const order={id:'order',storeId:'a1',storeName:'A1',supplierId:'sup',status:'NEW',invoiceNumber:'SYN-1'};
 const line={id:'line',orderId:'order',productId:'p',primaryBarcode:'123456789',description:'Synthetic row',quantity:1,unitCost:1,netAmount:1,grossAmount:1.24,vatRate:24};
 const calls=[];
 const api=async(path,options={})=>{
  calls.push({path,options});
  if(path.endsWith('/me'))return {...identity,stores:[{id:'a1',name:'A1',profile:'AUDITOR',capabilities:['invoices.read','products.read']}]};
  if(path.startsWith('/api/purchase-orders/report?'))return {stores:[{id:'a1',name:'A1'}],suppliers:[],orders:[order],summary:{count:1}};
  if(path.endsWith('/detail'))return {order,lines:[line],totals:{quantity:1,net:1,gross:1.24}};
  if(path.endsWith('/product-reference'))return {orderId:'order',lineId:'line',storeId:'a1',product:{id:'p',name:'Scoped product',sku:'ABC',salePrice:2,currentStock:3},barcodes:[{barcode:'123456789',unitMultiplier:1}]};
  return {items:[],suppliers:[],total:0,archiveTotal:0};
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  window.alert=globalThis.alert=message=>assert.fail(message);
  await m.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Τιμολόγια').click());
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  await m.act(async()=>button('Αγορές και πρόχειρα τιμολογίων').click());
  await m.act(async()=>new Promise(resolve=>setTimeout(resolve,100)));
  await m.act(async()=>document.querySelector('[data-po-open]').click());
  await m.act(async()=>document.querySelector('[data-barcodes]').click());
  assert.match(document.body.textContent,/Scoped product/,JSON.stringify(calls.map(x=>x.path)));
  assert.match(document.body.textContent,/123456789/);
  assert.ok(calls.some(item=>item.path==='/api/purchase-orders/order/lines/line/product-reference'&&item.options.headers['x-backoffice-store-id']==='a1'));
  assert.equal(calls.some(item=>item.options.method&&item.options.method!=='GET'),false);
 }finally{await m.close()}
});
