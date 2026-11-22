import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted remote desktop focuses only selected window, captures Greek and special keys, releases queued keys on blur and stops on stale frame/logout',async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AttendedRemoteController.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="a"></div><div id="b"></div>',{url:'https://isolated.invalid',pretendToBeVisual:true});dom.window.document.hasFocus=()=>true;
 const keys=['window','document','navigator','HTMLElement','Event','localStorage','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,roots=['a','b'].map(id=>createRoot(document.getElementById(id)));
 const streams=new Map(),sent=[],encoder=new TextEncoder();localStorage.setItem('token','creator-session');let delay=null;
 const request=async(path,options={})=>{if(path.endsWith('/stream'))return new ReadableStream({start(controller){streams.set(path,controller);options.signal.addEventListener('abort',()=>{try{controller.close();}catch{}});}});if(path.endsWith('/input')){sent.push({id:path.split('/')[4],...JSON.parse(options.body)});if(delay)await delay;}return {};};
 const frame=async(i,at=Date.now())=>{await act(async()=>streams.get(`/api/remote-support/controller/${i}/stream`).enqueue(encoder.encode(`data: ${JSON.stringify({storeName:`Store${i}`,terminalName:`POS${i}`,frame:{at,jpeg:'/9j/YQ=='},files:[]})}\n\n`)));};
 const host=i=>document.getElementById(i?'b':'a'),capture=i=>host(i).querySelector('textarea');
 const key=(target,key,options={})=>target.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
 try{
  await act(async()=>roots.forEach((r,i)=>r.render(React.createElement(module.exports.default,{id:String(i),request}))));await frame(0);await frame(1);
  for(let i=0;i<2;i++)host(i).querySelector('img').getBoundingClientRect=()=>({left:0,top:0,width:1600,height:900});
  await act(async()=>host(0).querySelector('img').dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:800,clientY:450})));
  assert.equal(document.activeElement,capture(0));assert.deepEqual(sent,[{id:'0',type:'click',button:'left',x:.5,y:.5}]);
  await act(async()=>{key(capture(0),'ά');key(capture(0),'5');key(capture(0),'Enter');key(capture(0),'Backspace');key(capture(0),'Tab');});
  assert.deepEqual(sent.slice(1).map(x=>x.text||x.key),['ά5','Enter','Backspace','Tab']);assert.ok(sent.every(x=>x.id==='0'));
  const count=sent.length;await act(async()=>{key(document.body,'x');key(capture(0),'c',{ctrlKey:true});});assert.equal(sent.length,count);
  await act(async()=>{capture(0).dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));key(capture(0),'a',{isComposing:true});capture(0).dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'ώ'}));});assert.equal(sent.at(-1).text,'ώ');
  let release;delay=new Promise(r=>{release=r;});await act(async()=>key(capture(0),'a'));
  await act(async()=>{key(capture(0),'b');capture(1).focus();});release();delay=null;await act(async()=>{});assert.equal(sent.some(x=>x.text==='b'),false);
  await act(async()=>key(capture(1),'β'));assert.equal(sent.at(-1).id,'1');assert.equal(sent.at(-1).text,'β');
  await frame(1,Date.now()-6000);assert.equal(capture(1).disabled,true);const stale=sent.length;await act(async()=>key(capture(1),'z'));assert.equal(sent.length,stale);
  await act(async()=>{localStorage.setItem('token','different-session');window.dispatchEvent(new window.StorageEvent('storage',{key:'token'}));});assert.equal(document.querySelectorAll('img').length,0);
 }finally{await act(async()=>roots.forEach(r=>r.unmount()));dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
