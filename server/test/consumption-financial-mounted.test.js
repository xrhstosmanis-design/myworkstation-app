import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted Financial Reports contains independent operation buttons, monetary details and rejects late store results',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
  const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/cloud/StoreFinancialReports.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const root=createRoot(document.getElementById('root')),calls=[];
  let pending=false,release;
  const result=(id,name)=>({storeId:id,rows:[{id:'line',name,quantity:2,unit:'PIECE',createdAt:'2026-11-10T10:00Z',purchasePrice:1,purchaseTotal:2,salePrice:3,saleTotal:6,operatorName:'Recorded operator',note:'reason',source:'POS'}],totalPurchase:2,totalSale:6,missingPurchase:0,missingSale:0});
  const api=async(path,options)=>{
    calls.push({path,options});const id=new URL(path,'https://isolated.invalid').searchParams.get('storeId');
    if(pending&&id==='A')return new Promise(resolve=>{release=()=>resolve(result('A','STALE PRIVATE ROW'))});
    return result(id,'Current '+id);
  };
  const render=(id,allowedModes)=>act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id,name:id},allowedModes})));
  const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
  try{
    await render('A',['destructions']);
    assert.ok(button('Καταστροφές'));assert.equal(button('Ιδιοκατανάλωση'),undefined);
    assert.match(calls[0].path,/financial-reports\/destructions/);assert.match(document.body.textContent,/Τιμή αγοράς/);assert.match(document.body.textContent,/Αξία πώλησης/);
    assert.doesNotMatch(document.body.textContent,/Πωλήσεις μήνα/);
    pending=true;await render('A',['self-consumption']);assert.ok(release);
    assert.equal(button('Καταστροφές'),undefined);assert.ok(button('Ιδιοκατανάλωση'));
    await render('B',['self-consumption']);
    await act(async()=>release());
    assert.match(document.body.textContent,/Current B/);assert.doesNotMatch(document.body.textContent,/STALE PRIVATE ROW|Current A/);
    assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
    const before=calls.length;await render('B',[]);assert.equal(calls.length,before);assert.doesNotMatch(document.body.textContent,/Current B/);
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const [k,d]of old)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];
  }
});
