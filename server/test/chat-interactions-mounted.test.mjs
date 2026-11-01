import test from 'node:test';import assert from 'node:assert/strict';import {mount} from './helpers/store-chat-mount.mjs';
const message=()=>({id:'message-a',senderId:'other',senderName:'CI Other',body:'Original <script>literal</script>',category:'GENERAL',createdAt:'2026-10-31T12:00:00Z',readByMe:false,deliveredByMe:false,ownMessage:false,reactions:[]});
const payload=(id='a',rows=[message()])=>({store:{id,companyId:'company'},rows,interactionsAvailable:true,settings:{photosEnabled:true,pdfEnabled:true},permissions:{}});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
async function openActions(h){await h.act(async()=>document.querySelector('.store-chat-messages article').click())}
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
  await openActions(h);await h.act(async()=>button('Απάντηση').click());assert.match(document.querySelector('.store-chat-reply-draft').textContent,/Original <script>literal/);assert.equal(document.querySelector('script'),null);
  for(const emoji of ['👍','✅','❤️','❤️']){await openActions(h);await h.act(async()=>{document.querySelector(`[aria-label="Αντίδραση ${emoji}"]`).click();await new Promise(r=>setTimeout(r,0))});}
  assert.deepEqual(h.calls.filter(c=>c.path.endsWith('/reaction')).map(c=>c.body.reaction),['👍','✅','❤️',null]);
  await type(h,'Actual quoted answer');await h.act(async()=>{document.querySelector('form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});
  const sent=h.calls.find(c=>c.method==='POST'&&c.path.endsWith('/messages'));assert.equal(sent.body.body,'Actual quoted answer');assert.equal(sent.body.replyToId,'message-a');assert.equal(document.querySelector('.store-chat-reply-draft'),null);
  assert.equal(h.calls.some(c=>c.path.endsWith('/read')||c.path.endsWith('/acknowledge')),false,'reply/reaction/delivery never imply human read or announcement acknowledgement');
 }finally{await h.close()}
});
test('mounted quoted send with unknown outcome stops replay until explicit draft discard',async()=>{
 const h=await mount(async(path,options)=>{if(!options.method)return payload('a',[{...message(),deliveredByMe:true}]);if(path.endsWith('/messages'))throw Error('Synthetic connection lost after submission');throw Error(path)});
 try{await h.render('a');await h.flush();await openActions(h);await h.act(async()=>button('Απάντηση').click());await type(h,'Unknown send');
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
