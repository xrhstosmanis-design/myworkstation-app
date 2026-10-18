import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
async function fixture(){
 const {build}=await import('esbuild'),out=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AssistantChatPage.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{JSDOM}=await import('jsdom');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 window.HTMLElement.prototype.attachEvent=()=>{};window.HTMLElement.prototype.detachEvent=()=>{};
 let recording;class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,'isSecureContext',{value:true});
 const scope={companyId:'c',storeId:'s'},downloads=[],exports=[];let hold=false,late;
 const api=async(path,opts={})=>{
  if(opts.method!=='POST')return {available:true,scope,supported:['consumption_details']};
  if(path.endsWith('/export')){exports.push(opts);if(hold)return new Promise(r=>late=r);return {filename:`export-${exports.length}.csv`,generatedAt:'2026-10-18T10:00:00Z'}}
  return {scope,answer:'Fixture report',evidence:[],exportTicket:'fixture-ticket'};
 };
 const root=createRoot(document.getElementById('root')),props={open:true,mode:'platform',api,companies:[{id:'c',active:true,stores:[{id:'s',active:true},{id:'s2',active:true}]}],initialSelection:scope,download:f=>downloads.push(f)};
 const render=p=>act(async()=>root.render(React.createElement(m.exports.default,p))),click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))),input=async value=>{await click(document.querySelector('.mws-voice-input-actions button'));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:value}],{isFinal:true})]});recording.onend()})},ask=async text=>{await input(text);await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))},select=async title=>click([...document.querySelectorAll('.mws-chat-sidebar nav button')].find(b=>b.textContent===title)),files=()=>[...document.querySelectorAll('.mws-chat-files span')].map(el=>el.textContent),manual=()=>click(document.querySelector('.mws-chat-exports button'));
 await render(props);
 return {scope,props,render,click,ask,select,files,manual,downloads,exports,hold:()=>{hold=true},resolve:async()=>act(async()=>late({filename:'LATE.csv'})),close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}};
}
test('mounted conversations own automatic/manual filename history, restore on revisit and keep bounded memory without repeat downloads',async()=>{
 const f=await fixture();try{
  await f.ask('Πρώτη αναφορά σε CSV');assert.deepEqual(f.files(),['export-1.csv']);await f.manual();assert.deepEqual(f.files(),['export-1.csv','export-2.csv']);
  await f.click(document.querySelector('.mws-chat-new'));assert.deepEqual(f.files(),[]);assert.equal(document.querySelectorAll('.mws-chat-message').length,0);
  await f.ask('Δεύτερη αναφορά σε CSV');assert.deepEqual(f.files(),['export-3.csv']);
  await f.select('Πρώτη αναφορά σε CSV');assert.deepEqual(f.files(),['export-1.csv','export-2.csv']);
  await f.render({...f.props,open:false});await f.render(f.props);assert.deepEqual(f.files(),['export-1.csv','export-2.csv']);assert.equal(f.downloads.length,3);
  for(let i=0;i<8;i++)await f.manual();assert.equal(f.files().length,8);assert.deepEqual(f.files(),Array.from({length:8},(_,i)=>`export-${i+4}.csv`));
  await f.select('Δεύτερη αναφορά σε CSV');assert.deepEqual(f.files(),['export-3.csv']);assert.equal(f.downloads.length,11);
  for(let i=0;i<9;i++)await f.click(document.querySelector('.mws-chat-new'));assert.equal(document.querySelectorAll('.mws-chat-sidebar nav button').length,8);assert.deepEqual(f.files(),[]);
 }finally{await f.close()}
});
test('pending automatic exports cannot download or attach filenames after conversation, cancellation, close or security-boundary changes',async t=>{
 for(const boundary of ['new','select','cancel','close','store','session'])await t.test(boundary,async()=>{
  const f=await fixture();try{
   await f.ask('Πρώτη αναφορά σε CSV');await f.click(document.querySelector('.mws-chat-new'));
   f.hold();await f.ask('Δεύτερη αναφορά σε CSV');assert.equal(f.exports.length,2);assert.deepEqual(f.files(),[]);
   if(boundary==='new')await f.click(document.querySelector('.mws-chat-new'));
   if(boundary==='select')await f.select('Πρώτη αναφορά σε CSV');
   if(boundary==='cancel')await f.click(document.querySelector('.mws-chat-stop'));
   if(boundary==='close')await f.render({...f.props,open:false});
   if(boundary==='store')await f.render({...f.props,initialSelection:{companyId:'c',storeId:'s2'}});
   if(boundary==='session'){window.localStorage.setItem('token','changed-session');await f.render({...f.props,contextEpoch:1})}
   assert.equal(f.exports[1].signal.aborted,true,boundary);await f.resolve();assert.equal(f.downloads.length,1,boundary);
   if(boundary==='close')await f.render(f.props);
   assert.deepEqual(f.files(),boundary==='select'?['export-1.csv']:[],boundary);
   assert.doesNotMatch(document.body.textContent,/LATE.csv/);
  }finally{await f.close()}
 });
});
