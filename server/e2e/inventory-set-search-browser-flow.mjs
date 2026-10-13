// Actual product-card render with synthetic data only; no production requests.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const out=path.join(os.tmpdir(),'mws-inventory-set-browser');await fs.mkdir(out,{recursive:true});
let chrome=process.env.CHROME_BIN;
for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']){if(chrome)break;try{await fs.access(bin);chrome=bin}catch{}}
assert.ok(chrome,'Real Chromium is required for SET geometry verification');
await build({entryPoints:['server/e2e/inventory-set-search-fixture.jsx'],bundle:true,outfile:path.join(out,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html lang="el"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}#root{padding:16px}</style><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script></html>');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(out,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let id=0,buffer='',errors='';const pending=new Map();browser.stderr.on('data',data=>{errors=(errors+data).slice(-3000)});
browser.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result)}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out: '+errors))},20000);pending.set(n,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})})+'\0')});
const evaluate=async(sessionId,expression)=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value};
const geometry=[];
try{
  for(const [width,height] of [[1280,800],[1024,768],[800,600]]){
    const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:'file://'+path.join(out,'index.html')},sessionId);
    await evaluate(sessionId,`(async()=>{const wait=async(fn)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,30))}throw Error('SET fixture did not render')};await wait(()=>[...document.querySelectorAll('.ia-card-tabs button')].some(b=>b.textContent==='SET'));[...document.querySelectorAll('.ia-card-tabs button')].find(b=>b.textContent==='SET').click();await wait(()=>document.querySelector('#ia-set-product-search'));const input=document.querySelector('#ia-set-product-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'VODAFONE');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>document.querySelector('.ia-set-search-results button'))})()`);
    const view=await evaluate(sessionId,`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return{modal:rect('.ia-modal.set-editor'),footer:rect('.ia-modal-actions'),search:rect('#ia-set-product-search'),table:rect('.ia-card-table.composition'),resultCount:document.querySelectorAll('.ia-set-search-results button').length}})()`);
    assert.ok(view.modal.x>=0&&view.modal.y>=0&&view.modal.bottom<=height+1&&view.modal.x+view.modal.width<=width+1,'SET modal must fit viewport');
    assert.ok(view.footer.y>=0&&view.footer.bottom<=height+1,'SET actions must remain visible');assert.ok(view.search.height>=48,'Search has a readable touch target');assert.equal(view.resultCount,8);
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await fs.writeFile(path.join(out,`set-${width}.png`),Buffer.from(shot.data,'base64'));
    const writes=await evaluate(sessionId,`(async()=>{document.querySelector('.ia-set-search-results button').click();await new Promise(r=>setTimeout(r,100));[...document.querySelectorAll('.ia-set-composition-form button')].find(b=>b.textContent.includes('Νέα συσχέτιση')).click();for(let i=0;i<100;i++){if(document.querySelector('.ia-card-table.composition').textContent.includes('VODAFONE ΠΑΚΕΤΟ'))return window.writes;await new Promise(r=>setTimeout(r,30))}throw Error('Selected association not shown')})()`);
    assert.equal(writes.length,1);assert.ok(writes[0].url.endsWith('/parent/set-items'));assert.equal(JSON.parse(writes[0].body).relatedProductId,'p0');assert.equal(JSON.parse(writes[0].body).quantity,1);assert.equal(JSON.parse(writes[0].body).salePrice,null);
    geometry.push({width,height,...view});await cdp('Target.closeTarget',{targetId});
  }
  await fs.writeFile(path.join(out,'geometry.json'),JSON.stringify(geometry,null,2));console.log(JSON.stringify(geometry));console.log('SET search/render/explicit association PASS in synthetic Chromium fixture; not LAB/USER PASS.');
}finally{await cdp('Browser.close').catch(()=>{});browser.kill()}
