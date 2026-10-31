import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {editNumericKeyboardDraft,numericKeyboardValue} from '../../client/src/utils/numeric-keyboard-draft.js';

const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/installTouchKeyboard.js',import.meta.url))],bundle:true,write:false,format:'iife',globalName:'Keyboard'});
async function environment(run){
 const dom=new JSDOM('<input id="amount" type="number" step="0.01" value="12"><input id="other" type="number" value="7"><input id="barcode" value="0012"><input id="pin" type="password" value="0012">',{url:'https://isolated.invalid',runScripts:'outside-only'}),w=dom.window;
 // Layout scheduling is irrelevant to key dispatch; no detached-window rAFs.
 w.requestAnimationFrame=()=>0;w.eval(compiled.outputFiles[0].text);w.Keyboard.installTouchKeyboard();
 const input=w.document.querySelector('#amount'),events=[];
 input.addEventListener('input',()=>{events.push(input.value);input.value=String(Number(input.value)||0)});
 const pointer=el=>el.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));
 const open=el=>{el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch{}pointer(el);pointer(w.document.querySelector('.mws-touch-field-trigger'))};
 const key=k=>{const b=[...w.document.querySelectorAll('#mws-touch-keyboard button[data-key]')].find(b=>b.dataset.key===k);assert.ok(b,`actual installed keyboard key ${k}`);pointer(b)};
 const draft=()=>w.document.querySelector('[data-numeric-draft]')?.textContent;
 try{await run({w,input,events,open,key,draft})}finally{w.close()}
}
test('actual shared numeric keyboard keeps comma pending without clearing or zeroing a controlled amount',async()=>environment(({input,events,open,key,draft})=>{
 open(input);key(',');assert.equal(input.value,'12');assert.equal(draft(),'12,');assert.ok(!events.includes(''));
 key('5');assert.equal(input.value,'12.5');assert.equal(draft(),'12,5');assert.equal(input.validity.badInput,false);
 key('0');assert.equal(input.value,'12.5');assert.equal(draft(),'12,50');key(',');key('0');assert.equal(input.value,'12.5');assert.equal(draft(),'12,500');
}));
test('numeric draft retains small cents, trailing zeros and deletion through the decimal separator',async()=>environment(({input,open,key,draft})=>{
 open(input);key('CLEAR');for(const k of ['0',',','0','5'])key(k);assert.equal(input.value,'0.05');assert.equal(draft(),'0,05');
 key('BACK');assert.equal(input.value,'0');assert.equal(draft(),'0,0');key('BACK');assert.equal(draft(),'0,');assert.equal(input.value,'0');key('BACK');assert.equal(draft(),'0');
 key('CLEAR');for(const k of ['1',',','2','0'])key(k);assert.equal(input.value,'1.2');assert.equal(draft(),'1,20');
 key('MINUS');assert.equal(input.value,'-1.2');assert.equal(draft(),'-1,20');key('MINUS');assert.equal(input.value,'1.2');
}));
test('numeric draft belongs to one editable field and never bypasses readonly or disabled state',async()=>environment(({w,input,open,key,draft})=>{
 open(input);key(',');const other=w.document.querySelector('#other');open(other);key('5');assert.equal(other.value,'75');assert.equal(draft(),'75');assert.equal(input.value,'12');
 key('CLOSE');open(input);key('5');assert.equal(input.value,'125');input.readOnly=true;key('9');assert.equal(input.value,'125');assert.equal(w.document.querySelector('#mws-touch-keyboard').hidden,true);
 input.readOnly=false;open(input);input.disabled=true;key('9');assert.equal(input.value,'125');
}));
test('ordinary text, leading-zero barcodes, password typing and explicit Enter keep their original behavior',async()=>environment(({w,open,key})=>{
 const barcode=w.document.querySelector('#barcode');open(barcode);key(',');key('5');assert.equal(barcode.value,'0012,5');key('BACK');assert.equal(barcode.value,'0012,');barcode.setSelectionRange(0,barcode.value.length);key('5');assert.equal(barcode.value,'5');
 const pin=w.document.querySelector('#pin');open(pin);key('3');assert.equal(pin.value,'00123');let enters=0;pin.addEventListener('keydown',e=>{if(e.key==='Enter')enters++});key('ENTER');assert.equal(enters,1);assert.equal(w.document.querySelector('#mws-touch-keyboard').hidden,true);
}));

test('comma and dot represent one separator without assigning incomplete or nonfinite HTML numbers',()=>{
 for(const separator of [',','.']){
  let draft='';for(const key of ['MINUS',separator,'0','5'])draft=editNumericKeyboardDraft(draft,key);
  assert.equal(draft,'-0.05');assert.equal(numericKeyboardValue(draft),'-0.05');
  assert.equal(editNumericKeyboardDraft(draft,separator),draft);
 }
 assert.equal(numericKeyboardValue('-'),null);assert.equal(numericKeyboardValue('12.'),'12');assert.equal(numericKeyboardValue('9'.repeat(400)),null);
 assert.equal(editNumericKeyboardDraft('9'.repeat(308),'9'),'9'.repeat(308));
});

test('a pending sign cannot submit a different numeric value through Enter',async()=>environment(({w,input,open,key})=>{
 open(input);key('CLEAR');key('MINUS');let enters=0;input.addEventListener('keydown',e=>{if(e.key==='Enter')enters++});
 assert.equal(w.document.querySelector('[data-key="ENTER"]').disabled,true);key('ENTER');assert.equal(enters,0);key('5');assert.equal(input.value,'-5');assert.equal(w.document.querySelector('[data-key="ENTER"]').disabled,false);
}));

test('real mounted React numeric state keeps 0.05 and 1.20 while the keyboard retains pending digits',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid',runScripts:'outside-only'}),w=dom.window,keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:w[k]});
 w.requestAnimationFrame=()=>0;w.eval(compiled.outputFiles[0].text);w.Keyboard.installTouchKeyboard();
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(w.document.querySelector('#root'));let submits=0;
 function Form(){const [amount,setAmount]=React.useState(12);return React.createElement('form',{onSubmit:e=>{e.preventDefault();submits++}},React.createElement('input',{type:'number',step:'.01',value:amount,onChange:e=>setAmount(Number(e.target.value)||0)}),React.createElement('output',{id:'model'},String(amount)))}
 const pointer=el=>el.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));
 const key=async k=>React.act(async()=>pointer([...w.document.querySelectorAll('button[data-key]')].find(b=>b.dataset.key===k)));
 try{
  await React.act(async()=>root.render(React.createElement(Form)));const input=w.document.querySelector('input');
  await React.act(async()=>{input.focus();pointer(input);pointer(w.document.querySelector('.mws-touch-field-trigger'))});
  await key(',');assert.equal(input.value,'12');assert.equal(w.document.querySelector('#model').textContent,'12');await key('5');assert.equal(w.document.querySelector('#model').textContent,'12.5');
  await key('CLEAR');for(const k of ['0',',','0','5'])await key(k);assert.equal(w.document.querySelector('#model').textContent,'0.05');
  await key('CLEAR');for(const k of ['1',',','2','0'])await key(k);assert.equal(w.document.querySelector('#model').textContent,'1.2');assert.equal(w.document.querySelector('[data-numeric-draft]').textContent,'1,20');assert.equal(submits,0);
 }finally{await React.act(async()=>root.unmount());w.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});

test('existing actual POS mixed-payment inline pad retains comma cents without issuing payment',async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosStandardModals.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}}),m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),w=dom.window,keys=['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:w[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(w.document.querySelector('#root'));let writes=0,checkouts=0;
 const press=async text=>React.act(async()=>[...w.document.querySelectorAll('.pos-inline-keypad button')].find(b=>b.textContent===text).click());
 try{
  await React.act(async()=>root.render(React.createElement(m.exports.default,{active:'MIXED',onClose:()=>{},api:async()=>{writes++;return {}},store:{id:'synthetic'},cart:[],total:10,onCheckout:()=>checkouts++,setError:()=>{}})));
  await press('ΚΑΘΑΡΙΣΜΟΣ');for(const k of ['0',',','0','5'])await press(k);assert.equal(w.document.querySelector('.pos-mixed-payment input').value,'0,05');assert.match(w.document.querySelector('.pos-mixed-payment').textContent,/9,95/);
  await press('ΚΑΘΑΡΙΣΜΟΣ');for(const k of ['1',',','2','0'])await press(k);assert.equal(w.document.querySelector('.pos-mixed-payment input').value,'1,20');assert.match(w.document.querySelector('.pos-mixed-payment').textContent,/8,80/);assert.equal(writes,0);assert.equal(checkouts,0);
 }finally{await React.act(async()=>root.unmount());w.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
