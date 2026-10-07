import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

test('Pending Center follows the validated CommerceHub store without global or stale rows',async t=>{
  const hub=await readFile(new URL('../../client/src/components/commerce/CommerceHub.jsx',import.meta.url),'utf8');
  assert.match(hub,/<PendingCenterPanel key=\{stores\.find\(store=>store\.id===storeId\)\?\.id\|\|""\} scopeStoreId=\{stores\.find\(store=>store\.id===storeId\)\?\.id\|\|""\}/);
  const dir=await mkdtemp(new URL('../../.pending-ui-test-',import.meta.url));
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
  const names=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[n]});
  let root;
  try{
    const bundle=await build({entryPoints:[new URL('../../client/src/components/commerce/PendingCenterPanel.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'}});
    const file=new URL('panel.mjs',new URL(dir+'/','file://'));
    await writeFile(file,bundle.outputFiles[0].text);
    const Panel=(await import(file.href)).default;
    const stores=[{id:'A',name:'Store A'},{id:'B',name:'Store B'}];
    const calls=[],pending=[];
    let delayA=false;
    const api=async path=>{
      calls.push(path);const url=new URL(path,'https://isolated.invalid'),store=url.searchParams.get('storeId');
      if(delayA&&store==='A')await new Promise(resolve=>pending.push(resolve));
      if(url.pathname.includes('chat-tasks'))return {rows:[{id:'chat-'+store,storeName:'Store '+store,title:'CHAT-'+store,category:'GENERAL',status:'OPEN',createdAt:'2026-10-07T12:00:00Z'}]};
      if(url.pathname.includes('inventory'))return {rows:[{id:'stock-'+store,name:'STOCK-'+store,sku:store,trackStock:true,currentStock:-1}]};
      if(url.pathname.includes('archive'))return {items:[],total:0};
      return {items:[]};
    };
    root=createRoot(document.getElementById('root'));
    const render=async scope=>{await act(async()=>{root.render(React.createElement(Panel,{key:scope??'central',scopeStoreId:scope,api,stores,modules:['INVENTORY','DOCUMENTS'],onOpenSource:()=>{}}));});};
    const tick=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
    await t.test('selected store scopes initial Chat and each source, with one locked criterion',async()=>{
      await render('A');await tick();
      assert.ok(calls.length>=4);assert.ok(calls.every(p=>new URL(p,'https://isolated.invalid').searchParams.get('storeId')==='A'));
      const select=document.querySelector('.pending-center-filters select');
      assert.equal(select.value,'A');assert.equal(select.disabled,true);assert.equal(select.options.length,1);
      assert.match(document.body.textContent,/CHAT-A/);assert.match(document.body.textContent,/STOCK-A/);
    });
    await t.test('switch while old refresh is pending never restores old rows or source',async()=>{
      delayA=true;await act(async()=>document.querySelector('.pending-center header button').click());
      await render('B');await tick();
      await act(async()=>{pending.splice(0).forEach(resolve=>resolve());});await tick();
      assert.match(document.body.textContent,/CHAT-B/);assert.match(document.body.textContent,/STOCK-B/);
      assert.doesNotMatch(document.body.textContent,/CHAT-A|STOCK-A/);
      assert.equal(document.querySelector('.pending-center-filters select').value,'B');
    });
    await t.test('empty scoped context makes no global request; standalone central selection remains',async()=>{
      const before=calls.length;await render('');await tick();assert.equal(calls.length,before);
      assert.match(document.body.textContent,/Επιλέξτε διαθέσιμο κατάστημα/);
      delayA=false;await render(undefined);await tick();
      assert.ok(calls.some(p=>p.startsWith('/api/pending-center/chat-tasks?')&&!new URL(p,'https://isolated.invalid').searchParams.has('storeId')));
      const select=document.querySelector('.pending-center-filters select');assert.equal(select.disabled,false);assert.equal(select.options[0].textContent,'Όλα τα καταστήματα');
    });
  }finally{if(root)await act(async()=>root.unmount());dom.window.close();for(const [n,d]of previous){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}await rm(dir,{recursive:true,force:true});}
});
