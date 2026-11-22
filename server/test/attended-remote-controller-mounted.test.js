import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted controllers keep three stream identities, stop only the selected store and hide all screens on login change',async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AttendedRemoteController.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="a"></div><div id="b"></div><div id="c"></div>',{url:'https://isolated.invalid'});
 const keys=['window','document','navigator','HTMLElement','Event','localStorage','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,roots=['a','b','c'].map(id=>createRoot(document.getElementById(id)));
 const streams=new Map(),calls=[],encoder=new TextEncoder();localStorage.setItem('token','creator-session');
 const request=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/stream'))return new ReadableStream({start(controller){streams.set(path,controller);options.signal.addEventListener('abort',()=>{try{controller.close();}catch{}});}});return {stopped:true};};
 try{
  await act(async()=>{roots.forEach((root,i)=>root.render(React.createElement(module.exports.default,{id:String(i),request})));});
  assert.equal(streams.size,3);
  await act(async()=>{for(let i=0;i<3;i++)streams.get(`/api/remote-support/controller/${i}/stream`).enqueue(encoder.encode(`data: ${JSON.stringify({storeName:`Store ${i}`,terminalName:`POS ${i}`,frame:{at:Date.now(),jpeg:'/9j/YQ=='},files:[]})}\n\n`));});
  assert.deepEqual(calls.filter(x=>x.path.endsWith('/heartbeat')).map(x=>x.path).sort(),[0,1,2].map(i=>`/api/remote-support/controller/${i}/heartbeat`));
  for(let i=0;i<3;i++){const host=document.getElementById(['a','b','c'][i]);assert.equal(host.querySelector('img').alt,`Οθόνη Store ${i} POS ${i}`);assert.match(host.querySelector('h2').textContent,new RegExp(`Store ${i}`));}
  await act(async()=>document.getElementById('b').querySelector('button').click());
  assert.deepEqual(calls.filter(x=>x.path.endsWith('/stop')).map(x=>x.path),['/api/remote-support/controller/1/stop']);
  assert.ok(document.getElementById('a').querySelector('img'));assert.equal(document.getElementById('b').querySelector('img'),null);assert.ok(document.getElementById('c').querySelector('img'));
  await act(async()=>{localStorage.setItem('token','different-login');window.dispatchEvent(new window.StorageEvent('storage',{key:'token',newValue:'different-login'}));});
  assert.equal(document.querySelectorAll('img').length,0);
 }finally{await act(async()=>roots.forEach(root=>root.unmount()));dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
