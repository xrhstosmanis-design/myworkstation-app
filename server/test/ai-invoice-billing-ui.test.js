import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted SuperAdmin invoice switch saves only selected company and refuses stale responses or unavailable activation',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/AiOwnerWalletAdmin.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];
  const row=(company,enabled,invoiceEnabled,ready=true)=>({companyId:company,runtimeEnabled:true,enabled,emailEnabled:false,notificationOwnerId:'',version:5,availableMicros:'5000000',reservedMicros:'0',owners:[],usage:[],entries:[],notices:[],activationReadiness:{ready:true,model:'synthetic'},invoiceBilling:{enabled:invoiceEnabled,active:enabled&&invoiceEnabled,readiness:{ready,globalEnabled:ready,providerConfigured:true,tariffConfigured:true}},meteredFeatures:invoiceEnabled?['OWNER_ASSISTANT','INVOICE_OPENAI']:['OWNER_ASSISTANT']});
  const rows={a:row('a',true,true),b:row('b',false,false),unavailable:row('unavailable',true,false,false),disable:row('disable',true,true,false)};let late;
  const api=async(path,options={})=>{calls.push({path,...options});const id=path.split('/').at(-1);if(options.method==='PUT'){const input=JSON.parse(options.body);assert.equal(input.version,rows[id].version);rows[id]={...rows[id],...input,version:input.version+1,invoiceBilling:{...rows[id].invoiceBilling,enabled:input.invoiceEnabled,active:input.enabled&&input.invoiceEnabled}};return {version:input.version+1}}if(id==='slow')return new Promise(resolve=>late=resolve);return structuredClone(rows[id])};
  const companies=[...Object.keys(rows),'slow'].map(id=>({id,name:'Synthetic '+id,active:true}));
  const select=async id=>act(async()=>{const input=document.querySelector('select');input.value=id;input.dispatchEvent(new Event('change',{bubbles:true}))});
  const invoice=()=>document.querySelector('[aria-label="Χρέωση τιμολογίων εταιρείας"] input');
  const save=()=>act(async()=>invoice().closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{api,companies,onClose(){}})));assert.equal(calls.length,0);
    await select('a');assert.equal(invoice().checked,true);assert.match(document.body.textContent,/Η χρέωση τιμολογίων είναι ενεργή/);
    await act(async()=>invoice().click());await save();assert.equal(rows.a.invoiceBilling.enabled,false);assert.equal(rows.b.invoiceBilling.enabled,false);
    let write=calls.find(c=>c.method==='PUT');assert.equal(write.path,'/api/ai-wallet/platform/companies/a');assert.deepEqual(JSON.parse(write.body),{version:5,enabled:true,emailEnabled:false,notificationOwnerId:'',invoiceEnabled:false});
    await select('b');assert.equal(invoice().checked,false);await act(async()=>{invoice().click();[...document.querySelectorAll('input[type="checkbox"]')][0].click()});await save();assert.equal(rows.b.enabled,true);assert.equal(rows.b.invoiceBilling.enabled,true);assert.equal(rows.a.invoiceBilling.enabled,false);
    await select('slow');assert.equal(invoice(),null);const slow=calls.at(-1);await select('a');assert.equal(slow.signal.aborted,true);await act(async()=>late(row('slow',true,true)));assert.equal(invoice().checked,false);
    await select('unavailable');assert.equal(invoice().disabled,true);
    await select('disable');assert.equal(invoice().disabled,false);await act(async()=>invoice().click());await save();assert.equal(rows.disable.invoiceBilling.enabled,false);
    assert.equal(calls.filter(c=>c.method==='PUT').length,3);assert.ok(calls.every(c=>!c.path.includes('credits')&&!c.path.includes('grants')));
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
