import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosDialogFrame.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
test('dialog keyboard boundary preserves busy guards, minimization and topmost dialog ownership',async()=>{
 const dom=new JSDOM('<button id="background">Checkout</button><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.querySelector('#root'));let closes=0;const background=document.querySelector('#background');background.focus();
 const render=busy=>root.render(React.createElement(module.exports.default,{label:'Payment',className:'pos-standard-modal',style:{position:'fixed',zIndex:6100},closeDisabled:busy,onClose:()=>closes++},React.createElement('button',{id:'first'},'Close'),React.createElement('input',{id:'draft',defaultValue:'83.17'}),React.createElement('button',{id:'last'},'Submit')));
 const key=(name,shiftKey=false)=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:name,shiftKey,bubbles:true,cancelable:true}));
 try{
  await act(async()=>render(false));const panel=document.querySelector('[role=dialog]'),draft=document.querySelector('#draft');assert.equal(panel.getAttribute('aria-modal'),'true');assert.equal(document.activeElement.id,'first');
  document.querySelector('#last').focus();key('Tab');assert.equal(document.activeElement.id,'first');key('Tab',true);assert.equal(document.activeElement.id,'last');
  background.focus();assert.equal(panel.contains(document.activeElement),true);draft.focus();draft.value='92.11';
  await act(async()=>render(true));key('Escape');assert.equal(closes,0);assert.equal(draft.value,'92.11');
  await act(async()=>render(false));key('Escape');assert.equal(closes,1);
  await act(async()=>{panel.style.visibility='hidden';await Promise.resolve()});background.focus();key('Escape');assert.equal(closes,1);assert.equal(document.activeElement,background);
  await act(async()=>{panel.style.visibility='visible';await Promise.resolve()});assert.equal(document.activeElement,draft);assert.equal(draft.value,'92.11');
  const competing=document.createElement('div');competing.setAttribute('role','dialog');competing.style.cssText='position:fixed;z-index:7000';competing.innerHTML='<input id="competing">';document.body.appendChild(competing);competing.firstChild.focus();key('Escape');assert.equal(closes,1);assert.equal(document.activeElement,competing.firstChild);competing.remove();
  draft.focus();const nestedHost=document.createElement('div');document.body.appendChild(nestedHost);const nestedRoot=createRoot(nestedHost);let nestedCloses=0;
  await act(async()=>nestedRoot.render(React.createElement(module.exports.default,{label:'Nested',style:{position:'fixed',zIndex:7000},onClose:()=>nestedCloses++},React.createElement('button',{id:'nested-close'},'Nested close'))));
  key('Escape');assert.equal(nestedCloses,1);assert.equal(closes,1,'topmost Escape invokes one callback only');
  await act(async()=>nestedRoot.unmount());nestedHost.remove();assert.equal(document.activeElement,draft,'closing topmost dialog restores underlying field');
  await act(async()=>root.unmount());assert.equal(document.activeElement,background);
 }finally{if(document.querySelector('#root')?.hasChildNodes())await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
