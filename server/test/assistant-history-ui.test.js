import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const threadId=randomUUID(),messageId=randomUUID();
const snapshot=()=>({available:true,generation:'9007199254740993',historical:true,expired:false,revision:3,expiresAt:'2026-11-18T12:00:00Z',archive:{schemaVersion:1,threads:[{id:threadId,title:'Saved thread',files:[{name:'NEVER RESTORE.csv'}],messages:[{id:messageId,role:'assistant',content:'SAVED HISTORICAL PROSE',createdAt:'2026-10-18T12:00:00Z',requiredCapabilities:['cash_details'],result:{answer:'FORGED',exportTicket:'OLD PRIVATE TICKET'},exportTicket:'OLD PRIVATE TICKET'}]}]}});
async function fixture({hold=false,missing=false,all=false,expired=false}={}){
 const {build}=await import('esbuild'),bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AssistantChatPage.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const m={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{JSDOM}=await import('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 window.localStorage.setItem('token','fixture.'+Buffer.from(JSON.stringify({id:'admin',role:'SUPER_ADMIN',platformRole:'SUPER_ADMIN',isSuperAdmin:true,tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:1,companyId:'c',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture');
 window.HTMLElement.prototype.attachEvent=()=>{};window.HTMLElement.prototype.detachEvent=()=>{};let recording;class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,'isSecureContext',{value:true});
 const asks=[],loads=[];let generation='9007199254740993';let receipt={saved:true,revision:4,expiresAt:'2026-11-18T12:00:00Z'};
 const api=async(path,opts={})=>{
  if(path.endsWith('/history/reset'))return {...snapshot(),expired:false,revision:4,archive:{schemaVersion:1,threads:[]}};
  if(path.includes('/history')){if(generation!=='9007199254740993')return {...snapshot(),generation,revision:0,archive:{schemaVersion:1,threads:[]}};if(expired)return {...snapshot(),expired:true,archive:{schemaVersion:1,threads:[]}};if(missing)throw new Error('Unavailable');if(hold)return new Promise(resolve=>loads.push({resolve,signal:opts.signal}));loads.push({signal:opts.signal});return snapshot()}
  if(opts.method==='POST'){const body=JSON.parse(opts.body);asks.push(body);return {scope:body.selection,answer:'FRESH ANSWER',evidence:[],historyReceipt:receipt}}
  const params=new URL(path,'https://fixture.invalid').searchParams;return {available:true,scope:{companyId:'c',storeId:params.get('storeId')||'s'},supported:['cash_details'],historyGeneration:generation};
 };
 const props={open:true,mode:'platform',api,companies:[{id:'c',active:true,stores:[{id:'s',active:true},{id:'s2',active:true}]}],initialSelection:{companyId:'c',storeId:'s'},initialAllScope:all},root=createRoot(document.getElementById('root'));
 const render=p=>act(async()=>root.render(React.createElement(m.exports.default,p))),click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))),input=async text=>{await click(document.querySelector('.mws-voice-input-actions button'));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:text}],{isFinal:true})]});recording.onend()})},ask=async text=>{await input(text);await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))},resolve=async(index=0,value=snapshot())=>act(async()=>loads[index].resolve(value));
 await render(props);return {props,render,click,input,ask,resolve,asks,loads,changeGeneration:async value=>{generation=value;await act(async()=>window.dispatchEvent(new window.Event("focus")))},receipt:v=>receipt=v,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}};
}
test('mounted history restores labeled dated prose without old tickets/files/evidence, then sends server persistence metadata',async()=>{
 const f=await fixture();try{assert.match(document.body.textContent,/SAVED HISTORICAL PROSE/);assert.match(document.body.textContent,/Ιστορικό/);assert.match(document.body.textContent,/18\/10\/2026/);assert.equal(document.querySelectorAll('.mws-chat-exports').length,0);assert.equal(document.querySelectorAll('.mws-chat-files').length,0);assert.doesNotMatch(document.body.textContent,/OLD PRIVATE|NEVER RESTORE|FORGED/);
  await f.ask('Και χθες;');assert.equal(f.asks.length,1);assert.equal(f.asks[0].conversation.threadId,threadId);assert.equal(f.asks[0].conversation.expectedRevision,3);assert.equal(f.asks[0].conversation.generation,'9007199254740993');assert.match(f.asks[0].conversation.requestId,/^[a-f0-9-]{36}$/);assert.match(document.body.textContent,/FRESH ANSWER/);
  await f.ask('Και σήμερα;');assert.equal(f.asks[1].conversation.expectedRevision,4);
 }finally{await f.close()}
});
test('late history cannot replace a draft or new thread and cannot silently enable persistence after interaction',async()=>{
 const f=await fixture({hold:true});try{await f.input('Νέα δική μου ερώτηση');await f.click(document.querySelector('.mws-chat-new'));await f.resolve();assert.doesNotMatch(document.body.textContent,/SAVED HISTORICAL PROSE/);await f.ask('Νέα ερώτηση');assert.equal(f.asks[0].conversation,undefined);assert.match(document.body.textContent,/μόνο σε αυτή τη συνεδρία/)}finally{await f.close()}
});
test('late history from a closed page, previous selected store or previous session is discarded',async t=>{
 for(const boundary of ['close','store','session'])await t.test(boundary,async()=>{const f=await fixture({hold:true});try{
  await f.render({...f.props,...(boundary==='close'?{open:false}:boundary==='store'?{initialSelection:{companyId:'c',storeId:'s2'}}:{contextEpoch:1})});assert.equal(f.loads[0].signal.aborted,true);await f.resolve();assert.doesNotMatch(document.body.textContent,/SAVED HISTORICAL PROSE/);
 }finally{await f.close()}})
});
test('missing schema and all-store scope remain session-only; an unconfirmed save is visible and never replays a question',async()=>{
 for(const options of [{missing:true},{all:true}]){const f=await fixture(options);try{await f.ask('Νέα ερώτηση');assert.equal(f.asks.length,1);assert.equal(f.asks[0].conversation,undefined);assert.match(document.body.textContent,/συνεδρία/);if(options.all)assert.equal(f.loads.length,0)}finally{await f.close()}}
 const f=await fixture();try{f.receipt({saved:false,reason:'CONFLICT'});await f.ask('Πρώτη ερώτηση');assert.equal(f.asks.length,1);assert.match(document.body.textContent,/Η απάντηση δεν αποθηκεύτηκε/);await f.ask('Δεύτερη ερώτηση');assert.equal(f.asks.length,2);assert.equal(f.asks[1].conversation,undefined)}finally{await f.close()}
});

test('expired history starts a new empty revision only after an explicit click, then enables later server capture',async()=>{const f=await fixture({expired:true});try{assert.doesNotMatch(document.body.textContent,/SAVED HISTORICAL PROSE/);const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Νέο ιστορικό 30 ημερών');assert.ok(button);await f.click(button);assert.match(document.body.textContent,/Θα αποθηκεύονται οι επόμενες/);f.receipt({saved:true,revision:5,expiresAt:'2026-11-18T12:00:00Z'});await f.ask('Νέα ερώτηση');assert.equal(f.asks.length,1);assert.equal(f.asks[0].conversation.expectedRevision,4)}finally{await f.close()}});

test('a changed store generation withdraws displayed and closed-page old history before loading the new generation',async t=>{for(const boundary of ['active','reopen'])await t.test(boundary,async()=>{const f=await fixture();try{assert.match(document.body.textContent,/SAVED HISTORICAL PROSE/);if(boundary==='reopen')await f.render({...f.props,open:false});await f.changeGeneration('9007199254740994');if(boundary==='reopen')await f.render(f.props);assert.doesNotMatch(document.body.textContent,/SAVED HISTORICAL PROSE/);await f.ask('Νέα ερώτηση');assert.equal(f.asks[0].conversation.generation,'9007199254740994');assert.equal(f.asks[0].conversation.expectedRevision,0)}finally{await f.close()}})});
