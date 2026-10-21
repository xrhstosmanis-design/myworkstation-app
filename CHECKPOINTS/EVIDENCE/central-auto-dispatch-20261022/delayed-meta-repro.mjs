import fs from 'node:fs/promises';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const out='/tmp/wholesale-role-race-repro',source='/workspace/scratch/fb406246538e/automatic-dispatch-integration/ops/wholesale-lab/public',browserRoot='/tmp/mws-recorded-payroll-browser';
const files=Object.fromEntries(await Promise.all(['index.html','lab.js','lab.css'].map(async name=>[name,await fs.readFile(source+'/'+name)])));
const expected={'index.html':'d82df7685dfbbb8a0169de6f4d626193258d4677','lab.js':'08f89c1f55d48e45ec21e39b7917a4c3a76f58b9','lab.css':'f05655149d4bd3fd6283aa3330ef3247586efc62'};
for(const[name,bytes]of Object.entries(files))assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex'),expected[name]);
const meta={lab:true,testOnly:true,virtualOnly:true,companyId:'synthetic-company',storeId:'synthetic-store',defaultStoreId:'synthetic-store',stores:[{id:'synthetic-store',name:'Synthetic diagnostic only'}],revision:'SYNTHETIC delayed-meta diagnostic — NOT production/LAB acceptance'};
let hold=true,held=[],sessionPosts=0;
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/lab')return send(res,200,files['index.html'],'text/html; charset=utf-8');
  if(url.pathname==='/lab/lab.js')return send(res,200,files['lab.js'],'application/javascript; charset=utf-8');
  if(url.pathname==='/lab/lab.css')return send(res,200,files['lab.css'],'text/css; charset=utf-8');
  if(url.pathname==='/api/lab/meta'){if(hold){held.push(res);return;}return send(res,200,meta);}
  if(url.pathname==='/api/lab/session'&&req.method==='POST'){sessionPosts++;return send(res,403,{error:'Synthetic diagnostic intentionally stops before creating any session.'});}
  return send(res,404,{error:'No business endpoint exists in this diagnostic.'});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=spawn(browserRoot+'/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${out}/profile`],{stdio:['ignore','ignore','pipe','pipe','pipe'],env:{...process.env,LD_LIBRARY_PATH:browserRoot+'/lib:'+browserRoot,FONTCONFIG_PATH:browserRoot+'/fonts'}});
let serial=0,buffer='',errors='';const pending=new Map();
browser.stderr.on('data',bytes=>errors=(errors+bytes).slice(-4000));
browser.stdio[4].on('data',bytes=>{buffer+=bytes;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const result=JSON.parse(raw),request=pending.get(result.id);if(request){pending.delete(result.id);clearTimeout(request.timer);result.error?request.reject(Error(JSON.stringify(result.error))):request.resolve(result.result);}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout '+errors));},15000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
const evaluate=async(sessionId,expression)=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result?.value;};
const wait=async(sessionId,expression)=>{const end=Date.now()+5000;while(Date.now()<end){if(await evaluate(sessionId,`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Diagnostic condition absent: '+expression);};
const observe=sessionId=>evaluate(sessionId,`(()=>({readyState:document.readyState,ownerPresent:!!document.querySelector('[data-role=owner]'),buttonEnabled:!document.querySelector('[data-role=owner]').disabled,consoleHidden:document.querySelector('#console').hidden,identity:document.querySelector('#identity').textContent,runtimeStatus:document.querySelector('#runtime-status').textContent,revision:document.querySelector('#revision').textContent}))()`);
const createPage=async()=>{const{targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});await cdp('Page.enable',{},sessionId);await cdp('Runtime.enable',{},sessionId);await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.navigate',{url:origin+'/lab'},sessionId);return{targetId,sessionId};};
try{
  const early=await createPage();
  await wait(early.sessionId,`document.readyState==='complete'&&document.querySelector('[data-role=owner]')&&!document.querySelector('[data-role=owner]').disabled`);
  const beforeClick=await observe(early.sessionId);assert.equal(held.length,1);assert.equal(sessionPosts,0);
  await evaluate(early.sessionId,`document.querySelector('[data-role=owner]').click()`);
  assert.equal(sessionPosts,0);
  hold=false;for(const response of held.splice(0))send(response,200,meta);
  await wait(early.sessionId,`document.querySelector('#runtime-status').textContent==='Ενεργό · μόνο εικονικά δεδομένα'`);
  const afterRelease=await observe(early.sessionId);assert.equal(sessionPosts,0);assert.equal(afterRelease.consoleHidden,true);assert.equal(afterRelease.identity,'Χωρίς σύνδεση δοκιμής');
  const screen=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},early.sessionId);await fs.writeFile(out+'/delayed-meta-lost-click.png',Buffer.from(screen.data,'base64'));
  await cdp('Target.closeTarget',{targetId:early.targetId});
  const later=await createPage();
  await wait(later.sessionId,`document.readyState==='complete'&&document.querySelector('#runtime-status').textContent==='Ενεργό · μόνο εικονικά δεδομένα'&&!document.querySelector('[data-role=owner]').disabled`);
  const lateBeforeClick=await observe(later.sessionId);
  await evaluate(later.sessionId,`document.querySelector('[data-role=owner]').click()`);
  const end=Date.now()+5000;while(sessionPosts!==1&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(sessionPosts,1);
  const result={kind:'SYNTHETIC causal diagnosis / actual Chromium / controlled local HTTP only',at:new Date().toISOString(),sourceRevision:'8b8b8ca518b6bba042758e16893c61ad8e05b97c',sourceBlobs:expected,early:{singleClick:true,beforeClick,afterRelease,sessionPosts:0},separateFreshPage:{singleClick:true,lateBeforeClick,sessionPosts:1,controlledResponseStatus:403},businessDatabase:false,actualLabAcceptance:false,productionRequests:false,actualFailedRunMetaTiming:'NOT CAPTURED; this proves the harness race, not exact request timing of run39679682971',pass:true};
  await fs.writeFile(out+'/reproduction.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await cdp('Target.closeTarget',{targetId:later.targetId});
}finally{
  for(const response of held)response.destroy();
  await cdp('Browser.close').catch(()=>{});browser.kill();for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Diagnostic closed'));}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
