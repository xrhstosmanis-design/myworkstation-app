import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {build} from "esbuild";

const out=path.join(os.tmpdir(),"mws-report-settings-browser");await fs.mkdir(out,{recursive:true});
// Keep the isolated background launcher faithful to the actual platform shell.
const platform=await fs.readFile("client/src/components/platform/PlatformAdminApp.jsx","utf8");
assert.match(platform,/position:"fixed",left:32,bottom:32,zIndex:1002,display:"grid",gap:8/);
let chrome=process.env.CHROME_BIN;
for(const bin of ["/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"]){if(chrome)break;try{await fs.access(bin);chrome=bin}catch{}}
assert.ok(chrome,"Real Chromium is required for report-dialog pointer verification");
await build({entryPoints:["server/e2e/automatic-report-settings-fixture.jsx"],bundle:true,outfile:path.join(out,"fixture.js"),platform:"browser",format:"iife",define:{"process.env.NODE_ENV":'"production"'},logLevel:"error"});
await fs.writeFile(path.join(out,"index.html"),'<!doctype html><html lang="el"><meta charset="utf-8"><style>body{margin:0}button{font:inherit}</style><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script></html>');
const browser=spawn(chrome,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--no-first-run","--remote-debugging-pipe","--no-startup-window",`--user-data-dir=${path.join(out,"profile")}`],{stdio:["ignore","ignore","pipe","pipe","pipe"]});
let id=0,buffer="",errors="";const pending=new Map();browser.stderr.on("data",data=>{errors=(errors+data).slice(-3000)});
browser.stdio[4].on("data",data=>{buffer+=data;let end;while((end=buffer.indexOf("\0"))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result)}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+" timed out: "+errors))},20000);pending.set(n,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})})+"\0")});
const evaluate=async(sessionId,expression)=>{const result=await cdp("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value};
const proof=[];
try{
 for(const [kind,width,height] of [["before",1348,936],["after",1348,936],["after",1024,768],["after",390,844]]){
  const {targetId}=await cdp("Target.createTarget",{url:"about:blank"}),{sessionId}=await cdp("Target.attachToTarget",{targetId,flatten:true});
  await cdp("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false},sessionId);await cdp("Page.enable",{},sessionId);await cdp("Page.navigate",{url:"file://"+path.join(out,"index.html")},sessionId);
  await evaluate(sessionId,`(async()=>{for(let i=0;i<120;i++){const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Προεπισκόπηση αναφοράς');if(b&&!b.disabled)return;await new Promise(r=>setTimeout(r,30))}throw Error('Report fixture did not load')})()`);
  if(kind==="before")await evaluate(sessionId,"document.querySelector('.automatic-report-settings-modal').classList.remove('automatic-report-settings-modal')");
  const point=await evaluate(sessionId,`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Προεπισκόπηση αναφοράς');b.scrollIntoView({block:'end'});const r=b.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,hit:b===top||b.contains(top),top:top?.textContent,modalZ:getComputedStyle(b.closest('.platform-modal')).zIndex}})()`);
  assert.equal(point.hit,kind==="after",`${kind}/${width}: wrong pointer target ${point.top}`);
  await cdp("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x:point.x,y:point.y},sessionId);await cdp("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x:point.x,y:point.y},sessionId);
  const result=await evaluate(sessionId,`(async()=>{for(let i=0;i<120;i++){const preview=Number(document.getElementById('preview-calls').textContent),background=Number(document.getElementById('background-clicks').textContent);const hold=document.body.textContent.includes('Αναμονή ολοκλήρωσης / ελέγχου');if(background||preview&&hold)return {preview,background,hold};await new Promise(r=>setTimeout(r,30))}throw Error('Pointer click produced no result')})()`);
  if(kind==="after"){assert.equal(result.preview,1);assert.equal(result.background,0);assert.equal(result.hold,true)}else{assert.equal(result.preview,0);assert.equal(result.background,1)}
  proof.push({kind,width,height,...point,...result});await cdp("Target.closeTarget",{targetId});
 }
 await fs.writeFile(path.join(out,"geometry.json"),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));console.log("Report dialog real Chromium pointer PASS: reproduced original obstruction; desktop/tablet/mobile preview receives one request and background receives zero. Synthetic fixture only, not LAB PASS.");
}finally{await cdp("Browser.close").catch(()=>{});browser.kill()}
