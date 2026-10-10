import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('mounted count UI replaces pencil corrections and preserves additive scanner selection, version and origin',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryFastCount.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const root=createRoot(document.getElementById('root')),writes=[];
  let current={id:'take',status:'DRAFT',lines:[{id:'line',name:'Virtual product',sku:'VIRTUAL',barcode:'12345',expectedQuantity:5,countedQuantity:4,countVersion:1,salePrice:1.2,unitCost:0}]};
  const render=()=>root.render(React.createElement(module.exports.default,{current,api:async(path,options)=>{const b=JSON.parse(options.body);writes.push({path,...b});assert.equal(b.expectedVersion,current.lines[0].countVersion);current={...current,lines:[{...current.lines[0],countedQuantity:b.quantity,countVersion:b.expectedVersion+1}]};return {ok:true}},reload:async()=>render(),setError:e=>{if(e)throw Error(e)}}));
  const click=async(selector)=>act(async()=>document.querySelector(selector).click());
  const type=async(selector,value)=>act(async()=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
  const save=()=>click('.inv2-quantity-row button');
  try{
    await act(async()=>render());
    await click('button[title="Διόρθωση"]');assert.equal(document.querySelector('input[type="number"]').value,'4');assert.match(document.body.textContent,/Αντικατάσταση καταμέτρησης 4 με 4/);
    await type('input[type="number"]','4');await save();assert.equal(current.lines[0].countedQuantity,4);assert.equal(writes[0].quantity,4);assert.equal(writes[0].source,'BACKOFFICE');assert.equal(writes[0].expectedVersion,1);
    await type('.inv2-scan-row input','12345');await act(async()=>document.querySelector('.inv2-fast-entry form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(document.querySelector('input[type="number"]').value,'1');await type('input[type="number"]','2');assert.match(document.body.textContent,/Προηγούμενα 4 \+ νέα 2 = σύνολο 6/);await save();assert.equal(writes[1].quantity,6);assert.equal(writes[1].source,'SCANNER');assert.equal(writes[1].expectedVersion,2);
    current={...current,lines:[{...current.lines[0],countedQuantity:8,countVersion:3}]};await act(async()=>render());
    await click('button[title="Διόρθωση"]');assert.equal(document.querySelector('input[type="number"]').value,'8');await type('input[type="number"]','4');assert.match(document.body.textContent,/Αντικατάσταση καταμέτρησης 8 με 4/);await save();assert.equal(writes[2].quantity,4);assert.equal(writes[2].source,'BACKOFFICE');assert.equal(writes[2].expectedVersion,3);
    await click('button[title="Διόρθωση"]');await type('input[type="number"]','0');await save();assert.equal(writes[3].quantity,0);assert.equal(writes[3].expectedVersion,4);assert.equal(current.lines[0].countedQuantity,0);
    for(const w of writes){assert.equal(w.path,'/api/inventory-v2/stocktakes/take/count');assert.equal(w.lineId,'line');assert.match(w.clientEventId,/^[a-f0-9-]{36}$/)}
    assert.equal(new Set(writes.map(w=>w.clientEventId)).size,4);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
