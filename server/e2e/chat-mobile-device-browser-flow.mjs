// Isolated rendered POS only: no signed-in session or production requests.
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync,spawn} from 'node:child_process';import {build} from 'esbuild';import assert from 'node:assert/strict';
const repo=process.cwd(),out=path.join(os.tmpdir(),'mws-chat-mobile-browser');await fs.mkdir(out,{recursive:true});
let chrome=process.env.CHROME_BIN;for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']){if(chrome)break;try{await fs.access(bin);chrome=bin}catch{}}
assert.ok(chrome,'A real Chromium browser is required for this CI rendering check');
const fixture=await fs.readFile('server/e2e/chat-mobile-device-fixture.jsx','utf8');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(out,'cdp-profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId=0,buffer='',errors='';const pending=new Map();browser.stderr.on('data',b=>{errors=(errors+b).slice(-3000)});
browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timeout);if(message.error)request.reject(Error(JSON.stringify(message.error)));else request.resolve(message.result);}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`${method} timed out: ${errors}`))},20000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});

const results=[];
try{
 await build({stdin:{contents:fixture,resolveDir:repo,loader:'jsx'},bundle:true,outfile:path.join(out,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'no-pdf',setup(b){b.onResolve({filter:/^pdfjs-dist/},a=>({path:a.path,namespace:'pdf-stub'}));b.onLoad({filter:/.*/,namespace:'pdf-stub'},()=>({contents:'export const GlobalWorkerOptions={};export const getDocument=()=>{};export default "";',loader:'js'}));}}],logLevel:'error'});
 await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script>window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})</script><script src="fixture.js"></script></body></html>');
 for(const [width,height] of [[390,844],[360,740],[390,420]]){
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:'file://'+path.join(out,'index.html')},sessionId);
  let result;
  for(let attempt=0;attempt<100;attempt++){
   const ev=await cdp('Runtime.evaluate',{expression:`(()=>{if(!document.querySelector('.store-chat-messages article'))return null;const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,right:r.right}};return {header:rect('.store-chat-modal>header'),messages:rect('.store-chat-messages'),compose:rect('.store-chat-compose'),searchHidden:getComputedStyle(document.querySelector('.store-chat-search')).display==='none',installText:document.querySelector('.chat-mobile-actions').textContent,overflow:document.documentElement.scrollWidth>innerWidth,calls:window.fixtureCalls,buttons:[...document.querySelectorAll('.store-chat-modal>header button,.store-chat-toolbar>button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>({text:b.textContent,r:{h:b.getBoundingClientRect().height,right:b.getBoundingClientRect().right}}))}})()`,returnByValue:true},sessionId);result=ev.result.value;if(result)break;await new Promise(r=>setTimeout(r,30));
  }
  assert.ok(result,'Chat fixture must render');assert.equal(result.overflow,false);assert.equal(result.searchHidden,true);assert.match(result.installText,/Εγκατεστημένη/);assert.ok(result.messages.h>= (height<560?60:150),'Messages must retain usable space');assert.ok(result.compose.b<=height+1,'Composer must remain visible');for(const b of result.buttons){assert.ok(b.r.h>=43,'Touch button is too short: '+b.text);assert.ok(b.r.right<=width+1,'Button exceeds screen: '+b.text)}
  assert.ok(result.calls.every(p=>p.includes('/messages')),'No synthetic writes or Push requests');
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await fs.writeFile(path.join(out,width+'-'+height+'.png'),Buffer.from(shot.data,'base64'));results.push({width,height,...result});await cdp('Target.closeTarget',{targetId});
 }
 await fs.writeFile(path.join(out,'geometry.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));console.log('Chat real Chromium layout PASS; synthetic fixture only, physical installation/Push acceptance still OPEN.');
}finally{await cdp('Browser.close').catch(()=>{});browser.kill();}

