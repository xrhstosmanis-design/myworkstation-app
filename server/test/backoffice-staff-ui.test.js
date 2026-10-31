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
  return {dom,act:React.act,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
const identity={userId:'staff',companyId:'a',fullName:'Fixture',username:'fixture',stores:[{id:'a1',name:'A1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:['cash.read']}]};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
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
  const detail={storeId:'a1',id:'st',name:'Draft',lines:[{id:'line',name:'Water',sku:'001',barcodes:['01234567'],countVersion:0,countedQuantity:null}]};
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
    await m.act(async()=>{const input=document.querySelector('input[name="quantity"]');input.value='7';input.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    assert.equal(writes.length,1);assert.equal(document.querySelector('select').disabled,true);assert.equal(button('Καταχώρηση μέτρησης').disabled,true);assert.ok(button('Επαλήθευση ίδιας καταχώρισης'));
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
    assert.match(document.body.textContent,/Αναμενόμενη ποσότητα: 10/);
    await m.act(async()=>{const r=document.querySelector('input[name="reason"]');r.value='Synthetic correction';r.form.elements.confirm.checked=true;r.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    assert.equal(writes.length,3);assert.equal(document.querySelector('select').disabled,true);
    await m.act(async()=>button('Έλεγχος αποτελέσματος οριστικοποίησης').click());
    assert.equal(writes.length,3);assert.equal(document.querySelector('select').disabled,false);assert.equal(button('Οριστικοποίηση και ενημέρωση αποθέματος'),undefined);assert.equal(button('Καταχώρηση μέτρησης'),undefined);assert.equal(document.querySelector('input[name="quantity"]').disabled,true);
    assert.match(document.body.textContent,/Οριστικοποιημένη απογραφή/);
  }finally{await m.close()}
});
