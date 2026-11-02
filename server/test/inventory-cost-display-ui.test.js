import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

async function mounted(component,run){
  const output=await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/inventory/${component}.jsx`,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
  try{await run({Component:module.exports.default,dom,React,root,act:React.act});}
  finally{await React.act(async()=>root.unmount());dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}
const lines=()=>[
  {id:'missing',name:'Unknown cost',sku:'UNKNOWN',barcode:'1',expectedQuantity:5,countedQuantity:4,countVersion:1,salePrice:1.2,unitCost:0},
  {id:'known',name:'Known cost',sku:'KNOWN',barcode:'2',expectedQuantity:2,countedQuantity:3,countVersion:1,salePrice:2,unitCost:'2.50'},
];

test('actual count table preserves quantities/retail, marks missing cost and masks all value fields for delegated users without writes',async()=>mounted('InventoryFastCount',async({Component,React,root,act})=>{
  const current={id:'take',status:'DRAFT',scopeType:'PARTIAL_PRODUCTS',lines:lines()},original=structuredClone(current),calls=[];
  const props={current,api:async(...args)=>{calls.push(args);throw Error('No request permitted for read-only rendering');},reload:async()=>{},setError:e=>{if(e)throw Error(e)}};
  await act(async()=>root.render(React.createElement(Component,props)));
  const costIndex=[...document.querySelectorAll('thead th')].findIndex(x=>x.textContent==='Αξία κόστους');
  const row=name=>[...document.querySelectorAll('tbody tr')].find(x=>x.textContent.includes(name));
  assert.match(row('Unknown cost').children[costIndex].textContent,/Άγνωστο/);
  assert.equal(row('Known cost').children[costIndex].textContent,'7.50 €');
  assert.match(document.querySelector('tfoot').textContent,/Άγνωστο/);
  assert.match(document.body.textContent,/Είδη χωρίς θετικό κόστος: 1/);
  assert.match(document.querySelector('tfoot').textContent,/10.80 €/);
  await act(async()=>row('Unknown cost').querySelector('button[title="Διόρθωση"]').click());
  assert.match(document.querySelector('.inv2-selected-product').textContent,/Αγορά Άγνωστο/);
  assert.deepEqual(current,original);assert.equal(calls.length,0);
  for(const cost of [null,-2,'']){
    const single={...current,status:'FINALIZED',lines:[{...current.lines[0],unitCost:cost}]};
    await act(async()=>root.render(React.createElement(Component,{...props,current:single})));
    assert.match(row('Unknown cost').children[costIndex].textContent,/Άγνωστο/);
    assert.match(document.querySelector('tfoot').textContent,/Άγνωστο/);
  }
  // Open a fresh table; the previous pencil selection deliberately retains its barcode filter.
  await act(async()=>root.render(React.createElement(Component,{...props,key:'known-only',current:{...current,status:'FINALIZED',lines:[current.lines[1]]}})));
  assert.equal(row('Known cost').children[costIndex].textContent,'7.50 €');
  assert.equal(document.querySelector('tfoot').children[0].children[costIndex].textContent,'7.50 €');
  assert.doesNotMatch(document.body.textContent,/Είδη χωρίς θετικό κόστος/);
  await act(async()=>root.render(React.createElement(Component,{...props,delegated:{canCount:false,canClear:false,canBulkZero:false,canSeeExpected:false,locked:false}})));
  assert.doesNotMatch(document.body.textContent,/Αξία κόστους|Αξία λιανικής|Είδη χωρίς θετικό κόστος|Αγορά|7.50 €/);
  assert.equal(calls.length,0);assert.deepEqual(current,original);
}));

test('actual legacy CSV and Full Audit handlers export missing cost as blank, retain positive cost and never mutate a stocktake',async()=>mounted('InventoryV2Center',async({Component,dom,React,root,act})=>{
  const stocktake={id:'take',storeId:'store',name:'Virtual take',status:'FINALIZED',scopeType:'PARTIAL_PRODUCTS',lines:lines(),events:[]},original=structuredClone(stocktake),calls=[],blobs=[],downloads=[];
  const report={summary:{lineCount:2,countedCount:2,totalDifference:0,totalCostValue:null,missingCostItems:1},lines:stocktake.lines.map(x=>({...x,unitCost:x.id==='missing'?null:2.5,difference:x.countedQuantity-x.expectedQuantity,differenceValue:x.id==='missing'?null:2.5,countedBy:'Tester',countSource:'BACKOFFICE',events:[]}))};
  const api=async(path,options)=>{calls.push({path,options});assert.ok(!options?.method||options.method==='GET');if(path.endsWith('/audit'))return report;if(path.endsWith('/stocktakes'))return[stocktake];if(path.includes('/zones'))return[];return stocktake;};
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL=blob=>{blobs.push(blob);return'blob:isolated-export';};URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
  const csv=async blob=>(await blob.text()).replace(/^\uFEFF/,'').split('\n').map(line=>line.split(';').map(x=>x.slice(1,-1).replaceAll('""','"')));
  try{
    await act(async()=>root.render(React.createElement(Component,{api,stores:[{id:'store',name:'Virtual store'}],catalog:[]})));
    await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Virtual take')).click());
    await act(async()=>button('Excel / CSV').click());
    const ordinary=await csv(blobs[0]);assert.equal(ordinary[1][6],'');assert.equal(ordinary[2][6],'2.5');assert.equal(ordinary[1][4],'4');assert.equal(ordinary[1][5],'-1');
    await act(async()=>button('Full Audit').click());
    const audited=await csv(blobs[1]);assert.equal(audited[1][7],'');assert.equal(audited[1][8],'');assert.equal(audited[2][7],'2.5');assert.equal(audited[2][8],'2.5');
    assert.equal(downloads.length,2);assert.deepEqual(stocktake,original);assert.ok(calls.every(x=>!x.options?.method||x.options.method==='GET'));
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.HTMLAnchorElement.prototype.click=oldClick;}
}));
