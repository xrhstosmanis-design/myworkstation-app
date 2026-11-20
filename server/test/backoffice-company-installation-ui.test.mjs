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
}const packet={profile:'CURRENT_CAPTURE',sourceRevision:'a'.repeat(40),oldPlanHash:'b'.repeat(64),targetPlanHash:'c'.repeat(64),targetRuntimeProfile:'BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1',productionActivated:false,installed:false};
const button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t);
async function select(m){await m.act(async()=>{const e=document.querySelector('select');Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(e,'CURRENT_CAPTURE');e.dispatchEvent(new Event('change',{bubbles:true}))})}
async function inspect(m){await m.act(async()=>button('Έλεγχος εταιρικής εγκατάστασης').click())}
test('existing Company preparation offers Current profile and checks one global revision-bound endpoint without granting rights',async()=>{
 const C=await component('platform/CompanyAuthorityInstallationManager'),calls=[],m=await mount(C,{request:async(path,o)=>{calls.push([path,o]);return path.includes('/describe?')?packet:{packet,eligible:true,pairedWorker:true,installationEnabled:false}}});
 try{assert.equal(calls.length,0);await select(m);await inspect(m);assert.equal(calls.length,2);assert.equal(calls[0][0],'/api/platform/backoffice-company-installation/describe?profile=CURRENT_CAPTURE');assert.deepEqual(JSON.parse(calls[1][1].body),{profile:'CURRENT_CAPTURE'});assert.match(document.body.textContent,/παραμένει απενεργοποιημένη/);assert.equal(button('Εγκατάσταση εταιρικής προετοιμασίας').disabled,true);assert.equal(document.querySelectorAll('[type=checkbox]').length,1)}finally{await m.close()}
});
test('unpaired or mismatched inspection cannot expose install controls',async()=>{
 const C=await component('platform/CompanyAuthorityInstallationManager');for(const bad of [{...packet,sourceRevision:'d'.repeat(40)},{...packet,profile:'CAPTURE'}]){const m=await mount(C,{request:async path=>path.includes('/describe?')?packet:{packet:bad,eligible:true,pairedWorker:true,installationEnabled:true}});try{await select(m);await inspect(m);assert.ok(document.querySelector('[role=alert]'));assert.equal(document.querySelector('[type=file]'),null)}finally{await m.close()}}
});
test('API identity changes discard an older inspection response',async()=>{
 const C=await component('platform/CompanyAuthorityInstallationManager');let resolve;const old=async path=>path.includes('/describe?')?packet:new Promise(r=>{resolve=r}),m=await mount(C,{request:old});
 try{await select(m);await inspect(m);assert.equal(typeof resolve,'function');await m.render({request:async()=>{throw Error('unexpected')}});await m.act(async()=>resolve({packet,eligible:true,pairedWorker:true,installationEnabled:true}));assert.equal(document.querySelector('[type=file]'),null);assert.equal(document.querySelector('[role=alert]'),null)}finally{await m.close()}
});
test('installation requires receipt plus explicit checkbox, submits original inspected packet once and clears proof after completion',async()=>{
 const C=await component('platform/CompanyAuthorityInstallationManager'),calls=[],receipt={requestEnvelope:{requestJson:'signed-request',mac:'a'.repeat(64)},proofEnvelope:{proofJson:'signed-proof',mac:'b'.repeat(64)}},m=await mount(C,{request:async(path,o)=>{calls.push([path,o]);if(path.endsWith('/install'))return {...packet,installed:true};return path.includes('/describe?')?packet:{packet,eligible:true,pairedWorker:true,installationEnabled:true}}});
 try{await select(m);await inspect(m);const b=button('Εγκατάσταση εταιρικής προετοιμασίας');assert.equal(b.disabled,true);await m.act(async()=>{const f=document.querySelector('[type=file]');Object.defineProperty(f,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(receipt)}]});f.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(b.disabled,true);await m.act(async()=>document.querySelector('[type=checkbox]').click());assert.equal(b.disabled,false);await m.act(async()=>{b.click();b.click()});assert.equal(calls.filter(([p])=>p.endsWith('/install')).length,1);assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{profile:'CURRENT_CAPTURE',packet,...receipt,explicitAuthorization:true});assert.equal(document.querySelector('[type=file]'),null);assert.match(document.querySelector('[role=status]').textContent,/Επιβεβαιώθηκε/)}finally{await m.close()}
});
