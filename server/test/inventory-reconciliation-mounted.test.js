import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual reconciliation panel rejects old store replies and never loads or exports automatically',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryReconciliationPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const calls=[],pending=[],api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>pending.push(resolve));};
  const root=createRoot(document.getElementById('root')),render=(id,storeId)=>act(async()=>root.render(React.createElement(module.exports.default,{api,stocktakeId:id,storeId})));
  const click=text=>act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent===text).click());
  const report=(id,storeId,name)=>({current:{id,storeId},previous:{id:'old'},candidates:[{id:'old',name:'Παλιά'}],fingerprint:'a'.repeat(64),explanation:name,costMethod:'Unknown cost',summary:{shortageQuantity:11,surplusQuantity:0,netQuantity:-11,shortageValue:null,surplusValue:null,netValue:null,uncomputedItems:0,missingCostItems:1},rows:[]});
  try {
    await render('a','A');assert.equal(calls.length,0);await click('Έλεγχος προηγούμενης απογραφής');assert.equal(calls.length,1);
    await render('b','B');await click('Έλεγχος προηγούμενης απογραφής');assert.equal(calls.length,2);
    await act(async()=>pending[0](report('a','A','STALE SECRET')));assert.doesNotMatch(document.body.textContent,/STALE SECRET/);
    await act(async()=>pending[1](report('b','B','CORRECT REPORT')));assert.match(document.body.textContent,/CORRECT REPORT/);assert.match(document.body.textContent,/Άγνωστο/);
    await render('c','C');assert.doesNotMatch(document.body.textContent,/CORRECT REPORT/);assert.equal(calls.length,2);
    await click('Έλεγχος προηγούμενης απογραφής');await act(async()=>pending[2](report('wrong','B','FOREIGN SECRET')));
    assert.doesNotMatch(document.body.textContent,/FOREIGN SECRET/);assert.match(document.body.textContent,/δεν αντιστοιχεί/);assert.ok(calls.every(x=>!x.options?.method));
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});
