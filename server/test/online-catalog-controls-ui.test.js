import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted 8753-product controls page, persist overrides and ignore a late previous-store response',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/OnlineStoreManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const products=Array.from({length:8753},(_,i)=>({id:`p${i}`,name:`Product ${i}`,sku:`SKU${i}`,categoryName:i<50?'Coffee':'Other',currentStock:0,storePrice:1,onlinePrice:1,visibilityOverride:null}));
 let setHost,current,error='',message='',delay=false,resolveSave,fail=false;const calls=[];
 const request=async(path,opts)=>{calls.push({path,opts});if(!opts)return{members:[]};if(fail)throw Error('Not saved');if(delay)return new Promise(r=>{resolveSave=r});const body=JSON.parse(opts.body);if(path.endsWith('/availability'))return{policy:body};return{product:{productId:'p0',visibilityOverride:body.mode==='AUTO'?null:body.mode==='SHOW',visible:body.mode==='SHOW'}}};
 const initial={company:{id:'one'},store:{id:'store',name:'Test'},settings:{enabled:false,autoStockCatalogEnabled:true,publicSlug:'test'},products};
 function Host(){const [manager,setManager]=React.useState(initial);setHost=setManager;current=manager;return React.createElement(m.exports.default,{manager,setManager,request,busy:'',setBusy(){},setError(v){error=v},setMessage(v){message=v},onClose(){}})}
 const root=createRoot(document.getElementById('root')),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),select=label=>document.querySelector(`select[aria-label="${label}"]`);
 const change=async(el,value)=>act(async()=>{el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}))});
 try{
  await act(async()=>root.render(React.createElement(Host)));
  assert.equal(document.querySelectorAll('select[aria-label^="Εμφάνιση online"]').length,50);
  assert.match(document.querySelector('nav').textContent,/Σελίδα 1 από 176/);
  await act(async()=>button('Επόμενη').click());assert.ok(select('Εμφάνιση online Product 50'));assert.equal(select('Εμφάνιση online Product 0'),null);
  await act(async()=>button('Προηγούμενη').click());
  fail=true;await change(select('Εμφάνιση online Product 0'),'HIDE');assert.equal(error,'Not saved');assert.equal(current.products[0].visibilityOverride,null);
  fail=false;await change(select('Εμφάνιση online Product 0'),'HIDE');assert.equal(current.products[0].visibilityOverride,false);
  await change(select('Εμφάνιση online Product 0'),'AUTO');assert.equal(current.products[0].visibilityOverride,null);
  await act(async()=>button('Κανόνας διαθεσιμότητας · Υφιστάμενος').click());
  await change(select('Διαθεσιμότητα Product 0'),'ALWAYS');await act(async()=>button('Αποθήκευση κανόνα').click());
  assert.equal(current.products[0].availabilityMode,'ALWAYS');assert.match(document.querySelector('[role="status"]').textContent,/Διαθέσιμα τώρα: 1/);
  await change(select('Κατηγορία προϊόντων'),'Other');assert.match(document.querySelector('nav').textContent,/8703 αποτελέσματα/);
  await change(select('Κατηγορία προϊόντων'),'ALL');
  delay=true;await change(select('Εμφάνιση online Product 0'),'HIDE');assert.ok(resolveSave);
  await act(async()=>setHost({...initial,company:{id:'two'},products:[{...products[0],name:'Control'}]}));const priorMessage=message;
  await act(async()=>setHost({...initial,products:[{...products[0],name:'Returned'}]}));
  await act(async()=>resolveSave({product:{productId:'p0',visibilityOverride:false,visible:false}}));
  assert.equal(current.company.id,'one');assert.equal(current.products[0].visibilityOverride,null);assert.equal(message,priorMessage);
  assert.ok(calls.filter(c=>c.opts).every(c=>c.path.startsWith('/api/platform/companies/one/stores/store/online-store/products/p0/')));
  assert.equal(calls.some(c=>c.path.endsWith('/products')),false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
