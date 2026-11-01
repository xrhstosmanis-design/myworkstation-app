import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted wallet preview demonstrates exact allocation without requests and immediately invalidates edits or changed catalogue',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/AiOwnerWalletAdmin.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));let requests=0;
  const companies=[{id:'one',name:'Synthetic company',active:true,stores:[{id:'one-store',name:'Synthetic store',active:true}]},{id:'cmtpopbgk000prhb5qc60zxus',name:'LAB',active:true,stores:[{id:'lab',name:'LAB store',active:true}]}];
  const api=async()=>{requests++;throw new Error('Preview must not make a request')};
  const render=async catalogue=>act(async()=>root.render(React.createElement(mod.exports.default,{api,companies:catalogue,onClose(){}})));
  const set=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  const button=(section,text)=>[...section.querySelectorAll('button')].find(x=>x.textContent===text);
  const submit=async form=>act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  try{
    await render(companies);
    assert.equal(document.querySelector('select').value,'');
    const section=document.querySelector('[aria-label="Προεπισκόπηση κοινών εξόδων"]');
    await act(async()=>section.closest('details').open=true);
    assert.doesNotMatch(section.querySelector('select').textContent,/LAB store/);
    await act(async()=>button(section,'Ενδεικτικό παράδειγμα').click());
    await submit(section.querySelector('form'));
    let result=section.querySelector('[aria-label="Αποτέλεσμα επιμερισμού"]');assert.ok(result);assert.match(result.textContent,/150,00/);
    const rows=result.querySelectorAll('tbody tr');assert.equal(rows.length,3);assert.match(rows[0].textContent,/59,62/);assert.match(rows[1].textContent,/59,61/);assert.match(rows[2].textContent,/30,77/);assert.match(result.textContent,/Δεν έχει καταχωριστεί χρέωση/);
    await set(section.querySelector('input[inputmode="decimal"]'),'200');assert.equal(section.querySelector('[aria-label="Αποτέλεσμα επιμερισμού"]'),null);
    await submit(section.querySelector('form'));assert.match(section.textContent,/300,00/);
    await act(async()=>button(section,'Καθαρισμός παραδείγματος').click());
    const form=section.querySelector('form');assert.equal(form.querySelector('input[type=checkbox]').checked,false);assert.equal(form.querySelector('select').value,'');
    await set(form.querySelector('input[type=month]'),'2026-10');await set(form.querySelector('input[inputmode="decimal"]'),'1,00');await set(form.querySelector('input[minlength]'),'Synthetic EUR basis');await set(form.querySelector('select'),'one-store');await set(form.querySelector('input[type=number]'),'31');await act(async()=>form.querySelector('input[type=checkbox]').click());await submit(form);
    assert.match(section.querySelector('[aria-label="Αποτέλεσμα επιμερισμού"]').textContent,/Synthetic company/);
    await render([{...companies[0],stores:[{...companies[0].stores[0],active:false}]}]);
    assert.equal(section.querySelector('[aria-label="Αποτέλεσμα επιμερισμού"]'),null);assert.match(section.textContent,/Ο κατάλογος άλλαξε/);
    assert.equal(requests,0);assert.equal(document.querySelector('select').value,'');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of prior)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});
