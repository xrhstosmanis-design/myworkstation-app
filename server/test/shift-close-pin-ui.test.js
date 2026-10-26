import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function withCloseForm(run,{write=async()=>({variance:0})}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreShiftClosePanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),module={exports:{}};
 new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),writes=[],closed=[];
 const api=async(path,options={})=>{if(options.method){const body=JSON.parse(options.body);writes.push(body);return write(body,writes.length)}if(path.endsWith('/access'))return {shiftClosePolicy:{}};if(path.includes('/transactions/'))return {summary:{}};return {openSession:{id:'shift',openingSafe:0},suggestedOpening:{safe:0}}};
 const input=async(element,value)=>act(async()=>{assert.ok(element,'expected visible input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const choose=async method=>{const button=[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===method);assert.ok(button,`close form offers ${method}`);await act(async()=>button.click())};
 const submit=async()=>act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,15))});
 try{
  await act(async()=>{root.render(React.createElement(module.exports.default,{api,store:{id:'store'},onClosed:()=>closed.push(true)}));await new Promise(resolve=>setTimeout(resolve,15))});
  await act(async()=>document.querySelector('input[type="checkbox"]').click());
  await input(document.querySelector('input[required]'),'0');
  await run({dom,act,input,choose,submit,writes,closed});
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
}

test('personal PIN closes the actual mounted form without a card and never submits on method selection',async()=>{
 await withCloseForm(async({input,choose,submit,writes,closed})=>{
  assert.ok(document.querySelector('[name="shift-work-card"]'),'legacy card is the default');
  await choose('PIN');assert.equal(writes.length,0);
  const pin=document.querySelector('[name="shift-close-pin"]');assert.equal(pin.type,'password');
  await input(pin,'12');assert.equal(document.querySelector('.cash-submit').disabled,true);
  await input(pin,'2468');assert.equal(document.querySelector('.cash-submit').disabled,false);
  await submit();assert.equal(writes.length,1);assert.equal(writes[0].closeCredentialMethod,'PIN');assert.equal(writes[0].pin,'2468');assert.equal(Object.hasOwn(writes[0],'cardCode'),false);assert.equal(writes[0].eftposTotal,0);assert.equal(closed.length,1);
 });
});

test('failed PIN clears the immediate secret and switching back to the legacy card cannot reuse it',async()=>{
 await withCloseForm(async({input,choose,submit,writes,closed})=>{
  await choose('PIN');await input(document.querySelector('[name="shift-close-pin"]'),'2468');await submit();
  assert.equal(closed.length,0);assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');assert.equal(document.querySelector('.cash-submit').disabled,true);
  await input(document.querySelector('[name="shift-close-pin"]'),'1357');await choose('Κάρτα / QR');await input(document.querySelector('[name="shift-work-card"]'),'FIXTURE-CARD');await submit();
  assert.equal(writes.length,2);assert.equal(writes[1].closeCredentialMethod,'CARD');assert.equal(writes[1].cardCode,'FIXTURE-CARD');assert.equal(Object.hasOwn(writes[1],'pin'),false);
  await choose('PIN');assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');
 },{write:async()=>{throw Object.assign(new Error('Το προσωπικό PIN δεν είναι σωστό.'),{status:401,code:'SHIFT_CLOSE_PIN_INVALID'})}});
});

test('forced shortage close requires a fresh PIN and preserves deliberate current EFTPOS override',async()=>{
 await withCloseForm(async({act,input,choose,submit,writes,closed})=>{
  await choose('PIN');await input(document.querySelector('[name="shift-close-pin"]'),'2468');await submit();
  const forced=document.querySelector('.close-shortage');assert.ok(forced);assert.equal(forced.disabled,true);assert.equal(document.querySelector('[name="shift-close-pin"]').value,'');
  await input(document.querySelector('[name="shift-close-pin"]'),'1357');assert.equal(forced.disabled,false);
  await input(document.querySelector('input[required]'),'');assert.equal(forced.disabled,true);
  await input(document.querySelector('input[required]'),'7');assert.equal(forced.disabled,false);
  await act(async()=>{forced.click();await new Promise(resolve=>setTimeout(resolve,15))});
  assert.equal(writes.length,2);assert.equal(writes[1].forceCloseWithShortage,true);assert.equal(writes[1].eftposTotal,7);assert.equal(writes[1].pin,'1357');assert.equal(writes[1].closeCredentialMethod,'PIN');assert.equal(Object.hasOwn(writes[1],'cardCode'),false);assert.equal(closed.length,1);
 },{write:async(body,index)=>{if(index===1)throw Object.assign(new Error('Βρέθηκε έλλειμμα. Θέλεις να ξαναμετρήσεις;'),{code:'SHIFT_RECOUNT_REQUIRED'});return {variance:-1}}});
});
