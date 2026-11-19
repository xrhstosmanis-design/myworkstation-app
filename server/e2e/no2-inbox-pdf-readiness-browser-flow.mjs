import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const chrome=process.env.CHROME_BIN;assert.ok(chrome,'CHROME_BIN required');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mws-invoice-month-'));
const root=fileURLToPath(new URL('../../',import.meta.url));
await build({entryPoints:[path.join(root,'server/e2e/no2-inbox-pdf-readiness-fixture.jsx')],bundle:true,outfile:path.join(directory,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script></html>');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(directory,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
const exited=new Promise(resolve=>{browser.once('exit',resolve);browser.once('error',resolve)});
let id=0,buffer='',stderr='',primaryError;const requests=new Map();
const rejectRequests=error=>{for(const r of requests.values()){clearTimeout(r.timer);r.reject(error)}requests.clear()};
browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000)});browser.once('exit',()=>rejectRequests(Error('Chromium exited')));browser.stdio[3].on('error',rejectRequests);
browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const value=JSON.parse(raw),request=requests.get(value.id);if(request){requests.delete(value.id);clearTimeout(request.timer);value.error?request.reject(Error(JSON.stringify(value.error))):request.resolve(value.result)}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{requests.delete(n);reject(Error(method+' timed out: '+stderr))},20000);requests.set(n,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})})+'\0')});
const evaluate=async(sessionId,expression)=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value};
const waitFor=(sessionId,expression)=>evaluate(sessionId,`(async()=>{for(let n=0;n<120;n++){if(${expression})return true;await new Promise(r=>setTimeout(r,30))}throw Error('Expected browser state missing')})()`);
const click=async(sessionId,label)=>{
 const p=await evaluate(sessionId,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x+r.width/2,y:r.y+r.height/2,hit:hit===b||b.contains(hit),height:r.height}})()`);assert.equal(p.hit,true,'Pointer access: '+label);assert.ok(p.height>0);
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y},sessionId);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y},sessionId);
};
try{
 for(const [width,height]of [[1348,936],[390,844]]){
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:'file://'+path.join(directory,'index.html')},sessionId);
  await waitFor(sessionId,"[...document.querySelectorAll('button')].some(b=>b.textContent==='Άνοιγμα υπάρχοντος προχείρου')");assert.equal(await evaluate(sessionId,'window.__pdfOpened.length'),0);
  for(const [mode,explicit,expected]of [['empty',false,true],['populated',false,false],['populated',true,true],['readonly',true,false]]){
   await evaluate(sessionId,`window.__pdfMode=${JSON.stringify(mode)}`);const before=await evaluate(sessionId,'window.__pdfOpened.length');
   await click(sessionId,explicit?'Έλεγχος από βοηθό AI':'Άνοιγμα υπάρχοντος προχείρου');await waitFor(sessionId,`window.__pdfOpened.length===${before+1}`);
   const result=await evaluate(sessionId,'window.__pdfOpened.at(-1)');assert.equal(result.orderId,'saved-order');assert.equal(result.storeId,'s');assert.deepEqual(result.assistantSource,{inboxId:'pdf-fixture',storeId:'s'});assert.equal(result.openAssistant,expected);if(mode==='readonly')assert.equal(result.readOnly,true);
   await waitFor(sessionId,"[...document.querySelectorAll('button')].some(b=>b.textContent==='Έλεγχος από βοηθό AI'&&!b.disabled)");
  }
  const before=await evaluate(sessionId,'window.__pdfOpened.length');await evaluate(sessionId,"window.__pdfMode='reconcile'");await click(sessionId,'Άνοιγμα υπάρχοντος προχείρου');await waitFor(sessionId,"document.querySelector('.invoice-common-review')||document.body.textContent.includes('Απαιτείται αντιστοίχιση')");assert.equal(await evaluate(sessionId,'window.__pdfOpened.length'),before);
  const writes=await evaluate(sessionId,'window.__pdfCalls.filter(c=>c.method!=="GET")');assert.equal(writes.length,5);assert.ok(writes.every(c=>c.method==='POST'&&c.path.endsWith('/original')&&JSON.parse(c.body).storeId==='s'));
  await cdp('Target.closeTarget',{targetId});
 }
 console.log('Chromium PDF readiness passed: desktop/mobile explicit empty reading, populated explicit-only, read-only override, reconciliation suppression, exact saved context and no provider/apply calls.');
}catch(error){primaryError=error;throw error}
finally{
 try{if(browser.exitCode===null&&browser.signalCode===null){await Promise.race([cdp('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);const stopped=await Promise.race([exited.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);if(!stopped){browser.kill('SIGKILL');await exited}}await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(error){if(primaryError)console.error('Chromium cleanup also failed:',error);else throw error}
}
