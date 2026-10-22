import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const directory=new URL('../../client/src/components/store/',import.meta.url);
const css=(await Promise.all(['store-pos.css','store-pos-standard-modals.css','store-pos-payments-menu.css','store-pos-open-invoices.css','store-pos-new-invoice.css','store-pos-payroll.css','pos-dialog-frame.css'].map(f=>readFile(new URL(f,directory),'utf8')))).join('\n').replace(/@import\s+[^;]+;/g,'');
const compiled=await build({entryPoints:[fileURLToPath(new URL('StorePosStandardModals.jsx',directory))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
async function mountedMarkup(mode){
 const dom=new JSDOM('<button id="background">Background checkout</button><div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='fetch'?async()=>{throw Error('Network forbidden')}:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.querySelector('#root'));let closes=0;const writes=[];
 const api=async(url,opts={})=>{if(opts.method&&opts.method!=='GET'){writes.push(url);throw Error('Writes forbidden')}
  if(url.endsWith('/overview'))return {openSession:{id:'session',openedAt:new Date().toISOString()},suppliers:[{id:'supplier',name:'ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΡΟΜΗΘΕΥΤΗΣ'}]};
  if(url.endsWith('/access'))return {access:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true}};
  if(url.endsWith('/sales/recent'))return {rows:[{id:'sale',source:'POS',sessionId:'session',total:33,fiscalStatus:'NON_FISCAL',lines:Array.from({length:15},(_,i)=>({id:'line'+i,description:'ΕΛΛΗΝΙΚΟ ΠΡΟΪΟΝ ΜΕ ΜΕΓΑΛΗ ΠΕΡΙΓΡΑΦΗ '+i,quantity:1,unitPrice:2.2,lineTotal:2.2}))}]};
  if(url.endsWith('/holds'))return {rows:Array.from({length:15},(_,i)=>({id:'hold'+i,total:33}))};
  if(url.includes('supplier-open-invoices'))return {items:[],advances:[]};
  if(url.includes('/capability'))throw Error('AI unavailable in isolated test');
  return {items:[],rows:[]};
 };
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{active:mode==='SUPPLIER'?'PAYMENTS':mode,api,store:{id:'fixture',name:'Isolated'},cart:[{id:'p',name:'ΠΡΟΪΟΝ',quantity:2}],total:33,onClose:()=>closes++,setMessage:()=>{},setError:()=>{},runtimeAccess:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true}})));
  if(mode==='SUPPLIER'){const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Πληρωμή προμηθευτή');assert.ok(b);await act(async()=>b.click())}
  const overlay=document.querySelector('.pos-standard-modal');assert.ok(overlay);const before=closes;
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  // Existing close callback is the only Escape action; no submissions occur.
  const keyboard={role:overlay.getAttribute('role'),ariaModal:overlay.getAttribute('aria-modal'),escapeCloses:closes>before};
  assert.deepEqual(writes,[]);assert.deepEqual(keyboard,{role:'dialog',ariaModal:'true',escapeCloses:true});return {html:document.body.innerHTML,keyboard};
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
}
let chrome=process.env.CHROME_BIN;for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])if(!chrome){try{await access(bin);chrome=bin}catch{}}
const verify=`try{const check=(v,m)=>{if(!v)throw Error(m)},R=e=>e.getBoundingClientRect(),overlay=document.querySelector('.pos-standard-modal'),panel=overlay.querySelector(':scope>section'),main=panel.querySelector(':scope>main'),header=panel.querySelector(':scope>header'),p=R(panel);check(p.left>=0&&p.right<=innerWidth+1&&p.top>=0&&p.bottom<=innerHeight+1,'panel inside viewport');check(main.clientWidth>=250,'usable modal width');check(main.scrollWidth<=main.clientWidth+1,'modal horizontal clipping '+main.scrollWidth+'/'+main.clientWidth);const close=header.querySelector('button'),c=R(close);check(c.width>=40&&c.height>=40,'close touch target');check(close.contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2)),'close exposed');let checked=0;for(const el of main.querySelectorAll('button,input:not([type=hidden]),select,textarea')){if(getComputedStyle(el).display==='none'||!el.getClientRects().length)continue;el.scrollIntoView({block:'nearest',inline:'nearest'});const r=R(el),m=R(main);check(r.width>=20&&r.height>=20,'control measurable '+el.textContent);check(r.left>=m.left-1&&r.right<=m.right+1,'control width inside modal '+el.textContent);check(r.top>=m.top-1&&r.bottom<=m.bottom+1,'control vertically reachable '+el.textContent);check(el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'control hit target '+el.textContent+' / actual '+document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,100)+' rect '+JSON.stringify({el:[r.x,r.y,r.width,r.height],parent:el.parentElement.getBoundingClientRect().toJSON(),details:document.querySelector(".pos-return-details")?.getBoundingClientRect().toJSON()}));checked++}check(checked>0,'controls checked');document.body.dataset.result='PASS'}catch(e){document.body.dataset.result='FAIL:'+e.message}`;
for(const mode of ['CUSTOMER','HOLDS','MIXED','RETURN','SUPPLIER'])test(`actual ${mode} modal reachable at compact and zoom-equivalent viewports`,{skip:!chrome&&!process.env.CI,timeout:120000},async()=>{
 assert.ok(chrome,'Chromium required in CI');const {html}=await mountedMarkup(mode);
 for(const [width,height] of [[1024,768],[1366,768],[819,614],[683,512]]){
  const temp=await mkdtemp(path.join(tmpdir(),'mws-pos-modal-'));try{const file=path.join(temp,'fixture.html');await writeFile(file,'<!doctype html><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}'+css+'</style>'+html+'<script>'+verify+'</script>');
   const result=await new Promise((resolve,reject)=>{const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--window-size=${width},${height}`,'--user-data-dir='+path.join(temp,'profile'),'--virtual-time-budget=1000','--dump-dom','file://'+file],{timeout:25000,killSignal:'SIGKILL'});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}))});
   assert.equal(result.code,0,result.err.slice(-600));assert.equal(result.out.match(/<body[^>]*data-result="([^"]*)"/)?.[1],'PASS',`${mode} ${width}x${height}: ${result.out.match(/data-result="[^"]*"/)?.[0]||result.err.slice(-600)}`);
  }finally{await rm(temp,{recursive:true,force:true})}
 }
});
