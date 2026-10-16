import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('header collapse returns layout space without remounting unsaved controls or background media',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosCollapsibleHeader.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));let starts=0,stops=0;
 function PersistentControl(){React.useEffect(()=>{starts++;return()=>stops++},[]);return React.createElement('input',{defaultValue:'Unsaved fixture'})}
 const render=scope=>act(async()=>root.render(React.createElement(module.exports.default,{key:scope,summary:'Fixture store'},React.createElement(PersistentControl))));
 const toggle=()=>document.querySelector('.pos-header-expand-toggle'),body=()=>document.querySelector('.pos-header-expanded-content');
 try{
  await render('A');assert.equal(body().hidden,true);assert.equal(toggle().getAttribute('aria-expanded'),'false');assert.equal(toggle().getAttribute('aria-controls'),body().id);
  const input=document.querySelector('input');input.value='Retained edit';
  await act(async()=>toggle().click());assert.equal(body().hidden,false);assert.equal(toggle().getAttribute('aria-expanded'),'true');
  await act(async()=>toggle().click());assert.equal(body().hidden,true);assert.equal(document.querySelector('input'),input);assert.equal(input.value,'Retained edit');assert.equal(starts,1);assert.equal(stops,0);
  await act(async()=>toggle().click());await render('B');assert.equal(body().hidden,true,'new store returns to compact layout');assert.equal(starts,2);assert.equal(stops,1,'only store teardown stops the old scope');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
