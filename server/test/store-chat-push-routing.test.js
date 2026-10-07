import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../client/public/sw.js",import.meta.url),"utf8");
const origin="https://lab.example";
function harness(windows=[]){
  const handlers={},notifications=[],opened=[],posts=[],focused=[],navigated=[];
  const clients={matchAll:async()=>windows.map(window=>({...window,postMessage:data=>posts.push({id:window.id,data}),focus:async()=>{focused.push(window.id)},navigate:async url=>{navigated.push({id:window.id,url})}})),openWindow:async url=>opened.push(url)};
  const self={location:{origin},clients,registration:{showNotification:async(title,options)=>notifications.push({title,options})},addEventListener:(type,handler)=>{handlers[type]=handler}};
  vm.runInNewContext(source,{self,clients,URL});
  return {notifications,opened,posts,focused,navigated,async push(data){let work;handlers.push({data:{json:()=>data},waitUntil:p=>{work=p}});await work},async click(url){let work;handlers.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>{work=p}});await work}};
}
const windowFor=(id,store,visibilityState="visible")=>({id,url:`${origin}/store/${store}`,visibilityState});

test("push for B is not swallowed by a visible POS for A",async()=>{
  const h=harness([windowFor("a","A")]);await h.push({storeId:"B",url:"/store/B"});assert.equal(h.notifications.length,1);assert.equal(h.posts.length,0);
});
test("only visible matching store receives foreground push",async()=>{
  const h=harness([windowFor("a","A"),windowFor("b","B"),windowFor("hidden","B","hidden")]);await h.push({storeId:"B",url:"/store/B"});assert.deepEqual(h.posts.map(x=>x.id),["b"]);assert.equal(h.notifications.length,0);assert.equal(h.posts[0].data.type,"STORE_CHAT_PUSH");
});
test("hidden target gets a system notification with sound requested",async()=>{
  const h=harness([windowFor("b","B","hidden")]);await h.push({storeId:"B",url:"/store/B"});assert.equal(h.notifications.length,1);assert.equal(h.notifications[0].options.silent,false);assert.equal(h.posts.length,0);
});
test("store prefixes do not match another store",async()=>{
  const h=harness([windowFor("b2","B2")]);await h.push({storeId:"B",url:"/store/B"});assert.equal(h.notifications.length,1);assert.equal(h.posts.length,0);
});
test("notification click focuses existing Chat without navigating either POS",async()=>{
  const h=harness([windowFor("a","A"),windowFor("b","B","hidden"),{id:"chat",url:`${origin}/chat/B`,visibilityState:"hidden"}]);await h.click("/store/B");assert.deepEqual(h.focused,["chat"]);assert.equal(h.navigated.length,0);assert.equal(h.opened.length,0);
});
test("notification opens its store in a new window if only another POS exists",async()=>{
  const h=harness([windowFor("a","A")]);await h.click("/store/B");assert.equal(h.focused.length,0);assert.equal(h.navigated.length,0);assert.deepEqual(h.opened,[`${origin}/chat/B`]);
});
test("invalid or foreign notification targets stay on the application origin",async()=>{
  for(const url of ["https://foreign.example/store/B","javascript:alert(1)"]){const h=harness();await h.click(url);assert.deepEqual(h.opened,[`${origin}/`]);}
});

test("real legacy root payload opens the notified store and preserves another POS",async()=>{
  const h=harness([windowFor("a","A")]);await h.push({storeId:"B",url:"/"});const url=h.notifications[0].options.data.url;assert.equal(url,`${origin}/chat/B`);await h.click(url);assert.deepEqual(h.opened,[`${origin}/chat/B`]);assert.equal(h.navigated.length,0);
});

test("tap with a matching POS opens Chat separately and preserves the operator screen",async()=>{
  const h=harness([windowFor("b","B","hidden")]);await h.push({storeId:"B",url:"/"});await h.click(h.notifications[0].options.data.url);
  assert.deepEqual(h.opened,[`${origin}/chat/B`]);assert.equal(h.focused.length,0);assert.equal(h.navigated.length,0);
});
test("visible dedicated Chat suppresses duplicate system notification",async()=>{
  const h=harness([{id:"chat",url:`${origin}/chat/B`,visibilityState:"visible"}]);await h.push({storeId:"B"});
  assert.equal(h.notifications.length,0);assert.deepEqual(h.posts.map(x=>x.id),["chat"]);
});

test("existing Chat receives an explicit reopen command for only its own store",async()=>{
  const h=harness([{id:"chat",url:`${origin}/chat/B`,visibilityState:"hidden"}]);await h.click("/chat/B");
  assert.deepEqual(h.focused,["chat"]);assert.equal(h.posts[0].data.type,"STORE_CHAT_OPEN");assert.equal(h.posts[0].data.storeId,"B");
  assert.equal(h.opened.length,0);assert.equal(h.navigated.length,0);
});
