// Local synthetic PDFs, real client PDF.js worker and React. No signed-in session.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import PDFDocument from 'pdfkit';
import assert from 'node:assert/strict';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=await fs.mkdtemp(path.join(os.tmpdir(),'mws-file-page-count-'));
const clientRequire=createRequire(path.join(repo,'client/package.json'));
const worker=await fs.readFile(clientRequire.resolve('pdfjs-dist/build/pdf.worker.min.mjs'));
const makePdf=(pages,locked=false)=>new Promise((resolve,reject)=>{
  const doc=new PDFDocument({autoFirstPage:false,...(locked?{userPassword:'synthetic-count-only'}:{})}),parts=[];
  doc.on('data',b=>parts.push(b));doc.on('error',reject);doc.on('end',()=>resolve('data:application/pdf;base64,'+Buffer.concat(parts).toString('base64')));
  for(let i=0;i<pages;i++)doc.addPage().text(`SYNTHETIC PAGE COUNT ONLY ${i+1}/${pages}`);
  doc.end();
});
const [one,two,five,six,locked]=await Promise.all([makePdf(1),makePdf(2),makePdf(5),makePdf(6),makePdf(2,true)]);
const invalid='data:application/pdf;base64,'+Buffer.from('%PDF-invalid').toString('base64');
const image='data:image/png;base64,iVBORw0KGgo=';
const scenarios=[
  {name:'one',sources:[one],text:['1 αρχείο','1 φυσική σελίδα PDF']},
  {name:'two',sources:[two],text:['1 αρχείο','2 φυσικές σελίδες PDF']},
  {name:'five',sources:[five],text:['5 φυσικές σελίδες PDF']},
  {name:'six-not-capped',sources:[six],text:['6 φυσικές σελίδες PDF']},
  {name:'invalid',sources:[invalid],text:['άγνωστο πλήθος σελίδων PDF']},
  {name:'encrypted',sources:[locked],text:['άγνωστο πλήθος σελίδων PDF']},
  {name:'image-is-not-pdf-page-proof',sources:[image],text:['1 εικόνα','δεν επιβεβαιώνει πλήθος φυσικών σελίδων']},
  {name:'mixed',sources:[two,image,one],text:['3 αρχεία','Αρχείο 1: 2 φυσικές σελίδες PDF','Αρχείο 3: 1 φυσική σελίδα PDF']}
];
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Summary from './client/src/components/store/InvoiceFilePageSummary.jsx';const root=createRoot(document.getElementById('root'));window.renderCount=(sources,scope)=>{window.retained=sources;root.render(<Summary pages={sources.map(dataUrl=>({dataUrl}))} scopeKey={scope}/>)};window.removeCount=()=>root.unmount();window.ready=true;`,resolveDir:repo,loader:'jsx'},bundle:true,outfile:path.join(out,'fixture.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error',plugins:[{name:'local-pdf-worker-url',setup(b){b.onResolve({filter:/pdf\.worker\.min\.mjs\?url$/},()=>({path:'worker',namespace:'fixture-worker'}));b.onLoad({filter:/.*/,namespace:'fixture-worker'},()=>({contents:'export default "/pdf.worker.mjs";',loader:'js'}))}}]});
const javascript=await fs.readFile(path.join(out,'fixture.js'));
const html=Buffer.from('<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:16px;font:16px Arial}#root{max-width:900px}</style><div id="root"></div><script>window.calls=0;window.fetch=()=>{window.calls++;throw Error("No document/provider fetch allowed")};</script><script src="/fixture.js"></script>');
const requested=[];
const server=http.createServer((req,res)=>{
  requested.push(req.url);
  if(req.method!=='GET'){res.writeHead(405);res.end();return}
  const resource=req.url==='/'?[html,'text/html; charset=utf-8']:req.url==='/fixture.js'?[javascript,'text/javascript']:req.url==='/pdf.worker.mjs'?[worker,'text/javascript']:null;
  if(resource){res.writeHead(200,{'content-type':resource[1]});res.end(resource[0])}else{res.writeHead(req.url==='/favicon.ico'?204:404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=spawn(process.env.CHROME_BIN,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run',...(process.env.POS_UI_CHROMIUM_PACKED==='1'?['--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(out,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId=0,buffer='',errors='';const pending=new Map(),observations=[];
browser.stderr.on('data',b=>{errors=(errors+b).slice(-2000)});
browser.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const message=JSON.parse(raw),request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timeout);if(message.error)request.reject(Error(JSON.stringify(message.error)));else request.resolve(message.result)}}});
const cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId,timeout=setTimeout(()=>{pending.delete(id);reject(Error(`${method} timed out: ${errors}`))},15000);pending.set(id,{resolve,reject,timeout});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')});
try{
  for(const [width,height]of [[1366,768],[390,844]]){
    const {targetId}=await cdp('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);await cdp('Page.enable',{},sessionId);await cdp('Page.navigate',{url:origin},sessionId);
    const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value};
    let ready=false;for(let i=0;i<100;i++){if(await evaluate('window.ready===true')){ready=true;break}await new Promise(r=>setTimeout(r,30))}assert.ok(ready,'fixture must load');
    for(const scenario of scenarios){
      await evaluate(`window.renderCount(${JSON.stringify(scenario.sources)},${JSON.stringify(width+':'+scenario.name)})`);
      let text='';for(let i=0;i<180;i++){text=await evaluate('document.body.textContent');if(scenario.text.every(value=>text.includes(value))&&!text.includes('καταμέτρηση σελίδων PDF…'))break;await new Promise(r=>setTimeout(r,30))}
      for(const expected of scenario.text)assert.ok(text.includes(expected),`${width}/${scenario.name}: missing ${expected}; got ${text}`);
      assert.ok(text.includes('Η καταμέτρηση δεν επιβεβαιώνει πλήρη ανάγνωση OCR'));
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,'no narrow horizontal overflow');
      assert.equal(await evaluate('window.calls'),0,'no provider or document fetch');
      assert.deepEqual(await evaluate('window.retained'),scenario.sources,'original data URLs unchanged');
      observations.push({width,case:scenario.name,text:text.trim(),sourceUnchanged:true,documentFetches:0});
      if(scenario.name==='two'&&process.env.OCR4_PDF_COUNT_SCREENSHOTS){const dir=process.env.OCR4_PDF_COUNT_SCREENSHOTS;await fs.mkdir(dir,{recursive:true});const shot=await cdp('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(path.join(dir,`two-page-${width}.png`),Buffer.from(shot.data,'base64'))}
    }
    await evaluate('window.renderCount([],"empty")');for(let i=0;i<20&&await evaluate('Boolean(document.querySelector(".invoice-file-page-summary"))');i++)await new Promise(r=>setTimeout(r,10));assert.equal(await evaluate('Boolean(document.querySelector(".invoice-file-page-summary"))'),false);
    await evaluate('window.removeCount()');await cdp('Target.closeTarget',{targetId});
  }
  assert.ok(requested.every(url=>['/','/fixture.js','/pdf.worker.mjs','/favicon.ico'].includes(url)));
  if(process.env.OCR4_PDF_COUNT_SCREENSHOTS)await fs.writeFile(path.join(process.env.OCR4_PDF_COUNT_SCREENSHOTS,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  console.log('Invoice file page count actual Chromium PASS '+observations.length+' cases; local synthetic PDFs only, no hosted OCR/LAB acceptance.');
}finally{
  const exited=browser.exitCode!==null?Promise.resolve():new Promise(r=>browser.once('exit',r));await cdp('Browser.close').catch(()=>{});browser.kill();await exited;await new Promise(r=>server.close(r));await fs.rm(out,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
