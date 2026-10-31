import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const chrome=process.env.CHROME_BIN;assert.ok(chrome,'CHROME_BIN required');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mws-monthly-capture-'));
const root=fileURLToPath(new URL('../../',import.meta.url));
const isolate={name:'isolate-unrelated-views',setup(b){
 b.onResolve({filter:/\.jsx$/},a=>{if(a.importer.endsWith('/CommerceHub.jsx')&&!a.path.includes('MonthlyInventoryCapturePanel'))return{path:a.path,namespace:'other'};if(a.importer.endsWith('/CommerceLauncher.jsx')&&!a.path.includes('CommerceHub'))return{path:a.path,namespace:a.path.includes('WholesaleSuiteWorkspace')?'wholesale':'other'}});
 b.onLoad({filter:/.*/,namespace:'other'},()=>({contents:'export default function View(){return null}',loader:'js'}));
 b.onLoad({filter:/.*/,namespace:'wholesale'},()=>({contents:'export default function View(){return null};export const readWholesaleIdentity=()=>({}),wholesaleIdentityKey=()=>"",wholesaleAccessEnabled=()=>false;',loader:'js'}));
}};
// This single-file fixture contains synthetic identities/data only and bundles actual product components.
const fixture=String.raw`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import Hub from './client/src/components/commerce/CommerceHub.jsx';
import Launcher from './client/src/components/commerce/CommerceLauncher.jsx';
const purpose='MONTHLY_INVENTORY_CAPTURE',stamp='2020-01-01T00:00:00.123456Z';
function identity(staff=false,id='owner'){const c={id,companyId:'company',role:staff?'EMPLOYEE':'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session-'+id,sessionVersion:1};localStorage.setItem('token','header.'+btoa(JSON.stringify(c)).replace(/=/g,'')+'.synthetic');localStorage.setItem('user',JSON.stringify({id,role:c.role,company:{id:'company'},...(staff?{staffAccess:true}:{})}));localStorage.setItem('activeModules','["INVENTORY"]')}
identity();window.__requests=[];let saved=null,uncertain=false;
const base=storeId=>({id:'grant-'+storeId,companyId:'company',storeId,purpose,purposeVersion:1,lifecycleGeneration:'0',revision:'1',active:false,delegatorUserId:'owner',delegatorSessionVersion:1,activationId:null,firstIssueMonth:null,createdByUserId:'owner',grantedByUserId:null,revokedByUserId:null,updatedByUserId:'owner',firstScheduledFor:null,createdAt:stamp,grantedAt:null,revokedAt:null,updatedAt:stamp});
const api=async(path,options={})=>{const u=new URL(path,'https://synthetic.invalid');if(u.pathname==='/api/license/current')return{modules:[],activeModules:['INVENTORY']};if(u.pathname==='/api/stores')return[{id:'selected',name:'Selected'}];if(!u.pathname.startsWith('/api/monthly-inventory-capture'))return{};const body=options.body?JSON.parse(options.body):null;window.__requests.push({path:u.pathname,method:options.method||'GET',storeId:body?.storeId||u.searchParams.get('storeId'),body});if(!body)return{status:'READ',companyId:'company',storeId:u.searchParams.get('storeId'),lifecycleGeneration:'0',purpose,grant:saved};if(uncertain){uncertain=false;throw Error('synthetic lost response')}
if(u.pathname.endsWith('/create-inactive')){saved=base(body.storeId);return{status:'CREATED_INACTIVE',grant:saved}}if(u.pathname.endsWith('/enable')){saved={...saved,revision:'2',active:true,activationId:'activation',firstIssueMonth:'2020-01',firstScheduledFor:'2020-02-01T05:00:00.000000Z',grantedAt:stamp,grantedByUserId:'owner'};return{status:'ENABLED',grant:saved}}saved={...saved,revision:'3',active:false,revokedAt:stamp,revokedByUserId:'owner'};return{status:'REVOKED',grant:saved}};
window.fetch=async(path,options)=>({ok:true,json:()=>api(path,options)});
function App(){const[mode,setMode]=useState('hub'),[store,setStore]=useState('selected'),[key,setKey]=useState(0);window.__fixture={missing:()=>setStore(''),other:()=>{saved=null;setStore('other')},identity:()=>identity(false,'other-owner'),uncertain:()=>{uncertain=true},launcher:staff=>{identity(staff);setMode('launcher');setKey(k=>k+1)},open:()=>window.dispatchEvent(new CustomEvent('mws:commerce-open',{detail:{view:'operations',storeId:'selected'}}))};return mode==='hub'?<Hub api={api} stores={[{id:'other',name:'Other'},{id:'selected',name:'Selected <img src=x>'}]} activeStoreId={store}/>:<Launcher key={key}/>}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'monthly-capture-fixture.jsx',loader:'jsx'},bundle:true,outfile:path.join(directory,'fixture.js'),platform:'browser',format:'iife',loader:{'.css':'empty'},plugins:[isolate],define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
const css=await fs.readFile(path.join(root,'client/src/components/commerce/commerce-hub.css'),'utf8');
await fs.writeFile(path.join(directory,'index.html'),'<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+css+'</style><div id="root"></div><script src="fixture.js"></script></html>');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--no-startup-window',`--user-data-dir=${path.join(directory,'profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
const exited=new Promise(resolve=>{browser.once('exit',resolve);browser.once('error',resolve)});
let id=0,buffer='',stderr='',primaryError;const requests=new Map();
const rejectRequests=error=>{for(const r of requests.values()){clearTimeout(r.timer);r.reject(error)}requests.clear()};
browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000)});browser.once('exit',()=>rejectRequests(Error('Chromium exited')));browser.stdio[3].on('error',rejectRequests);browser.stdio[4].on('error',rejectRequests);
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
  await waitFor(sessionId,"document.querySelector('.commerce-hub')");
  await click(sessionId,'Εξουσιοδότηση μηνιαίας απογραφής');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture')");
  assert.equal(await evaluate(sessionId,'window.__requests.length'),0);
  assert.equal(await evaluate(sessionId,"document.querySelectorAll('.monthly-inventory-capture img').length"),0);
  assert.equal(await evaluate(sessionId,"document.querySelector('.commerce-hub > .panel p[aria-label]').textContent.includes('Selected <img src=x>')"),true);
  await click(sessionId,'Έλεγχος κατάστασης');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture').textContent.includes('Δεν υπάρχει προσωπική εξουσιοδότηση')");
  assert.equal(await evaluate(sessionId,'window.__requests.at(-1).storeId'),'selected');
  await click(sessionId,'Δημιουργία ανενεργής εξουσιοδότησης');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture input[type=checkbox]')");
  assert.equal(await evaluate(sessionId,"[...document.querySelectorAll('button')].find(b=>b.textContent==='Ενεργοποίηση εξουσιοδότησης').disabled"),true);
  const point=await evaluate(sessionId,"(()=>{const c=document.querySelector('.monthly-inventory-capture input');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  await click(sessionId,'Ενεργοποίηση εξουσιοδότησης');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture').textContent.includes('Αρχική επιλέξιμη')");
  const enabled=await evaluate(sessionId,"({text:document.querySelector('.monthly-inventory-capture').textContent,request:window.__requests.at(-1),overflow:document.documentElement.scrollWidth>innerWidth+2})");assert.match(enabled.text,/2020/);assert.equal(enabled.request.body.purpose,'MONTHLY_INVENTORY_CAPTURE');assert.equal(enabled.overflow,false);
  // A native Enter default activation must revoke exactly once, with a trusted click.
  const before=await evaluate(sessionId,"(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Ανάκληση εξουσιοδότησης');b.focus();window.__trusted=[];b.addEventListener('click',e=>window.__trusted.push(e.isTrusted));return window.__requests.length})()");
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},sessionId);
  await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture').textContent.includes('Ανακλημένη προσωπική')");assert.deepEqual(await evaluate(sessionId,'window.__trusted'),[true]);assert.equal(await evaluate(sessionId,'window.__requests.length'),before+1);
  await evaluate(sessionId,'window.__fixture.other()');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture').textContent.includes('Other')&&!document.querySelector('.monthly-inventory-capture div[aria-label]')");
  await click(sessionId,'Έλεγχος κατάστασης');await waitFor(sessionId,"document.querySelector('.mic-actions button')");await evaluate(sessionId,'window.__fixture.uncertain()');await click(sessionId,'Δημιουργία ανενεργής εξουσιοδότησης');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture [role=alert]')");assert.equal(await evaluate(sessionId,"document.querySelector('.mic-actions')===null"),true);
  const uncertainCount=await evaluate(sessionId,'window.__requests.length');await click(sessionId,'Έλεγχος κατάστασης');await waitFor(sessionId,"document.querySelector('.mic-actions button')");assert.equal(await evaluate(sessionId,'window.__requests.length'),uncertainCount+1);
  await evaluate(sessionId,'window.__fixture.identity()');const identityBefore=await evaluate(sessionId,'window.__requests.length');await click(sessionId,'Δημιουργία ανενεργής εξουσιοδότησης');assert.equal(await evaluate(sessionId,'window.__requests.length'),identityBefore);await waitFor(sessionId,"!document.querySelector('.mic-actions')");
  await evaluate(sessionId,'window.__fixture.missing()');await waitFor(sessionId,"document.querySelector('.monthly-inventory-capture').textContent.includes('Καμία επιλογή')");assert.equal(await evaluate(sessionId,"document.querySelector('.monthly-inventory-capture button')===null"),true);
  // Bundle and exercise the real, unchanged Launcher, including staffAccess denial.
  await evaluate(sessionId,'window.__fixture.launcher(true)');await waitFor(sessionId,"!document.querySelector('.commerce-hub')");await evaluate(sessionId,'window.__fixture.open()');assert.equal(await evaluate(sessionId,"document.querySelector('.commerce-overlay')===null"),true);
  await evaluate(sessionId,'window.__fixture.launcher(false)');await waitFor(sessionId,"document.querySelector('.commerce-fab')||document.querySelector('.commerce-launcher')||document.querySelector('button')");await evaluate(sessionId,'window.__fixture.open()');await waitFor(sessionId,"document.querySelector('.commerce-hub')");await click(sessionId,'Εξουσιοδότηση μηνιαίας απογραφής');await click(sessionId,'Έλεγχος κατάστασης');await waitFor(sessionId,"window.__requests.at(-1).storeId==='selected'");
  await cdp('Target.closeTarget',{targetId});
 }
 console.log('Chromium monthly inventory capture passed: actual panel/Hub/unchanged Launcher; desktop/mobile pointer and native Enter, scoped inactive/enable/revoke, uncertain POST reconciliation, identity refusal and staff denial. Synthetic only.');
}catch(error){primaryError=error;throw error}
finally{
 try{if(browser.exitCode===null&&browser.signalCode===null){await Promise.race([cdp('Browser.close').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);const stopped=await Promise.race([exited.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]);if(!stopped){browser.kill('SIGKILL');await exited}}await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(error){if(primaryError)console.error('Chromium cleanup also failed:',error);else throw error}
}
