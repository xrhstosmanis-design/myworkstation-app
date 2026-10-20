import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('voice preview is explicit, survives parent refresh, pauses/closes on hidden and cleans listeners/source',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  let paused=0,loaded=0,oldClose=0,newClose=0;
  dom.window.HTMLMediaElement.prototype.pause=function(){paused++};dom.window.HTMLMediaElement.prototype.load=function(){loaded++};
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/ChatVoicePreview.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const root=createRoot(document.getElementById('root'));let unmounted=false;
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{url:'blob:isolated-voice',onClose:()=>oldClose++})));
    const audio=document.querySelector('audio');assert.ok(audio);assert.equal(audio.autoplay,false);assert.equal(audio.preload,'none');assert.equal(audio.controls,true);assert.match(audio.getAttribute('controlsList'),/nodownload/);assert.equal(document.querySelector('a[download]'),null);
    await act(async()=>root.render(React.createElement(module.exports.default,{url:'blob:isolated-voice',onClose:()=>newClose++})));
    assert.equal(paused,0,'ordinary parent refresh must not interrupt playback');
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    await act(async()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));assert.equal(oldClose,0);assert.equal(newClose,1);assert.equal(paused,1);
    await act(async()=>root.unmount());unmounted=true;assert.equal(audio.hasAttribute('src'),false);assert.equal(loaded,1);
    document.dispatchEvent(new dom.window.Event('visibilitychange'));assert.equal(newClose,1,'listener must be removed');
  }finally{
    if(!unmounted)await act(async()=>root.unmount());dom.window.close();
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
