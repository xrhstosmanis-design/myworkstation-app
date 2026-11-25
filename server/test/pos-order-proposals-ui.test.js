import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
async function component(path){const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',plugins:[{name:'bundle-icons',setup(b){b.onResolve({filter:/^lucide-react$/},()=>({path:createRequire(import.meta.url).resolve('lucide-react')}))}}],loader:{'.css':'empty'}});const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;}
test('POS proposal production React controls: grants and stale stores',async t=>{
 const Pos=await component('../../client/src/components/store/PosOrderSuggestions.jsx');
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),operator={id:'op'};let closes=0;
 const render=async(C,props)=>act(async()=>root.render(React.createElement(C,props))),clear=()=>act(async()=>root.render(null)),tick=()=>act(async()=>{}),text=()=>document.body.textContent;
 const base={store:{id:'a',name:'A'},operator,open:true,onOpen(){},onClose(){closes++}};
 try{
  await t.test('actual license editor exposes installed opt-in proposal and preserves other module terms',async()=>{
   const License=await component('../../client/src/components/platform/CommercialLicensePanel.jsx');
   const {catalogView}=await import('../src/services/module-catalog.js');
   const modules=catalogView([{moduleKey:'CORE',active:true},{moduleKey:'INVENTORY',active:true},{moduleKey:'POS',active:true}]);
   const calls=[];await render(License,{company:{id:'lab',name:'LAB',plan:'ENTERPRISE',licenseStatus:'ACTIVE',modules},request:async(path,options)=>{calls.push({path,...options});return {ok:true}},onSaved:async()=>{},onClose(){}});
   const launcher=[...document.querySelectorAll('button.commercial-module')].find(b=>b.textContent.includes('Προτάσεις Παραγγελίας'));
   assert.ok(launcher);assert.equal(launcher.disabled,false);assert.match(launcher.textContent,/ΑΝΕΝΕΡΓΟ/);
   await act(async()=>launcher.click());assert.match(launcher.textContent,/ΕΝΕΡΓΟ/);assert.equal(calls.length,0);
   await act(async()=>document.querySelector('form.commercial-license-panel').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(calls.length,1);const body=JSON.parse(calls[0].body);
   assert.equal(body.modules.find(m=>m.key==='ORDER_SUGGESTIONS').active,true);
   for(const m of modules){const saved=body.modules.find(x=>x.key===m.key);assert.ok(saved);if(m.key!=='ORDER_SUGGESTIONS')assert.equal(saved.active,m.active);assert.equal(saved.monthlyPrice,m.monthlyPrice);assert.equal(saved.setupFee,m.setupFee)}
   await clear();
  });
  await t.test('unauthorized POS operator sees no launcher and makes no proposal request',async()=>{const calls=[];await render(Pos,{...base,api:async path=>{calls.push(path);throw Error('403')}});assert.equal(document.querySelector('button'),null);assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/permission'));await clear()});
  await t.test('proposal is read-only and grant revocation on focus removes its data',async()=>{let allowed=true;const calls=[],api=async path=>{calls.push(path);if(path.endsWith('/permission')){if(!allowed)throw Error('403');return {storeId:'a',allowed:true}}return {storeId:'a',expectedReceipts:{available:false},rows:[{productId:'p',name:'Water',sku:'P',currentStock:4,minStock:20,suggestedQuantity:16,unitLabel:'τεμ.',reason:'Κάλυψη',warnings:[]}]}};await render(Pos,{...base,api});await tick();assert.match(text(),/Water/);assert.match(text(),/16/);assert.match(text(),/δεν είναι διαθέσιμες στον υπολογισμό/);assert.equal(calls.filter(p=>new URL(p,'https://isolated.invalid').pathname.endsWith('/proposal')).length,1);allowed=false;await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));assert.doesNotMatch(text(),/Water/);assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(closes>0);await clear()});
  await t.test('late response from previous store cannot populate the new POS context',async()=>{let resolveA;const pending=new Promise(r=>resolveA=r),api=async path=>path.endsWith('/permission')?{storeId:path.includes('/a/')?'a':'b',allowed:true}:path.includes('/a/')?pending:{storeId:'b',rows:[]};await render(Pos,{...base,api});await tick();await render(Pos,{...base,api,store:{id:'b',name:'B'}});await act(async()=>resolveA({storeId:'a',rows:[{productId:'p',name:'OLD STORE',suggestedQuantity:3,warnings:[]}]}));assert.doesNotMatch(text(),/OLD STORE/);await clear()});

  await t.test('actual POS form applies supplier/dates/coverage and sends/prints exactly the displayed snapshot',async()=>{
   const calls=[],printed=[];let completeMail;let seq=0;
   const api=async(path,options={})=>{calls.push({path,...options});const url=new URL(path,'https://isolated.invalid');
    if(url.pathname.endsWith('/permission'))return {storeId:'a',allowed:true};
    if(url.pathname.endsWith('/suppliers'))return {storeId:'a',suppliers:[{id:'sup',name:'Supplier A',email:'supplier@example.invalid'}]};
    if(url.pathname.endsWith('/email'))return new Promise(resolve=>{completeMail=()=>resolve({ok:true,status:'ACCEPTED',reportId:JSON.parse(options.body).reportId})});
    return {storeId:'a',storeName:'A',reportId:`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`,generatedAt:new Date().toISOString(),supplier:url.searchParams.get('supplierId')?{id:'sup',name:'Supplier A',email:'supplier@example.invalid'}:null,period:{fromDate:url.searchParams.get('fromDate'),toDate:url.searchParams.get('toDate')},options:{historyDays:20,coverageDays:Number(url.searchParams.get('coverageDays')),leadDays:Number(url.searchParams.get('leadDays'))},expectedReceipts:{available:false},rows:[{productId:'p',name:'Water <b>500ml</b>',sku:'WATER',currentStock:2,minStock:4,soldQuantity:30,returnedQuantity:2,netQuantity:28,suggestedQuantity:19,unitLabel:'τεμ.',reason:'Κάλυψη',warnings:['Έλεγχος αποθέματος']},{productId:'p2',name:'Milk',sku:'MILK',currentStock:0,minStock:2,soldQuantity:2,returnedQuantity:0,netQuantity:2,suggestedQuantity:2,unitLabel:'τεμ.',reason:'Κάλυψη',warnings:[]}]};
   };
   const input=(label,value)=>{const e=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new dom.window.Event('input',{bubbles:true}));e.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
   const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
   const oldOpen=window.open;let popup;
   window.open=()=>popup={document:{write(x){printed.push(x)},close(){}},focus(){},print(){printed.push('PRINT')}};
   try{
    await render(Pos,{...base,api});await tick();assert.match(text(),/Water/);
    await act(async()=>{const select=document.querySelector('[aria-label="Προμηθευτής πρότασης"]');select.value='sup';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));input('Πωλήσεις από','2026-11-01');input('Πωλήσεις έως','2026-11-20');input('Ημέρες κάλυψης','21');input('Ημέρες μέχρι παράδοση','0');});
    assert.doesNotMatch(text(),/Water/);assert.equal(button('Εκτύπωση').disabled,true);assert.match(text(),/Άλλαξαν τα κριτήρια/);
    await act(async()=>document.querySelector('form.pos-order-proposals-filters').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await tick();
    const proposal=calls.filter(x=>new URL(x.path,'https://isolated.invalid').pathname.endsWith('/proposal')).at(-1),query=new URL(proposal.path,'https://isolated.invalid').searchParams;
    for(const [key,value] of Object.entries({supplierId:'sup',fromDate:'2026-11-01',toDate:'2026-11-20',coverageDays:'21',leadDays:'0'}))assert.equal(query.get(key),value);
    await act(async()=>input('Αναζήτηση πρότασης','WATER'));assert.match(text(),/Water/);assert.doesNotMatch(text(),/Milk/);
    await act(async()=>button('Εκτύπωση').click());assert.equal(popup.opener,null);assert.equal(printed.at(-1),'PRINT');assert.match(printed[0],/Water &lt;b&gt;500ml&lt;\/b&gt;/);assert.ok(!printed[0].includes('MILK'));assert.match(printed[0],/2026-11-01/);assert.match(printed[0],/21/);assert.match(printed[0],/19/);
    await act(async()=>button('Αποστολή με email').click());assert.equal(document.querySelector('[aria-label="Email παραληπτών πρότασης"]').value,'supplier@example.invalid');
    await act(async()=>input('Email παραληπτών πρότασης','one@example.invalid, TWO@example.invalid'));
    await act(async()=>{const form=document.querySelector('form.pos-order-proposals-email');form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});
    const emails=calls.filter(x=>x.method==='POST');assert.equal(emails.length,1);const body=JSON.parse(emails[0].body);assert.equal(body.recipients,'one@example.invalid, two@example.invalid');assert.equal(body.search,'WATER');assert.ok(body.reportId);
    await act(async()=>completeMail());assert.match(text(),/διακομιστής email δέχτηκε/);assert.equal(button('Αποστολή πρότασης').disabled,true);
    await clear();
   }finally{window.open=oldOpen}
  });
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
