import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted POS: invitation never auto-accepts; exact one-click consent, local bridge, STOP and stale store response',async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosRemoteSupport.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT','fetch'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys.filter(k=>k!=='fetch'))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));const calls=[],local=[];let late,hold=false;
 const job={id:'job',companyId:'company',storeId:'A',terminalId:'t',storeName:'Store A',terminalName:'POS1',requester:'Admin',state:'PENDING'};
 const api=async(path,options={})=>{calls.push({path,options});if(path==='/api/remote-support/pos/pending')return hold?new Promise(r=>late=()=>r({enabled:true,invitation:job})): {enabled:true,invitation:job,current:job};return path.endsWith('/consent')?{grant:'opaque'}:{stopped:true};};
 globalThis.fetch=async(url,options)=>{local.push({url,options});return {ok:true,json:async()=>url.endsWith('/status')?{version:2}:{accepted:true}};};
 const render=id=>act(async()=>root.render(React.createElement(m.exports.default,{key:id,api,storeId:id})));
 try{await render('A');assert.match(document.querySelector('[role=dialog]').textContent,/Store A/);assert.equal(calls.filter(x=>x.path.endsWith('/consent')).length,0);const accept=[...document.querySelectorAll('button')].find(x=>x.textContent==='Αποδοχή');await act(async()=>accept.click());assert.equal(calls.filter(x=>x.path.endsWith('/consent')).length,1);assert.deepEqual(JSON.parse(calls.find(x=>x.path.endsWith('/consent')).options.body),{accepted:true});assert.equal(JSON.parse(local.find(x=>x.url.endsWith('/accept')).options.body).grant,'opaque');assert.ok(document.querySelector('[role=status]'));await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Διακοπή πρόσβασης').click());assert.ok(calls.some(x=>x.path.endsWith('/stop')));hold=true;await render('B');await act(async()=>late());assert.equal(document.querySelector('[role=dialog]'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
