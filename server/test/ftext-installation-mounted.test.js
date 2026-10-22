import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted ftext setup rejects stale store responses/downloads and accepts terminals loaded later',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/FtextInstallationSetup.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;
 const calls=[];let releaseGet,releaseDownload;const originalCreate=URL.createObjectURL;let downloads=0;URL.createObjectURL=()=>{downloads++;return 'blob:fixture'};
 const state=store=>({settings:{serialNumber:store+'-SERIAL',workFolder:'C:\\FText'},settingsCurrent:true,connectorAllowed:true,online:false,paired:false});
 const request=async(url,options={})=>{calls.push({url,options});if(url.endsWith('/package'))return new Promise(resolve=>releaseDownload=()=>resolve({script:'unused',fileName:'unused.cmd'}));if(url.includes('/stores/A/'))return new Promise(resolve=>releaseGet=()=>resolve(state('A')));return state('B')};
 const render=(store,terminals=[{terminalPos:'POS-01'}])=>act(async()=>root.render(React.createElement(module.exports.default,{company:{id:'company'},store:{id:store},terminals,request})));
 const click=label=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).click());
 try{
  await render('A');await render('B');await act(async()=>releaseGet());assert.equal(document.querySelector('input').value,'B-SERIAL');
  await click('Λήψη πακέτου ftext για αυτό το POS');assert.ok(document.querySelector('select').disabled);await render('C');await act(async()=>releaseDownload());assert.equal(downloads,0);assert.equal(document.querySelector('select').disabled,false);
  await render('D',[]);assert.equal(document.querySelector('select').value,'');const before=calls.length;await render('D',[{terminalPos:'POS-02'}]);assert.equal(document.querySelector('select').value,'POS-02');assert.ok(calls.slice(before).some(c=>c.url.endsWith('/POS-02')));
  assert.ok(calls.filter(c=>c.options.method==='POST').every(c=>c.url.endsWith('/package')));
 }finally{await act(async()=>root.unmount());URL.createObjectURL=originalCreate;dom.window.close();for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});
