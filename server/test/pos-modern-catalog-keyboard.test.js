import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {renderPosFixture} from './helpers/pos-ui-browser.mjs';
let chrome=process.env.CHROME_BIN;for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
test('actual browser Enter and Space navigate nested modern categories and add only the chosen product',{skip:!chrome&&!process.env.CI,timeout:40000},async()=>{
 assert.ok(chrome,'Chromium required in CI');const temp=await mkdtemp(path.join(tmpdir(),'pos-modern-keyboard-'));
 try{
 const code=await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import Catalog from './client/src/components/store/PosModernCatalog.jsx';const product={id:'p',name:'SYNTHETIC COFFEE',salePrice:2.2},category={id:'coffee',label:'ΚΑΦΕΣ',children:[{id:'cold',label:'ΚΡΥΟΣ',productCodes:['p']}]};window.added=[];flushSync(()=>createRoot(document.querySelector('#root')).render(<Catalog storeId="LAB" quickButtons={Array.from({length:20},(_,i)=>({id:'q'+i,label:'QUICK'+i,price:2.2}))} categoryButtons={[category]} quickProduct={()=>product} categoryProducts={()=>[product]} categoryCount={()=>1} onQuick={()=>window.added.push('quick')} onProduct={p=>window.added.push(p.id)} search={<input data-pos-scanner/>} query="" searchRows={[]}/>));`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const file=path.join(temp,'fixture.html');await writeFile(file,'<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+code.outputFiles[0].text+'</script>');
 const check=expression=>({evaluate:`new Promise(resolve=>setTimeout(resolve,30)).then(()=>{if(!(${expression}))throw Error(${JSON.stringify(expression)})})`});
 const result=await renderPosFixture({chrome,file,width:1024,height:768,profile:path.join(temp,'profile'),steps:[
  {evaluate:`document.querySelector('.standard-category-strip>div>button').focus()`},{key:'Enter'},check(`document.querySelector('.pos-modern-subcategory')&&window.added.length===0`),
  {evaluate:`document.querySelector('.pos-modern-subcategory').focus()`},{key:' '},check(`document.querySelector('.pos-modern-product')&&window.added.length===0`),
  {evaluate:`document.querySelector('.pos-modern-product').focus()`},{key:'Enter'},check(`window.added.length===1&&window.added[0]==='p'`),
  {evaluate:`document.querySelector('[aria-label="Πίσω στην προηγούμενη κατηγορία"]').focus()`},{key:'Enter'},check(`document.querySelector('.pos-modern-subcategory')&&window.added.length===1`),
  {evaluate:`document.querySelector('.pos-modern-quick-tab').focus()`},{key:' '},check(`!document.querySelector('.standard-quick').hidden&&document.querySelectorAll('.standard-quick>div>button').length===20&&window.added.length===1`),
  {evaluate:`document.body.dataset.result='PASS'`}
 ]});assert.equal(result.result,'PASS');
 }finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});

test('actual browser uses a separate keyboard editor control for an empty position without intercepting selling', {skip:!chrome&&!process.env.CI,timeout:40000},async()=>{
 assert.ok(chrome,'Chromium required in CI');const temp=await mkdtemp(path.join(tmpdir(),'pos-empty-editor-'));
 try{
  const code=await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import Catalog from './client/src/components/store/PosModernCatalog.jsx';import Editor from './client/src/components/store/StorePosButtonEditor.jsx';const product={id:'product-A',name:'SYNTHETIC PRODUCT',salePrice:2.2},layout={quickKeys:[{id:'assigned',label:product.name,productCodes:[product.id],visible:true}],categories:[]};window.added=[];window.requests=[];window.saved=[];window.originalLayout=JSON.stringify(layout);const api=async(path,options)=>{window.requests.push({path,options});return {layout:JSON.parse(options.body).layout,version:2}};function Fixture(){const [enabled,setEnabled]=useState(true);window.setEditorEnabled=value=>flushSync(()=>setEnabled(value));return <div className="mws-standard-pos pos-modern"><Catalog storeId="synthetic-store" quickButtons={layout.quickKeys} categoryButtons={[]} quickProduct={()=>product} categoryProducts={()=>[]} categoryCount={()=>0} onQuick={button=>window.added.push(button.id)} onProduct={()=>{}} search={null} query="" searchRows={[]}/><Editor api={api} store={{id:'synthetic-store'}} layout={layout} products={[product]} enabled={enabled} onSaved={result=>window.saved.push(result)}/></div>}flushSync(()=>createRoot(document.querySelector('#root')).render(<Fixture/>));window.inputLayout=layout;`},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  const css=(await Promise.all(['store-pos-button-editor.css','pos-ui-v2.css'].map(name=>readFile(new URL('../../client/src/components/store/'+name,import.meta.url),'utf8')))).join('\n');
  const file=path.join(temp,'fixture.html');await writeFile(file,'<!doctype html><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}#root{height:650px;width:960px}'+css+'</style><div id="root"></div><script>'+code.outputFiles[0].text+'</script>');
  const check=expression=>({evaluate:`new Promise(resolve=>setTimeout(resolve,30)).then(()=>{if(!(${expression}))throw Error(${JSON.stringify(expression)})})`});
  const result=await renderPosFixture({chrome,file,width:1024,height:768,profile:path.join(temp,'profile'),steps:[
   {evaluate:`document.querySelector('.standard-quick>div>button').focus()`},{key:'Enter'},check(`window.added.length===1&&document.querySelector('[role=dialog]')===null&&window.requests.length===0`),
   {evaluate:`(()=>{const button=document.querySelector('[aria-label="Ρύθμιση πλήκτρων POS"]'),r=button.getBoundingClientRect();if(button.closest('.standard-quick')||r.width<35||r.height<32||!button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('separate editor hit target');button.focus()})()`},{key:' '},check(`document.querySelectorAll('[data-pos-edit-kind]').length===40&&window.requests.length===0`),
   {evaluate:`document.querySelector('[data-pos-edit-kind="quick"][data-pos-edit-index="19"]').focus()`},{key:'Enter'},check(`document.querySelector('[role=dialog]').textContent.includes('Κουμπί 20')&&window.requests.length===0`),
   {evaluate:`document.querySelector('.pos-button-product-list button').focus()`},{key:'Enter'},check(`window.requests.length===0&&window.added.length===1`),
   {evaluate:`document.querySelector('.pos-button-editor-overlay .save').focus()`},{key:'Enter'},check(`window.requests.length===1&&window.requests[0].path==='/api/store-pos/stores/synthetic-store/layout'&&JSON.parse(window.requests[0].options.body).layout.quickKeys[19].productCodes[0]==='product-A'&&window.saved.length===1&&JSON.stringify(window.inputLayout)===window.originalLayout`),
   {evaluate:`window.setEditorEnabled(false)`},check(`document.querySelector('.pos-button-editor-launcher')===null&&window.requests.length===1`),
   {evaluate:`document.body.dataset.result='PASS'`}
  ]});assert.equal(result.result,'PASS');
 }finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
