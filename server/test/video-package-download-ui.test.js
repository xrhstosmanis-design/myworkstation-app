import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
test('download component scopes authenticated GET, never submits settings, rejects errors and cancels stale downloads',async()=>{
 const dir=await mkdtemp(new URL('../../.video-package-test-',import.meta.url)),dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
 const names=['window','document','navigator','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];const previous=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[n]});
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let root;
 try{
  const bundle=await build({entryPoints:[new URL('../../client/src/components/video/VideoPackageDownload.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'}});const file=new URL(dir+'/panel.mjs','file://');await writeFile(file,bundle.outputFiles[0].text);const Panel=(await import(file)).default;
  let mode='ok',pending,submitted=0;const calls=[],downloads=[];
  const ok=()=>({ok:true,headers:new Headers({'content-type':'application/zip'}),blob:async()=>new Blob(['zip'])});
  globalThis.fetch=async(path,options)=>{calls.push({path,options});if(mode==='delay')return new Promise(r=>pending=r);if(mode==='error')return {ok:false,status:403,json:async()=>({error:'Δεν επιτρέπεται'})};if(mode==='html')return {ok:true,headers:new Headers({'content-type':'text/html'})};return ok()};
  URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)};localStorage.setItem('token','fixture-token');
  root=createRoot(document.getElementById('root'));const render=async url=>act(async()=>root.render(React.createElement('form',{onSubmit:e=>{e.preventDefault();submitted++}},React.createElement(Panel,{downloadUrl:url}))));const click=async()=>act(async()=>document.querySelector('button').click());
  await render('/api/video-admin/stores/A/packages/hikvision-precheck');assert.equal(document.querySelector('button').type,'button');await click();assert.equal(submitted,0);assert.equal(calls[0].path,'/api/video-admin/stores/A/packages/hikvision-precheck');assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-token');assert.deepEqual(downloads,['MyWorkStation_Hikvision_Precheck.zip']);
  mode='error';await click();assert.match(document.querySelector('[role=alert]').textContent,/Δεν επιτρέπεται/);assert.equal(document.querySelector('[role=status]'),null);
  mode='html';await click();assert.equal(downloads.length,1);assert.ok(document.querySelector('[role=alert]'));
  mode='delay';await click();const signal=calls.at(-1).options.signal;await render('/api/video-admin/stores/B/packages/hikvision-precheck');assert.equal(signal.aborted,true);await act(async()=>pending(ok()));assert.equal(downloads.length,1);assert.equal(document.querySelector('[role=status]'),null);
  mode='ok';await click();assert.match(calls.at(-1).path,/stores\/B\//);assert.equal(downloads.length,2);
  mode='delay';await click();const unmountSignal=calls.at(-1).options.signal;await act(async()=>root.unmount());root=null;assert.equal(unmountSignal.aborted,true);await act(async()=>pending(ok()));assert.equal(downloads.length,2);
 }finally{if(root)await act(async()=>root.unmount());URL.createObjectURL=create;URL.revokeObjectURL=revoke;dom.window.close();for(const [n,d]of previous){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}await rm(dir,{recursive:true,force:true})}
});
