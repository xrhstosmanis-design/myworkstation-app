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
await build({entryPoints:[path.join(root,'server/e2e/monthly-invoice-audit-fixture.jsx')],bundle:true,outfile:path.join(directory,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="fixture.js"></script></html>');
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
 const p=await evaluate(sessionId,`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x+r.width/2,y:r.y+r.height/2,hit:hit===b||b.contains(hit),height:r.height}})()`);assert.equal(p.hit,true,'Pointer access: '+label);assert.ok(p.height>=40||label==='Αλλαγή καταστήματος'||label==='Καμία επιλογή'||label==='Ελλιπής πηγή');
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y},sessionId);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y},sessionId);
};
try{
 for(const [width,height]of [[1348,936],[390,844]]){
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:'file://'+path.join(directory,'index.html')},sessionId);
  await waitFor(sessionId,"document.querySelector('.invoice-month-audit form')");assert.equal(await evaluate(sessionId,'window.__monthAuditRequests.length'),0);
  await click(sessionId,'Έλεγχος μήνα');await waitFor(sessionId,"document.querySelector('[aria-label=\"Σύνολα επιλεγμένου μήνα\"]')");
  const proof=await evaluate(sessionId,`({month:document.querySelector('[aria-label="Σύνολα επιλεγμένου μήνα"]').textContent,pending:document.querySelector('.ima-pending').textContent,images:document.querySelectorAll('.invoice-month-audit img').length,request:window.__monthAuditRequests.at(-1),overflow:document.documentElement.scrollWidth>innerWidth+2})`);
  assert.match(proof.month,/120/);assert.match(proof.pending,/Όλοι οι μήνες/);assert.match(proof.pending,/75/);assert.match(proof.pending,/πρώτες 50/);assert.match(proof.pending,/2025-01-01/);assert.equal(proof.images,0);assert.equal(proof.request.storeId,'s');assert.equal(proof.request.month,'2026-10');assert.equal(proof.overflow,false);
  await click(sessionId,'Επόμενη σελίδα');await waitFor(sessionId,"window.__monthAuditRequests.at(-1).page==='synthetic-next-page'");
  await click(sessionId,'Ελλιπής πηγή');await waitFor(sessionId,"!document.querySelector('[aria-label=\"Σύνολα επιλεγμένου μήνα\"]')");await click(sessionId,'Έλεγχος μήνα');await waitFor(sessionId,"document.querySelector('.invoice-month-audit').textContent.includes('Η κάλυψη δεν είναι πλήρης')");assert.equal(await evaluate(sessionId,"document.querySelector('.ima-safe')===null"),true);
  await click(sessionId,'Αλλαγή καταστήματος');await waitFor(sessionId,"document.querySelector('.invoice-month-audit').textContent.includes('Synthetic other')");assert.equal(await evaluate(sessionId,"document.querySelector('.ima-pending')===null"),true);
  // A real keyboard activation must still call only the scoped GET fixture.
  await evaluate(sessionId,"document.querySelector('.invoice-month-audit button[type=submit]').focus()");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await waitFor(sessionId,"window.__monthAuditRequests.at(-1).storeId==='other'");
  await click(sessionId,'Καμία επιλογή');await waitFor(sessionId,"document.querySelector('.invoice-month-audit form')===null");assert.equal(await evaluate(sessionId,"document.querySelector('.invoice-month-audit').textContent.includes('Επίλεξε συγκεκριμένο κατάστημα')"),true);await cdp('Target.closeTarget',{targetId});
 }
 console.log('Chromium monthly invoice audit passed: desktop/mobile pointer and keyboard, explicit scoped GET, escaped labels, distinct all-month pending and incomplete-source refusal. Synthetic fixture only, not hosted/LAB acceptance.');
}catch(error){primaryError=error;throw error}
finally{
 try{if(browser.exitCode===null&&browser.signalCode===null){await Promise.race([cdp('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);const stopped=await Promise.race([exited.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);if(!stopped){browser.kill('SIGKILL');await exited}}await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(error){if(primaryError)console.error('Chromium cleanup also failed:',error);else throw error}
}
