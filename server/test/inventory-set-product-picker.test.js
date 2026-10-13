import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted SET search uses selected-store barcode queries, explicit IDs and rejects delayed old results',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventorySetProductPicker.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const root=createRoot(document.getElementById('root')),pending=[],changes=[];
  const api=(path,options)=>new Promise((resolve,reject)=>pending.push({path,options,resolve,reject}));
  function Host({storeId='A',parentId='parent'}){const [value,setValue]=React.useState('');return React.createElement(module.exports.default,{api,storeId,parentId,value,onChange:id=>{changes.push(id);setValue(id)}})}
  const render=async(storeId='A',parentId='parent')=>act(async()=>root.render(React.createElement(Host,{key:storeId+parentId,storeId,parentId})));
  const input=async value=>act(async()=>{const el=document.querySelector('input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
  const wait=()=>act(async()=>new Promise(r=>setTimeout(r,300)));
  try{
    await render();assert.equal(pending.length,0);await input('7');await wait();assert.equal(pending.length,0);
    await input('7622202814327');await wait();assert.equal(pending.length,1);
    let params=new URL(pending[0].path,'https://isolated.invalid').searchParams;assert.equal(params.get('storeId'),'A');assert.equal(params.get('status'),'ACTIVE');assert.equal(params.get('q'),'7622202814327');assert.equal(params.get('pageSize'),'25');
    await act(async()=>pending[0].resolve({items:[{productId:'parent',name:'Self'},{productId:'beyond5000',name:'SOUR PATCH',sku:'948',barcode:'7622202814327',salePrice:3.5}],pages:2}));
    assert.equal(document.body.textContent.includes('Self'),false);assert.match(document.body.textContent,/SOUR PATCH/);assert.equal(changes.length,0);
    await act(async()=>document.querySelector('.ia-set-search-results button').click());assert.deepEqual(changes,['beyond5000']);assert.match(document.querySelector('.ia-set-selected').textContent,/SOUR PATCH/);
    await act(async()=>document.querySelector('.ia-set-selected button').click());assert.equal(document.querySelector('input').value,'');assert.deepEqual(changes,['beyond5000','']);
    await input('old');await wait();const old=pending.at(-1);await input('fresh');await wait();const fresh=pending.at(-1);
    await act(async()=>fresh.resolve({items:[{productId:'fresh-id',name:'Fresh product'}],pages:2}));
    await act(async()=>old.resolve({items:[{productId:'old-id',name:'Stale product'}]}));assert.match(document.body.textContent,/Fresh product/);assert.doesNotMatch(document.body.textContent,/Stale product/);
    await act(async()=>[...document.querySelectorAll('.ia-set-search-pages button')].find(b=>b.textContent==='Επόμενα').click());await wait();params=new URL(pending.at(-1).path,'https://isolated.invalid').searchParams;assert.equal(params.get('page'),'2');
    const oldPage=pending.at(-1);await render('B','other-parent');await input('newstore');await wait();const other=pending.at(-1);params=new URL(other.path,'https://isolated.invalid').searchParams;assert.equal(params.get('storeId'),'B');
    await act(async()=>oldPage.resolve({items:[{productId:'wrong',name:'Wrong store'}]}));assert.doesNotMatch(document.body.textContent,/Wrong store/);
    await act(async()=>other.reject(new Error('Lookup failed')));assert.match(document.querySelector('[role=alert]').textContent,/Lookup failed/);
    assert.ok(pending.every(call=>!call.options?.method),'search never persists a relation');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});

test('SET-only larger geometry keeps footer and association table in viewport',()=>{
  const css=readFileSync(new URL('../../client/src/components/commerce/inventory-archive.css',import.meta.url),'utf8');
  const panel=readFileSync(new URL('../../client/src/components/commerce/InventoryArchivePanel.jsx',import.meta.url),'utf8');
  assert.match(panel,/editTab==="set"\?"set-editor":""/);assert.match(panel,/InventorySetProductPicker key=/);
  assert.match(css,/\.ia-modal\.set-editor\{width:min\(1480px,calc\(100vw - 32px\)\);height:min\(850px,calc\(100dvh - 32px\)\)/);
  assert.match(css,/\.ia-modal\.set-editor>\.ia-modal-actions\{flex-shrink:0/);
});
