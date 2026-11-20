import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const compiled=await build({
  entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreMobileWaiter.jsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',
  external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'},
});

async function mountWaiter({fee=0,isSet=false,send}={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/store/LAB'});
  const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const confirmations=[],requests=[];
  dom.window.confirm=message=>{confirmations.push(message);return true};
  const tables={areas:[],tables:[{id:'T1',name:'LAB 1'}],orders:[]};
  const product={id:'P1',name:'LAB Coffee',sku:'COFFEE',salePrice:2,isSet};
  const groups=[{id:'milk',description:'Milk',required:true,minSelections:1,maxSelections:1,items:[
    {id:'plain',description:'Plain',price:0},
    {id:'almond',description:'Almond',price:.5},
    {id:'oat',description:'Oat',price:.3},
  ]}];
  const api=async(path,options)=>{
    if(path.endsWith('/table-service'))return tables;
    if(path.includes('/modifiers?'))return {groups,settings:{environmentalFee:fee}};
    if(!options)return {products:[product]};
    requests.push(JSON.parse(options.body));
    if(send)return send(requests.at(-1),requests.length);
    return {roundNumber:1,tableName:'LAB 1',addedTotal:5,preparationBatches:[{productionStation:'COFFEE'}]};
  };
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const module={exports:{}};
  new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  let root=createRoot(document.getElementById('root'));
  const settle=async callback=>act(async()=>{await callback()});
  const button=text=>[...document.querySelectorAll('button')].find(element=>element.textContent.includes(text));
  const click=async text=>{const element=button(text);assert.ok(element,`Missing button ${text}`);await settle(()=>element.click())};
  const addProduct=async()=>{
    await click('LAB 1');
    const input=document.querySelector('input[placeholder="Όνομα, SKU ή barcode"]');
    await settle(()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Coffee');
      input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    });
    await click('LAB Coffee');
  };
  const render=({storeId='LAB',operatorId='op',companyId='company'}={})=>root.render(React.createElement(module.exports.default,{api,store:{id:storeId,name:'LAB'},operator:{id:operatorId,fullName:'Waiter'},company:{id:companyId},onBack(){}}));
  const remount=async props=>{await settle(()=>root.unmount());root=createRoot(document.getElementById('root'));await settle(()=>render(props))};
  try{await settle(()=>render())}
  catch(error){dom.window.close();throw error}
  return {button,click,settle,addProduct,requests,confirmations,remount,renderScope:async props=>settle(()=>render(props)),dom,async close(){
    await act(async()=>root.unmount());dom.window.close();
    for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }};
}

test('mobile priced choice updates quantity totals and sends the catalogue price in the same table round',async()=>{
  const view=await mountWaiter();
  try{
    await view.addProduct();
    assert.equal(view.button('Αποστολή γύρου').disabled,true,'required selection must be completed');
    assert.equal(view.button('Almond').disabled,false);
    await view.click('Almond');
    await view.click('Oat');
    assert.equal(view.button('Almond').getAttribute('aria-pressed'),'false','max one selection');
    await view.click('Almond');
    await view.settle(()=>document.querySelector('[aria-label="Αύξηση LAB Coffee"]').click());
    const expected=Number(5).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
    assert.ok(document.querySelector('footer').textContent.includes(expected));
    await view.click('Αποστολή γύρου');
    assert.equal(view.requests.length,1);
    assert.deepEqual(view.requests[0].items[0].modifiers,[{id:'almond',description:'Almond',price:.5}]);
    assert.equal(view.requests[0].items[0].quantity,2);
    assert.ok(view.confirmations[0].includes(expected));
    assert.match(document.body.textContent,/Στάλθηκε ο γύρος 1/);
  }finally{await view.close()}
});

test('mobile keeps the same priced payload and request key after an ambiguous response',async()=>{
  const view=await mountWaiter({send:async(body,count)=>{
    if(count===1)throw new Error('Network response lost');
    return {roundNumber:1,tableName:'LAB 1',addedTotal:2.5};
  }});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    assert.match(document.querySelector('[role="alert"]').textContent,/Network response lost/);
    await view.click('Έλεγχος / επανάληψη ίδιου γύρου');
    assert.equal(view.requests.length,2);
    assert.deepEqual(view.requests[1],view.requests[0]);
    assert.match(view.requests[0].idempotencyKey,/^[0-9a-f-]{36}$/i);
  }finally{await view.close()}
});

test('server price mismatch remains visible with the priced mobile line retained',async()=>{
  const view=await mountWaiter({send:async()=>{throw Object.assign(new Error('Η τιμή επιλογής άλλαξε. Άνοιξε ξανά τις επιλογές παρασκευής.'),{status:409})}});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    assert.equal(view.requests.length,1);
    assert.match(document.querySelector('[role="alert"]').textContent,/Η τιμή επιλογής άλλαξε/);
    assert.equal(view.button('Almond').getAttribute('aria-pressed'),'true');
    assert.doesNotMatch(document.body.textContent,/Στάλθηκε ο γύρος/);
  }finally{await view.close()}
});

for(const fixture of [{fee:.1},{isSet:true}])test(`mobile retains POS handling for ${fixture.fee?'environmental fee':'SET'}`,async()=>{
  const view=await mountWaiter(fixture);
  try{
    await view.addProduct();await view.click('Almond');
    assert.equal(view.button('Αποστολή γύρου').disabled,true);
    assert.match(document.body.textContent,/εισφορά ή συνοδευτικά SET/);
    await view.click('Αποστολή γύρου');assert.equal(view.requests.length,0);
  }finally{await view.close()}
});


test('mobile recovers an unconfirmed priced round after a full remount and reconnect, without automatic send',async()=>{
  const committed=new Map();let rounds=0;
  const view=await mountWaiter({send:async(body,count)=>{
    if(!committed.has(body.idempotencyKey)){rounds++;committed.set(body.idempotencyKey,{roundNumber:rounds,tableName:'LAB 1',addedTotal:2.5})}
    if(count===1)throw new Error('Response lost after commit');
    return committed.get(body.idempotencyKey);
  }});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    const first=view.requests[0];assert.equal(rounds,1);
    await view.remount();
    assert.equal(view.requests.length,1,'mount must not resend');
    assert.match(document.body.textContent,/Μη επιβεβαιωμένη αποστολή · LAB 1/);
    assert.equal(view.button('Αποστολή γύρου'),undefined,'frozen attempt cannot be replaced by a new round');
    Object.defineProperty(view.dom.window.navigator,'onLine',{configurable:true,value:false});
    await view.settle(()=>view.dom.window.dispatchEvent(new view.dom.window.Event('offline')));
    assert.equal(view.button('Έλεγχος / επανάληψη ίδιου γύρου').disabled,true);
    Object.defineProperty(view.dom.window.navigator,'onLine',{configurable:true,value:true});
    await view.settle(()=>view.dom.window.dispatchEvent(new view.dom.window.Event('online')));
    assert.equal(view.requests.length,1,'reconnect must not resend');
    await view.click('Έλεγχος / επανάληψη ίδιου γύρου');
    assert.deepEqual(view.requests[1],first);assert.equal(rounds,1);
    assert.match(document.body.textContent,/Στάλθηκε ο γύρος 1/);
    await view.remount();
    assert.doesNotMatch(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
    assert.equal(view.requests.length,2);
  }finally{await view.close()}
});

test('mobile pending round is isolated by company, store and operator',async()=>{
  const view=await mountWaiter({send:async()=>{throw new Error('Unknown result')}});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    for(const props of [{companyId:'other-company'},{storeId:'other-store'},{operatorId:'other-operator'}]){
      await view.remount(props);assert.doesNotMatch(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
      assert.equal(view.requests.length,1);
    }
    await view.remount();assert.match(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
  }finally{await view.close()}
});

test('mobile refuses a new send when the recovery reference cannot be stored',async()=>{
  const view=await mountWaiter();
  try{
    await view.addProduct();await view.click('Almond');
    view.dom.window.Storage.prototype.setItem=()=>{throw new Error('Storage disabled')};
    await view.click('Αποστολή γύρου');
    assert.equal(view.requests.length,0);assert.match(document.querySelector('[role="alert"]').textContent,/Δεν στάλθηκε νέος γύρος/);
  }finally{await view.close()}
});


test('a later price refusal cannot discard an already ambiguous mobile attempt',async()=>{
  const view=await mountWaiter({send:async(body,count)=>{
    if(count===1)throw new Error('Unconfirmed result');
    throw Object.assign(new Error('Η τιμή επιλογής άλλαξε. Άνοιξε ξανά τις επιλογές παρασκευής.'),{status:409});
  }});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    await view.remount();await view.click('Έλεγχος / επανάληψη ίδιου γύρου');
    assert.match(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
    assert.deepEqual(view.requests[1],view.requests[0]);
    await view.remount();assert.match(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
  }finally{await view.close()}
});

for(const invalid of ['not-json',JSON.stringify({scope:'wrong',request:{idempotencyKey:'bad'},lines:[]})])test('invalid mobile recovery data blocks a new round instead of inventing a UUID',async()=>{
  const view=await mountWaiter();
  try{
    view.dom.window.sessionStorage.setItem('myworkstation:mobile-table-attempt:v1:'+JSON.stringify(['company','LAB','op']),invalid);
    await view.remount();assert.match(document.body.textContent,/πρόβλημα ανάκτησης αποστολής/);
    await view.click('LAB 1');assert.equal(view.button('Αποστολή γύρου'),undefined);
    assert.equal(view.requests.length,0);
  }finally{await view.close()}
});


test('late acknowledgement from a previous operator cannot replace the current recovery screen',async()=>{
  let resolve;
  const view=await mountWaiter({send:()=>new Promise(done=>{resolve=done})});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    assert.equal(view.requests.length,1);
    await view.renderScope({operatorId:'other-operator'});
    assert.doesNotMatch(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
    await view.settle(()=>resolve({roundNumber:99,tableName:'Previous operator table',addedTotal:2.5}));
    assert.doesNotMatch(document.body.textContent,/Previous operator table|Στάλθηκε ο γύρος 99/);
    assert.equal(view.requests.length,1);
  }finally{await view.close()}
});


test('mobile timeout does not tell the operator that the server performed no transaction',async()=>{
  const view=await mountWaiter({send:async()=>{throw new Error('Ο server καθυστέρησε πάνω από 30″. Δοκίμασε Ανανέωση — δεν εκτελέστηκε συναλλαγή.')}});
  try{
    await view.addProduct();await view.click('Almond');await view.click('Αποστολή γύρου');
    const alert=document.querySelector('[role="alert"]').textContent;
    assert.match(alert,/Η απάντηση της αποστολής δεν επιβεβαιώθηκε/);
    assert.doesNotMatch(alert,/δεν εκτελέστηκε συναλλαγή/);
    assert.match(document.body.textContent,/Μη επιβεβαιωμένη αποστολή/);
  }finally{await view.close()}
});
