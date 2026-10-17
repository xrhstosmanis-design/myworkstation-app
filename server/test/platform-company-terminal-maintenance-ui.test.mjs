import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
async function fixture(file){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent','FormData','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const result=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/'+file,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const root=createRoot(document.getElementById('root'));
 const render=props=>act(async()=>root.render(props?React.createElement(React.StrictMode,null,React.createElement(module.exports.default,{key:props.company?.id||props.terminal.id,...props})):null));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text),click=async text=>act(async()=>button(text).click());
 return {dom,act,render,button,click,change:async(name,value)=>act(async()=>{const el=document.querySelector(`[name="${name}"]`);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))}),close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('mounted company editor keeps same ID/current values, validates AFM, displays stale refusal and ignores completion after company change',async()=>{
 const f=await fixture('CompanyIdentityEditor.jsx');try{
  const pending=[],saved=[],company={id:'c',name:'Synthetic company',taxId:null},props={company,request:(path,options)=>{const p=deferred();pending.push({path,options,...p});return p.promise},onClose:()=>{},onSaved:c=>saved.push(c)};
  await f.render(props);assert.equal(document.querySelector('form').checkValidity(),false);await f.change('taxId','001234567');await f.act(async()=>document.querySelector('input[type="checkbox"]').click());assert.equal(document.querySelector('form').checkValidity(),true);
  await f.click('Αποθήκευση στοιχείων');assert.equal(pending[0].path,'/api/platform/companies/c/identity');assert.equal(pending[0].options.method,'PUT');assert.deepEqual(JSON.parse(pending[0].options.body),{name:company.name,taxId:'001234567',expectedName:company.name,expectedTaxId:''});assert.equal(f.button('Αποθήκευση…').disabled,true);
  await f.act(async()=>pending[0].reject(Error('Τα στοιχεία άλλαξαν.')));assert.equal(document.querySelector('[role="alert"]').textContent,'Τα στοιχεία άλλαξαν.');assert.equal(document.querySelector('[name="taxId"]').value,'001234567');assert.equal(saved.length,0);
  await f.click('Αποθήκευση στοιχείων');await f.act(async()=>pending[1].resolve({company:{...company,taxId:'001234567'}}));assert.equal(saved.length,1,'current StrictMode save must complete');
  await f.click('Αποθήκευση στοιχείων');await f.render({...props,company:{id:'other',name:'Other company',taxId:'987654321'}});await f.act(async()=>pending[2].resolve({company}));assert.equal(saved.length,1);assert.equal(document.querySelector('[name="name"]').value,'Other company');assert.equal(document.querySelector('[name="taxId"]').readOnly,true);assert.equal(document.querySelector('input[type="checkbox"]'),null);
 }finally{await f.close()}
});
test('mounted terminal deletion requires confirmation, protects active row, retains shift refusal, sends one scoped request and ignores late completion after close',async()=>{
 const f=await fixture('TerminalDeleteButton.jsx');try{
  const pending=[],deleted=[],terminal={id:'t',terminalPos:'SYNTHETIC-POS',displayName:'Synthetic PC',active:true},props={companyId:'c',storeId:'s',terminal,request:(path,options)=>{const p=deferred();pending.push({path,options,...p});return p.promise},onDeleted:t=>deleted.push(t.id)};
  await f.render(props);assert.equal(f.button('Διαγραφή').disabled,true);await f.click('Διαγραφή');assert.equal(document.querySelector('[role="alertdialog"]'),null);
  await f.render({...props,terminal:{...terminal,active:false}});await f.click('Διαγραφή');assert.equal(document.activeElement.textContent,'Ακύρωση');assert.match(document.querySelector('[role="alertdialog"]').textContent,/Οι βάρδιες, οι συναλλαγές και το ιστορικό παραμένουν/);await f.click('Ακύρωση');assert.equal(pending.length,0);assert.equal(document.activeElement.textContent,'Διαγραφή');
  await f.click('Διαγραφή');await f.act(async()=>document.querySelector('[role="alertdialog"]').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role="alertdialog"]'),null);assert.equal(pending.length,0);
  await f.click('Διαγραφή');await f.click('Επιβεβαίωση διαγραφής');assert.equal(pending[0].path,'/api/platform/companies/c/stores/s/installation-terminals/t');assert.deepEqual(pending[0].options,{method:'DELETE'});assert.equal(f.button('Διαγραφή…').disabled,true);
  await f.act(async()=>pending[0].reject(Error('Ανοιχτή βάρδια.')));assert.equal(document.querySelector('[role="alert"]').textContent,'Ανοιχτή βάρδια.');assert.equal(deleted.length,0);
  await f.click('Επιβεβαίωση διαγραφής');await f.act(async()=>pending[1].resolve({ok:true}));assert.deepEqual(deleted,['t']);assert.equal(document.querySelector('[role="alertdialog"]'),null);
  await f.click('Διαγραφή');await f.click('Επιβεβαίωση διαγραφής');await f.render(null);await f.act(async()=>pending[2].resolve({ok:true}));assert.deepEqual(deleted,['t']);
 }finally{await f.close()}
});
