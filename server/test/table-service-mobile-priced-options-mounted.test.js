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
  const root=createRoot(document.getElementById('root'));
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
  try{await settle(()=>root.render(React.createElement(module.exports.default,{api,store:{id:'LAB',name:'LAB'},operator:{fullName:'Waiter'},onBack(){}})))}
  catch(error){dom.window.close();throw error}
  return {button,click,settle,addProduct,requests,confirmations,async close(){
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
    await view.click('Αποστολή γύρου');
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
