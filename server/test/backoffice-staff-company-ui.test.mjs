import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function component(name){
 const r=await build({entryPoints:[new URL(`../../client/src/components/${name}.jsx`,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const mod={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.default;
}
async function mount(Component,props){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','MutationObserver','localStorage','sessionStorage','FormData','alert','confirm','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Component,props)));
 return {dom,act:React.act,async render(next){await React.act(async()=>root.render(React.createElement(Component,next)))},async close(){await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const all=['stores.read','suppliers.read','customers.read'];
const protocol={protocol:'MWS_BACKOFFICE_COMPANY_V1',capabilities:all};
const envelope=items=>({scope:'COMPANY',companyId:'a',items});
test('company-only account gets independent company navigation and exact company header without store prerequisites',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace'),calls=[];
 const api=async(path,options={})=>{calls.push(path);if(path.endsWith('/me'))return {userId:'u',companyId:'a',revision:2,stores:[],companyAuthority:protocol,companyCapabilities:all};assert.equal(options.method||'GET','GET');assert.deepEqual(options.headers,{'x-backoffice-company-id':'a'});return envelope([{id:'x',name:'<img src=x onerror=evil()>',active:true}])};
 const m=await mount(Workspace,{api,user:{id:'u',fullName:'U'},onLogout(){}});
 try{for(const label of ['Προβολή καταστημάτων εταιρείας','Προβολή προμηθευτών εταιρείας','Προβολή πελατών,']){await m.act(async()=>button('Εταιρεία: '+label).click());assert.ok(document.querySelector('[aria-label="Εταιρική προβολή"]'));assert.ok(document.body.textContent.includes('<img src=x'));assert.equal(document.querySelector('img'),null)}assert.deepEqual(calls,['/api/backoffice-staff/me','/api/owner-products/stores','/api/commerce/suppliers','/api/commerce/customers']);assert.ok(!button('Άνοιγμα καταστήματος'))}finally{await m.close()}
});
test('store grants and unsupported company advertisements confer no company navigation',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');
 for(const extra of [{companyCapabilities:all},{companyAuthority:{...protocol,protocol:'old'},companyCapabilities:all},{companyAuthority:protocol,companyCapabilities:[]}]){const m=await mount(Workspace,{api:async()=>({companyId:'a',stores:[{id:'s',name:'S',capabilities:all}],...extra}),user:{id:'u'},onLogout(){}});try{assert.ok(!button('Εταιρεία:'))}finally{await m.close()}}
});
test('company directory clears refresh, rejects mixed or foreign envelopes, and drops stale API responses',async()=>{
 const Panel=await component('backoffice/CompanyDirectoryView');let value=envelope([{id:'s',name:'Safe',active:true}]),late;
 const api=async()=>value;const props={api,companyId:'a',capability:'stores.read',authorityKey:'u:a:1'};const m=await mount(Panel,props);
 try{assert.match(document.body.textContent,/Safe/);for(const bad of [{...value,companyId:'b'},{...value,storeId:'s'},{...value,scope:'STORE'},envelope([{id:'s',name:'Bad',active:true,credentials:'secret'}])]){value=bad;await m.act(async()=>button('Ανανέωση εταιρικής').click());assert.ok(document.querySelector('[role="alert"]'));assert.ok(!document.body.textContent.includes('Safe'))}
 const oldApi=()=>new Promise(r=>{late=r});await m.render({...props,api:oldApi});await m.render({...props,api:async()=>envelope([{id:'new',name:'New',active:false}]),authorityKey:'u:a:2'});await m.act(async()=>late(envelope([{id:'old',name:'OLD',active:true}])));assert.match(document.body.textContent,/New/);assert.ok(!document.body.textContent.includes('OLD'));
 }finally{await m.close()}
});
test('Owner company fieldset is advertised independently and missing protocol preserves payload omission',async()=>{
 const Admin=await component('BackofficeStaffAdmin');
 for(const enabled of [false,true]){let submitted;const account={id:'u',username:'usr',fullName:'User',active:true,revision:1,grants:[],companyCapabilities:['suppliers.read']};const api=async(path,opts={})=>{if(opts.method){submitted=JSON.parse(opts.body);account.revision=2;account.companyCapabilities=submitted.companyCapabilities??account.companyCapabilities;return{id:'u',revision:2}}return{accounts:[account],stores:[],...(enabled?{companyAuthority:protocol}:{})}};const m=await mount(Admin,{api});try{await m.act(async()=>button('Δικαιώματα /').click());assert.equal(Boolean(document.querySelector('[aria-label^="Εταιρεία:"]')),enabled);await m.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(Object.hasOwn(submitted,'companyCapabilities'),enabled);if(enabled)assert.deepEqual(submitted.companyCapabilities,['suppliers.read']);assert.match(document.body.textContent,/Αποθηκεύτηκε και επαληθεύτηκε/)}finally{await m.close()}}
});
test('company authority loss on identity/API change immediately removes old company content and drops old /me',async()=>{
 const Workspace=await component('BackofficeStaffWorkspace');let late;
 const user={id:'u'};const identity={userId:'u',companyId:'a',revision:1,stores:[],companyAuthority:protocol,companyCapabilities:['stores.read']};const api=async path=>path.endsWith('/me')?identity:envelope([{id:'s',name:'Old company secret',active:true}]);const m=await mount(Workspace,{api,user,onLogout(){}});
 try{await m.act(async()=>button('Εταιρεία:').click());assert.match(document.body.textContent,/Old company secret/);const delayed=()=>new Promise(r=>{late=r});await m.render({api:delayed,user:{id:'v'},onLogout(){}});assert.ok(!document.body.textContent.includes('Old company secret'));assert.ok(!button('Εταιρεία:'));await m.render({api:async()=>({userId:'v',companyId:'a',revision:2,stores:[],companyAuthority:protocol,companyCapabilities:[]}),user:{id:'v'},onLogout(){}});await m.act(async()=>late(identity));assert.ok(!button('Εταιρεία:'));assert.ok(!document.body.textContent.includes('Old company secret'))}finally{await m.close()}
});
test('company readback mismatch never reports verified success and store presets do not select company rights',async()=>{
 const Admin=await component('BackofficeStaffAdmin');let body;const account={id:'u',fullName:'User',username:'usr',revision:1,active:true,grants:[],companyCapabilities:[]};const api=async(path,opts={})=>{if(opts.method){body=JSON.parse(opts.body);account.revision=2;return{id:'u',revision:2}}return{companyAuthority:protocol,accounts:[account],stores:[]}};const m=await mount(Admin,{api});try{await m.act(async()=>button('Δικαιώματα /').click());await m.act(async()=>document.querySelector('[aria-label^="Εταιρεία:"]').click());await m.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.deepEqual(body.grants,[]);assert.deepEqual(body.companyCapabilities,['stores.read']);assert.ok(!document.body.textContent.includes('Αποθηκεύτηκε και επαληθεύτηκε'));assert.match(document.querySelector('[role="alert"]').textContent,/Δεν επιβεβαιώθηκαν/)}finally{await m.close()}
});
