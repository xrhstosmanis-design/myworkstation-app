import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted close form requires deliberate EFTPOS including zero before either submit',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreShiftClosePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),m={exports:{}};
 new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const root=createRoot(document.getElementById('root')),writes=[];
 const api=async(path,opts={})=>{if(opts.method){writes.push(JSON.parse(opts.body));throw Error('Ξαναμετρήσεις: έλλειμμα')}if(path.endsWith('/access'))return {shiftClosePolicy:{}};if(path.includes('/transactions/'))return {summary:{}};return {openSession:{id:'shift',openingSafe:0},suggestedOpening:{safe:0}}};
 const input=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,{api,store:{id:'s'}}));await new Promise(r=>setTimeout(r,20))});
  await act(async()=>{document.querySelector('input[type="checkbox"]').click()});
  const eft=document.querySelector('input[required]'),card=document.querySelector('[name="shift-work-card"]'),submit=document.querySelector('.cash-submit'),form=document.querySelector('form');
  await input(card,'FIXTURE-CARD');assert.equal(eft.value,'');assert.equal(submit.disabled,true);
  await act(async()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))});assert.equal(writes.length,0);assert.match(document.body.textContent,/Συμπλήρωσε υποχρεωτικά/);
  await input(eft,'abc');assert.equal(submit.disabled,true);
  await input(eft,'0');assert.equal(submit.disabled,false);
  await act(async()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10))});assert.equal(writes.length,1);assert.equal(writes[0].eftposTotal,0);
  const shortage=document.querySelector('.close-shortage');assert.equal(shortage.disabled,true);await input(card,'FIXTURE-CARD');assert.equal(shortage.disabled,false);
  await act(async()=>{shortage.click();await new Promise(r=>setTimeout(r,10))});assert.equal(writes.length,2);assert.equal(writes[1].eftposTotal,0);assert.equal(writes[1].forceCloseWithShortage,true);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
