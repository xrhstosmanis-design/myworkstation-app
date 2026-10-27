import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const chrome=process.env.CHROME_BIN;
assert.ok(chrome,'CHROME_BIN is required');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mws-support-guide-'));
const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
await build({entryPoints:[path.join(projectRoot,'server/e2e/installation-support-fault-guide-fixture.jsx')],bundle:true,outfile:path.join(directory,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html lang="el"><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script></html>');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(directory,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let id=0,buffer='',errors='';const pending=new Map();browser.stderr.on('data',data=>{errors=(errors+data).slice(-4000)});
browser.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result)}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out: '+errors))},20000);pending.set(n,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})})+'\0')});
const evaluate=async(sessionId,expression)=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value};
try{
 for(const [width,height] of [[1348,936],[390,844]]){
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
  await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:'file://'+path.join(directory,'index.html')},sessionId);
  await evaluate(sessionId,`(async()=>{for(let i=0;i<120;i++){if([...document.querySelectorAll('button')].some(b=>b.textContent==='Εκτύπωση οδηγού βλάβης'))return;await new Promise(r=>setTimeout(r,30))}throw Error('Guide button missing')})()`);
  assert.equal(await evaluate(sessionId,"document.activeElement?.getAttribute('aria-label')"),'Κλείσιμο στοιχείων υποστήριξης');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8},sessionId);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8},sessionId);
  assert.equal(await evaluate(sessionId,"document.activeElement?.textContent"),'Εκτύπωση οδηγού βλάβης');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  assert.equal(await evaluate(sessionId,"document.activeElement?.getAttribute('aria-label')"),'Κλείσιμο στοιχείων υποστήριξης');
  const point=await evaluate(sessionId,`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Εκτύπωση οδηγού βλάβης');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,hit:hit===b||b.contains(hit)}})()`);
  assert.equal(point.hit,true,'button must be clickable at '+width);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y},sessionId);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y},sessionId);
  assert.equal(await evaluate(sessionId,`(async()=>{for(let i=0;i<120;i++){if(window.__guidePrintInvoked)return true;await new Promise(r=>setTimeout(r,30))}return false})()`),true,'actual popup print must be invoked');
  const targets=await cdp('Target.getTargets');const popup=targets.targetInfos.find(t=>t.openerId===targetId&&t.type==='page');assert.ok(popup,'real popup missing');
  const attached=await cdp('Target.attachToTarget',{targetId:popup.targetId,flatten:true}),popupSession=attached.sessionId;
  await cdp('Page.enable',{},popupSession);
  const popupText=await evaluate(popupSession,'document.body.innerText');assert.match(popupText,/Σε περίπτωση βλάβης/);assert.doesNotMatch(popupText,/PRIVATE-OTHER-STORE-SENTINEL|SECRET-SENTINEL|Δοκιμαστικό Κατάστημα|synthetic@example/);
  const rendered=await cdp('Page.printToPDF',{printBackground:true,preferCSSPageSize:true},popupSession);
  const pdf=await getDocument({data:new Uint8Array(Buffer.from(rendered.data,'base64')),useSystemFonts:true}).promise;
  assert.equal(pdf.numPages,1,'guide must fit one page');const page=await pdf.getPage(1),content=await page.getTextContent();const text=content.items.map(item=>item.str||'').join(' ');
  assert.match(text,/Σε περίπτωση βλάβης/);assert.match(text,/δεν καταχωρεί βλάβη/);assert.doesNotMatch(text,/PRIVATE-OTHER-STORE-SENTINEL|SECRET-SENTINEL|Δοκιμαστικό Κατάστημα|synthetic@example/);
  await pdf.destroy();await cdp('Target.closeTarget',{targetId:popup.targetId});await cdp('Target.closeTarget',{targetId});
 }
 console.log('Chromium synthetic popup and one-page PDF passed at desktop and mobile sizes; native print dialog and physical printer not tested.');
}finally{await cdp('Browser.close').catch(()=>{});browser.kill();await fs.rm(directory,{recursive:true,force:true})}
