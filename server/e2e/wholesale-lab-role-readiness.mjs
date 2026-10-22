import fs from 'node:fs/promises';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const out='/tmp/mws-wholesale-lab-browser';
const source=new URL('../../ops/wholesale-lab/public/',import.meta.url);
await fs.mkdir(out,{recursive:true});
let chrome=process.env.CHROME_BIN;
for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await fs.access(bin);chrome=bin}catch{}}
assert.ok(chrome,'Real Chromium is required for role-readiness regression');
const profile=await fs.mkdtemp('/tmp/mws-role-readiness-');
const files=Object.fromEntries(await Promise.all(['index.html','lab.js','lab.css'].map(async name=>[name,await fs.readFile(new URL(name,source))])));
const meta={lab:true,testOnly:true,virtualOnly:true,companyId:'synthetic-company',storeId:'synthetic-store',defaultStoreId:'synthetic-store',stores:[{id:'synthetic-store',name:'Synthetic diagnostic only'}],revision:'SYNTHETIC delayed-meta diagnostic — NOT production/LAB acceptance'};
let hold=true,held=[],sessionPosts=0,mode="valid";
const metadataResponse=res=>send(res,mode==="http-failure"?503:200,mode==="invalid"?{...meta,lab:false}:mode==="http-failure"?{error:"Synthetic unavailable"}:meta);
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/lab')return send(res,200,files['index.html'],'text/html; charset=utf-8');
  if(url.pathname==='/lab/lab.js')return send(res,200,files['lab.js'],'application/javascript; charset=utf-8');
  if(url.pathname==='/lab/lab.css')return send(res,200,files['lab.css'],'text/css; charset=utf-8');
  if(url.pathname==='/api/lab/meta'){if(hold){held.push(res);return;}return metadataResponse(res);}
  if(url.pathname==='/api/lab/session'&&req.method==='POST'){sessionPosts++;return send(res,403,{error:'Synthetic diagnostic intentionally stops before creating any session.'});}
  return send(res,404,{error:'No business endpoint exists in this diagnostic.'});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
const browserStopped=new Promise(resolve=>browser.once('exit',resolve));
let serial=0,buffer='',errors='';const pending=new Map();
browser.stderr.on('data',bytes=>errors=(errors+bytes).slice(-4000));
browser.stdio[4].on('data',bytes=>{buffer+=bytes;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const result=JSON.parse(raw),request=pending.get(result.id);if(request){pending.delete(result.id);clearTimeout(request.timer);result.error?request.reject(Error(JSON.stringify(result.error))):request.resolve(result.result);}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout '+errors));},15000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
const evaluate=async(sessionId,expression)=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result?.value;};
const wait=async(sessionId,expression)=>{const end=Date.now()+5000;while(Date.now()<end){if(await evaluate(sessionId,`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Diagnostic condition absent: '+expression);};
const observe=sessionId=>evaluate(sessionId,`(()=>({readyState:document.readyState,ownerPresent:!!document.querySelector('[data-role=owner]'),buttonEnabled:!document.querySelector('[data-role=owner]').disabled,consoleHidden:document.querySelector('#console').hidden,identity:document.querySelector('#identity').textContent,runtimeStatus:document.querySelector('#runtime-status').textContent,revision:document.querySelector('#revision').textContent}))()`);
const createPage=async()=>{const{targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});await cdp('Page.enable',{},sessionId);await cdp('Runtime.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:origin+'/lab'},sessionId);return{targetId,sessionId};};
const checks=[];
try{
  for(let attempt=0;attempt<2;attempt++){
    hold=true;mode='valid';const page=await createPage();
    await wait(page.sessionId,`document.readyState==='complete'&&document.querySelector('[data-role=owner]')`);
    assert.equal(held.length,1);const before=await observe(page.sessionId);assert.equal(before.buttonEnabled,false,'Roles must be unavailable before metadata and handlers are ready');
    assert.equal(await evaluate(page.sessionId,`[...document.querySelectorAll('[data-role]')].every(b=>b.matches(':disabled'))`),true);
    await evaluate(page.sessionId,`document.querySelector('[data-role=owner]').click()`);assert.equal(sessionPosts,attempt);
    hold=false;for(const response of held.splice(0))metadataResponse(response);
    await wait(page.sessionId,`!document.querySelector('[data-role=owner]').disabled`);
    assert.equal(sessionPosts,attempt,'No queued early click may create a later session');
    await evaluate(page.sessionId,`document.querySelector('[data-role=owner]').click()`);
    await wait(page.sessionId,`document.querySelector('#message').textContent.includes('Synthetic diagnostic')&&!document.querySelector('[data-role=owner]').disabled`);
    assert.equal(sessionPosts,attempt+1,'One ready click must create exactly one controlled request');
    checks.push({kind:attempt?'fresh-page re-entry':'initial entry',before,oneReadyClickPosts:1,noEarlyOrQueuedRequest:true});
    if(attempt===1){const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},page.sessionId);await fs.writeFile(out+'/role-readiness.png',Buffer.from(shot.data,'base64'));}
    await cdp('Target.closeTarget',{targetId:page.targetId});
  }
  for(const failure of ['invalid','http-failure']){
    hold=false;mode=failure;const page=await createPage();
    await wait(page.sessionId,`document.querySelector('#runtime-status')?.textContent==='Το εργαστήριο δεν είναι διαθέσιμο'`);
    assert.equal(await evaluate(page.sessionId,`[...document.querySelectorAll('[data-role]')].every(b=>b.matches(':disabled'))`),true);
    await evaluate(page.sessionId,`document.querySelector('[data-role=owner]').click()`);assert.equal(sessionPosts,2);
    checks.push({kind:failure,rolesDisabled:true,noSessionRequest:true});await cdp('Target.closeTarget',{targetId:page.targetId});
  }
  const result={kind:'Actual Chromium / controlled loopback HTTP / synthetic role-readiness regression',at:new Date().toISOString(),checks,sessionPosts,businessDatabase:false,productionRequests:false,physicalAcceptance:false,pass:true};
  await fs.writeFile(out+'/role-readiness.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  for(const response of held)response.destroy();
  await cdp('Browser.close').catch(()=>{});browser.kill();for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Diagnostic closed'));}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await browserStopped;await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:50});
}
