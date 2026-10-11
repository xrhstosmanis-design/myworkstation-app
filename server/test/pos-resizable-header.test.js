import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('POS header resizing preserves controls, cart space and isolated preferences across pointer, touch, keyboard and denied storage',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosResizableHeader.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','localStorage','ResizeObserver','IS_REACT_ACT_ENVIRONMENT'];const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let measure;
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='ResizeObserver'?class{constructor(fn){measure=fn}observe(){}disconnect(){}}:dom.window[k]});
 let cartBudget=300;dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {height:this.classList.contains('standard-lines')?cartBudget-Number(document.querySelector('.pos-header-content')?.style.paddingBottom.replace('px','')||0):200}};
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
 const render=async(scope='["C","S"]')=>act(async()=>root.render(React.createElement('article',{className:'mws-standard-pos'},React.createElement(module.exports.default,{key:scope,scope},React.createElement('button',{className:'protected-launcher'},'Chat')),React.createElement('div',{className:'standard-lines'}))));
 const handle=()=>document.querySelector('[role=separator]'),height=()=>Number(handle().getAttribute('aria-valuenow'));
 const pointer=async(type,y,id=1,kind='mouse')=>act(async()=>{const e=new dom.window.Event(type,{bubbles:true});Object.assign(e,{clientY:y,pointerId:id,button:0,pointerType:kind});handle().dispatchEvent(e)});
 const key=async(key)=>act(async()=>handle().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true})));
 const remount=async()=>{await act(async()=>root.unmount());root=createRoot(document.getElementById('root'))};
 try{
  await render();assert.equal(height(),0);assert.equal(handle().getAttribute('aria-valuemax'),'120');
  await pointer('pointerdown',100);await pointer('pointermove',180);assert.equal(height(),80);assert.equal(localStorage.length,0,'drag does not persist every move');await pointer('pointerup',180);assert.equal(localStorage.getItem('myworkstation:pos-header-space:["C","S"]'),'80');
  await remount();await render();assert.equal(height(),80);await render('["C","OTHER"]');assert.equal(height(),0);await render();assert.equal(height(),80);
  await pointer('pointerdown',100,2,'touch');await pointer('pointermove',140,2,'touch');assert.equal(height(),120);await pointer('pointercancel',140,2,'touch');assert.equal(height(),80);assert.equal(localStorage.getItem('myworkstation:pos-header-space:["C","S"]'),'80');
  await key('End');assert.equal(height(),120);await key('ArrowUp');assert.equal(height(),112);await key('Home');assert.equal(height(),0);await key('ArrowDown');assert.equal(height(),8);
  cartBudget=116;await act(async()=>measure());await key('End');assert.equal(height(),20);await pointer('pointerdown',100);await pointer('pointermove',1000);assert.equal(height(),20);await pointer('pointerup',1000);assert.equal(document.querySelector('.standard-lines').getBoundingClientRect().height,96);
  cartBudget=100;await act(async()=>measure());assert.equal(height(),4,'viewport changes clamp saved expansion');assert.ok(document.querySelector('.protected-launcher'));
  await act(async()=>handle().dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true})));assert.equal(height(),0);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw Error('denied')},setItem(){throw Error('denied')}}});cartBudget=300;await remount();await render();await key('ArrowDown');assert.equal(height(),8);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
