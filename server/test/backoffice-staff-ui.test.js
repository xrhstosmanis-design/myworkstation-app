import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function component(name){
  const r=await build({entryPoints:[new URL(`../../client/src/components/${name}.jsx`,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
  const mod={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.default;
}
async function mount(Component,props){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','FormData','IS_REACT_ACT_ENVIRONMENT'];
  const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,props)));
  return {dom,act:React.act,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
const identity={userId:'staff',companyId:'a',fullName:'Fixture',username:'fixture',stores:[{id:'a1',name:'A1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']},{id:'a2',name:'A2',profile:'AUDITOR',capabilities:['cash.read']}]};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
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
