import test from 'node:test';import assert from 'node:assert/strict';import {mount} from './helpers/store-chat-mount.mjs';
const row=(id='original',body='Current message')=>({id,body,senderId:'other',senderName:'CI Other',category:'GENERAL',createdAt:'2026-11-01T00:00:00Z',readByMe:false,deliveredByMe:true,reactions:[]});
const store={id:'a',companyId:'company',name:'a'};
const payload=()=>({store,rows:[row()],interactionsAvailable:true,searchForwardAvailable:true,settings:{},permissions:{canForward:true}});
const targets=()=>({store,stores:[{id:'destination',companyId:'company',companyName:'CI Company',name:'CI Destination'}]});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
async function click(h,text){await h.act(async()=>{assert.ok(button(text),text);button(text).click();await new Promise(r=>setTimeout(r,0))});}
async function type(h,selector,value){const input=document.querySelector(selector);assert.ok(input,selector);await h.act(async()=>{Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));});}
async function select(h,value){await h.act(async()=>{const input=document.querySelector('select[aria-label="Συνομιλία προορισμού"]');input.value=value;input.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));});}
async function openSearch(h){await click(h,'Αναζήτηση');await click(h,'Αναζήτηση στο ιστορικό');}
test('actual mounted history search pages older messages, renders literal text and replies without automatic read or delivery writes',async()=>{
 const calls=[];const h=await mount(async(path,options)=>{
  calls.push({path,options});if(path.includes('/messages/search')){const url=new URL(path,'https://fixture.invalid'),before=url.searchParams.get('before');return {store,q:'archive',rows:[row(before?'archive-b':'archive-a',before?'Second old message':'Old <script>literal</script>')],nextCursor:before?null:'archive-a'}}
  if(!options.method)return payload();throw Error('Unexpected write '+path);
 });
 try{await h.render('a');await openSearch(h);await type(h,'input[aria-label="Κείμενο αναζήτησης ιστορικού"]','archive');await click(h,'Αναζήτηση ιστορικού');
  assert.ok(document.body.textContent.includes('Old <script>literal</script>'));assert.equal(document.querySelector('script'),null);await click(h,'Επόμενα αποτελέσματα');
  assert.ok(document.body.textContent.includes('Second old message'));assert.equal(document.body.textContent.includes('Old <script>literal</script>'),false);
  const dialog=document.querySelector('[aria-label="Αναζήτηση ιστορικού"]');await h.act(async()=>{[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Απάντηση').click()});assert.ok(document.querySelector('.store-chat-reply-draft').textContent.includes('Second old message'));
  assert.equal(calls.filter(c=>c.options.method).length,0);assert.equal(calls.filter(c=>c.path.includes('/messages/search')).length,2);
 }finally{await h.close()}
});
test('actual forward UI requires destination review then explicit confirmation; uncertain retry keeps one request key',async()=>{
 let attempts=0;const h=await mount(async(path,options)=>{
  if(path.endsWith('/forward-targets'))return targets();
  if(path.endsWith('/forward')){attempts++;if(attempts===1)throw Error('Synthetic connection lost after commit');return {ok:true,id:'forwarded-message',targetStoreId:'destination',replayed:true}}
  return payload();
 });
 try{await h.render('a');await click(h,'Προώθηση');assert.equal(document.querySelector('select[aria-label="Συνομιλία προορισμού"]').value,'');assert.equal(button('Έλεγχος προώθησης').disabled,true);
  await select(h,'destination');await click(h,'Έλεγχος προώθησης');assert.ok(document.querySelector('[aria-label="Προώθηση μηνύματος"]').textContent.includes('CI Company · CI Destination'));assert.equal(attempts,0);
  await click(h,'Επιβεβαίωση προώθησης');assert.ok(button('Επανάληψη επιβεβαίωσης'));await click(h,'Επανάληψη επιβεβαίωσης');
  const posts=h.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body.requestId,posts[1].body.requestId);assert.deepEqual(Object.keys(posts[0].body).sort(),['requestId','targetStoreId']);assert.equal(posts[0].body.targetStoreId,'destination');assert.ok(document.body.textContent.includes('Προωθήθηκε στο CI Destination'));
  assert.equal(h.calls.some(c=>c.path.endsWith('/read')||c.path.endsWith('/delivered')||c.path.endsWith('/acknowledge')),false);
 }finally{await h.close()}
});
test('changed query, store or session rejects late search data and never writes receipts',async()=>{
 for(const mode of ['query','store','session']){let release;const h=await mount((path)=>path.includes('/messages/search')?new Promise(r=>release=r):payload());
  try{await h.render('a');await openSearch(h);await type(h,'input[aria-label="Κείμενο αναζήτησης ιστορικού"]','archive');await click(h,'Αναζήτηση ιστορικού');
   if(mode==='query')await type(h,'input[aria-label="Κείμενο αναζήτησης ιστορικού"]','changed');else if(mode==='store')await h.render('b');else h.setToken('different');
   await h.act(async()=>{release({store,q:'archive',rows:[row('old','PRIVATE LATE RESULT')],nextCursor:null});await new Promise(r=>setTimeout(r,0))});assert.equal(document.body.textContent.includes('PRIVATE LATE RESULT'),false);assert.equal(h.calls.some(c=>c.method==='POST'),false);
  }finally{await h.close()}
 }
});
test('background closes private forwarding and an unknown outcome cannot silently start a new intent',async()=>{
 let release;const h=await mount(path=>path.endsWith('/forward-targets')?targets():path.endsWith('/forward')?new Promise(r=>release=r):payload());
 try{await h.render('a');await click(h,'Προώθηση');await select(h,'destination');await click(h,'Έλεγχος προώθησης');await click(h,'Επιβεβαίωση προώθησης');
  await h.act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new h.dom.window.Event('visibilitychange'));});assert.equal(document.querySelector('[aria-label="Προώθηση μηνύματος"]'),null);
  await h.act(async()=>{release({ok:true,id:'late','targetStoreId':'destination'});await new Promise(r=>setTimeout(r,0));Object.defineProperty(document,'hidden',{configurable:true,value:false});});
  let prompts=0;h.dom.window.confirm=()=>{prompts++;return false};await click(h,'Προώθηση');assert.equal(prompts,1);assert.equal(document.querySelector('[aria-label="Προώθηση μηνύματος"]'),null);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
 }finally{await h.close()}
});
test('malformed cross-store search response never renders private content',async()=>{
 const h=await mount(path=>path.includes('/messages/search')?{store:{id:'foreign',companyId:'foreign'},q:'archive',rows:[row('private','FOREIGN SECRET')],nextCursor:null}:payload());
 try{await h.render('a');await openSearch(h);await type(h,'input[aria-label="Κείμενο αναζήτησης ιστορικού"]','archive');await click(h,'Αναζήτηση ιστορικού');assert.equal(document.body.textContent.includes('FOREIGN SECRET'),false);assert.ok(document.querySelector('[role="alert"]'));}finally{await h.close()}
});
