import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {transformSync} from 'esbuild';import {JSDOM} from 'jsdom';
async function mount(transport){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/chat'}),keys=['window','document','navigator','location','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 let token='fixture-session';const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const noop=()=>null,icons=new Proxy({},{get:()=>noop});
 const dependencies={'react':React,'lucide-react':icons,'./store-chat.css':{},'./DocumentScanButton.jsx':noop,'./ChatVideoAttachment.jsx':noop,'./ChatVoicePreview.jsx':noop,'./NativeChatDownload.jsx':noop,'./chat-mobile-session.mjs':{chatToken:()=>token},'./chat-mobile-install.mjs':{mobileChatUrl:id=>'/chat?store='+id,registerChatWorker:async()=>null},'./store-chat-push-diagnostic.mjs':{pushSubscriptionFailure:()=>''}};
 const source=fs.readFileSync(new URL('../../client/src/components/store/StoreChatPanel.jsx',import.meta.url),'utf8'),module={exports:{}};
 new Function('require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(name=>{if(!(name in dependencies))throw Error(name);return dependencies[name]},module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];
 const api=async(path,options={})=>{calls.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});return transport(path,options,calls)};
 const render=async id=>act(async()=>{root.render(React.createElement(module.exports.default,{api,store:{id,companyId:'company',name:id},onClose:noop}));await new Promise(r=>setTimeout(r,0))});
 const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,0))});
 return {dom,act,calls,render,flush,setToken:value=>{token=value},async close(){await act(async()=>root.unmount());dom.window.close();for(const k of keys){const v=previous.get(k);if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}};
}
const message=()=>({id:'message-a',senderId:'other',senderName:'CI Other',body:'Original <script>literal</script>',category:'GENERAL',createdAt:'2026-10-31T12:00:00Z',readByMe:false,deliveredByMe:false,ownMessage:false,reactions:[]});
const payload=(id='a',rows=[message()])=>({store:{id,companyId:'company'},rows,interactionsAvailable:true,settings:{photosEnabled:true,pdfEnabled:true},permissions:{}});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
async function type(h,value){const input=document.querySelector('input[placeholder="Γράψε μήνυμα για το κατάστημα…"]');await h.act(async()=>{Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));});}
test('mounted Chat accepts actual response before delivery ACK, quotes explicitly, and sets/replaces/removes reactions without marking read',async()=>{
 let rows=[message()];const h=await mount(async(path,options)=>{
  if(!options.method)return payload('a',structuredClone(rows));
  if(path.endsWith('/delivered')){rows[0].deliveredByMe=true;return {ok:true,received:1}}
  if(path.endsWith('/reaction')){const reaction=JSON.parse(options.body).reaction;rows[0].reactions=reaction?[{id:'actor',name:'CI actor',reaction,mine:true}]:[];return {ok:true,reaction}}
  if(path.endsWith('/messages'))return {ok:true,id:'sent-message'};
  throw Error('Unexpected API '+path);
 });
 try{
  await h.render('a');await h.flush();assert.equal(h.calls.filter(c=>c.path.endsWith('/delivered')).length,1);assert.deepEqual(h.calls.find(c=>c.path.endsWith('/delivered')).body,{messageIds:['message-a']});
  await h.act(async()=>button('Απάντηση').click());assert.match(document.querySelector('.store-chat-reply-draft').textContent,/Original <script>literal/);assert.equal(document.querySelector('script'),null);
  for(const emoji of ['👍','✅','❤️','❤️'])await h.act(async()=>{document.querySelector(`[aria-label="Αντίδραση ${emoji}"]`).click();await new Promise(r=>setTimeout(r,0))});
  assert.deepEqual(h.calls.filter(c=>c.path.endsWith('/reaction')).map(c=>c.body.reaction),['👍','✅','❤️',null]);
  await type(h,'Actual quoted answer');await h.act(async()=>{document.querySelector('form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});
  const sent=h.calls.find(c=>c.method==='POST'&&c.path.endsWith('/messages'));assert.equal(sent.body.body,'Actual quoted answer');assert.equal(sent.body.replyToId,'message-a');assert.equal(document.querySelector('.store-chat-reply-draft'),null);
  assert.equal(h.calls.some(c=>c.path.endsWith('/read')||c.path.endsWith('/acknowledge')),false,'reply/reaction/delivery never imply human read or announcement acknowledgement');
 }finally{await h.close()}
});
test('mounted quoted send with unknown outcome stops replay until explicit draft discard',async()=>{
 const h=await mount(async(path,options)=>{if(!options.method)return payload('a',[{...message(),deliveredByMe:true}]);if(path.endsWith('/messages'))throw Error('Synthetic connection lost after submission');throw Error(path)});
 try{await h.render('a');await h.flush();await h.act(async()=>button('Απάντηση').click());await type(h,'Unknown send');
  for(let i=0;i<2;i++)await h.act(async()=>{document.querySelector('form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});
  assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.ok(button('Απόρριψη παλιού προσχεδίου'));await h.act(async()=>button('Απόρριψη παλιού προσχεδίου').click());assert.equal(document.querySelector('.store-chat-reply-draft'),null);assert.equal(document.querySelector('input[placeholder="Γράψε μήνυμα για το κατάστημα…"]').value,'');
 }finally{await h.close()}
});
test('late store/session response cannot render private rows or acknowledge old-store delivery',async()=>{
 for(const mode of ['store','session']){
  let release;const h=await mount((path,options)=>{if(options.method)throw Error('No late receipt permitted');if(path.includes('/a/'))return new Promise(r=>release=r);return payload('b',[])});
  try{await h.render('a');if(mode==='store')await h.render('b');else h.setToken('changed-session');await h.act(async()=>{release(payload('a'));await new Promise(r=>setTimeout(r,0))});assert.equal(document.body.textContent.includes('Original <script>literal'),false);assert.equal(h.calls.some(c=>c.method==='POST'),false)}finally{await h.close()}
 }
});
