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
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
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
    for(const label of ['Διαγραφή φωτογραφίας','Επανεπεξεργασία γραμμών','Έλεγχος από βοηθό AI','Έλεγχος εγγραφής','Άνοιγμα υπάρχοντος'])assert.equal(button(label),undefined);
    assert.equal(button('Λήψη από myDATA').hidden,true);
    window.open=()=>({document:preview.window.document,opener:window,close(){}});
    await m.act(async()=>button('Πρωτότυπο φωτογραφία/PDF').click());
    assert.equal(preview.window.document.querySelector('script'),null);assert.equal(preview.window.document.title,'<script>UNTRUSTED</script>');assert.equal(preview.window.document.querySelector('img').src,'data:image/png;base64,AAAA');
    assert.ok(calls.filter(c=>!c.path.endsWith('/me')).every(c=>c.options.headers['x-backoffice-store-id']==='a1'&&!c.options.method));
    assert.ok(calls.every(c=>!c.path.includes('/mydata/')));
  }finally{preview.window.close();await m.close()}
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
  const api=async(path,options={})=>{if(options.method==='POST'){writes.push(JSON.parse(options.body));return {id:'created'}}return {accounts:[],stores:[{id:'a1',name:'A1'},{id:'a2',name:'A2'}]}};
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
  if(path==='/api/backoffice-staff/inventory/stores/a1/stocktakes/st')return {id:'st',storeId:'a1',name:'Readonly draft',status:'DRAFT',lines:[{id:'l',name:'Water',sku:'W',barcodes:['11111111'],countVersion:2,countedQuantity:'4'}]};
  assert.fail('Unexpected native Owner or foreign read: '+path);
 };
 const m=await mount(Workspace,{api,user:{fullName:'Synthetic'},onLogout:()=>{}});
 try{
  await m.act(async()=>{const s=document.querySelector('[aria-label="Κατάστημα"]');s.value='a1';s.dispatchEvent(new Event('change',{bubbles:true}))});
  await m.act(async()=>button('Απογραφή').click());await m.act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
  await m.act(async()=>button('Readonly draft').click());
  assert.match(document.querySelector('.inv2-work tbody').textContent,/Water/);assert.equal(document.querySelector('.inv2-fast-entry'),null);assert.equal(document.querySelector('input[name="name"]'),null);assert.equal(document.querySelector('input[name="reason"]'),null);assert.equal(document.querySelector('button[title="Διόρθωση"]'),null);
  for(const text of ['Απόθεμα','Διαφορά','Αξία κόστους','Νέα απογραφή','Οριστικοποίηση'])assert.ok(!document.querySelector('.inv2').textContent.includes(text));
  assert.deepEqual(calls.map(c=>c.path),['/api/backoffice-staff/me','/api/backoffice-staff/inventory/stores/a1/stocktakes','/api/backoffice-staff/inventory/stores/a1/stocktakes/st']);
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
