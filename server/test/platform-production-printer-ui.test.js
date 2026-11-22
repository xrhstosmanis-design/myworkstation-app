import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
const until=async fn=>{for(let i=0;i<500;i++){if(fn())return fn();await new Promise(r=>setTimeout(r,10))}assert.fail('UI state not observed')};
test('central printer panel saves only selected company/store and ignores late previous-store data',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Panel from './client/src/components/platform/PlatformProductionPrinterManager.jsx';window.root=createRoot(document.getElementById('root'));window.renderPanel=()=>window.root.render(React.createElement(Panel,{...window.props,key:window.props.company.id+':'+window.props.store.id}));window.renderPanel();`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'}),w=dom.window,calls=[];let releaseOld;
 const fresh={canConfigure:true,products:[{id:'coffee',name:'Selected coffee'}],jobs:[]};
 const request=async(path,options={})=>{calls.push({path,options});if(path.includes('/companies/old-company/'))return new Promise(r=>{releaseOld=r});return fresh};
 w.props={company:{id:'old-company'},store:{id:'old-store',name:'Old'},request,onClose:()=>{}};
 w.eval(bundle.outputFiles[0].text);
 try{
  await until(()=>releaseOld);
  w.props={...w.props,company:{id:'new-company'},store:{id:'new-store',name:'New'}};w.renderPanel();
  await until(()=>w.document.body.textContent.includes('Selected coffee'));
  releaseOld({canConfigure:true,products:[{id:'wrong',name:'Wrong old product'}],jobs:[]});await new Promise(r=>setTimeout(r,30));
  assert.equal(w.document.body.textContent.includes('Wrong old product'),false);
  [...w.document.querySelectorAll('label')].find(l=>l.textContent==='Selected coffee').querySelector('input').click();
  [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Αποθήκευση σύνδεσης').click();
  const save=await until(()=>calls.find(c=>c.options.method==='PUT'));
  assert.equal(save.path,'/api/production-printers/companies/new-company/stores/new-store');assert.deepEqual(JSON.parse(save.options.body).productIds,['coffee']);assert.equal(JSON.parse(save.options.body).enabled,false);
  assert.equal(calls.some(c=>/support-access|checkout|\/preparation|\/device\//.test(c.path)),false);
 }finally{w.root.unmount();w.close()}
});
