import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
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
