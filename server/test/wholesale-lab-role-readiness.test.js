import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../../ops/wholesale-lab/public/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../../ops/wholesale-lab/public/lab.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const meta={lab:true,testOnly:true,virtualOnly:true,companyId:'fixture-company',storeId:'fixture-store',stores:[{id:'fixture-store',name:'Synthetic only'}]};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const until=async check=>{for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,5))}assert.fail('Readiness condition not reached')};
function fixture({restored=false}={}){
 const dom=new JSDOM(html,{url:'http://127.0.0.1/lab',runScripts:'outside-only'}),w=dom.window,metadata=deferred(),session=deferred(),restore=deferred(),calls=[];
 if(restored){w.localStorage.setItem('token','synthetic');w.localStorage.setItem('user',JSON.stringify({id:'fixture-owner',role:'OWNER',fullName:'Synthetic'}))}
 w.fetch=async(path,options)=>{calls.push({path,options});if(path==='/api/lab/meta')return metadata.promise;if(path==='/api/lab/session')return session.promise;if(restored&&options.headers.Authorization==='Bearer synthetic')return restore.promise;throw Error('Unexpected fixture request '+path)};
 w.eval(script);const roles=()=>[...w.document.querySelectorAll('[data-role]')];return {w,dom,metadata,session,restore,calls,roles,posts:()=>calls.filter(c=>c.path==='/api/lab/session')};
}
test('all role buttons are disabled in the delivered HTML before JavaScript can initialize',()=>{
 const dom=new JSDOM(html);try{const roles=[...dom.window.document.querySelectorAll('[data-role]')];assert.equal(roles.length,4);assert.ok(roles.every(b=>b.matches(':disabled')))}finally{dom.window.close()}
});
test('delayed metadata refuses early click; one click after readiness makes exactly one session request',async()=>{
 const f=fixture();try{
  assert.ok(f.roles().every(b=>b.matches(':disabled')));f.roles()[0].click();assert.equal(f.posts().length,0);
  f.metadata.resolve(response(meta));await until(()=>f.roles().every(b=>!b.matches(':disabled')));
  f.roles()[0].click();await until(()=>f.posts().length===1);assert.deepEqual(JSON.parse(f.posts()[0].options.body),{role:'owner'});
  assert.ok(f.roles().every(b=>b.matches(':disabled')));f.roles()[0].click();assert.equal(f.posts().length,1);
  f.session.resolve(response({error:'Synthetic denial'},403));await until(()=>f.roles().every(b=>!b.matches(':disabled')));assert.equal(f.posts().length,1);assert.match(f.w.document.getElementById('message').textContent,/Synthetic denial/);
 }finally{f.dom.window.close()}
});
test('restored-owner lookup cannot prematurely unlock roles while initialization is pending',async()=>{
 const f=fixture({restored:true});try{
  f.metadata.resolve(response(meta));await until(()=>f.calls.some(c=>c.path.startsWith('/api/wholesale/workspace')));
  assert.ok(f.roles().every(b=>b.matches(':disabled')));f.roles()[0].click();assert.equal(f.posts().length,0);
  f.restore.resolve(response({error:'Synthetic expired session'},401));await until(()=>f.roles().every(b=>!b.matches(':disabled')));assert.equal(f.posts().length,0);assert.equal(f.w.document.getElementById('console').hidden,true);
 }finally{f.dom.window.close()}
});
for(const [name,data,status] of [['invalid isolation metadata',{...meta,lab:false},200],['metadata HTTP failure',{error:'Synthetic unavailable'},503]])test(name+' keeps every role unavailable',async()=>{
 const f=fixture();try{f.metadata.resolve(response(data,status));await until(()=>f.w.document.getElementById('runtime-status').textContent==='Το εργαστήριο δεν είναι διαθέσιμο');assert.ok(f.roles().every(b=>b.matches(':disabled')));f.roles()[0].click();assert.equal(f.posts().length,0)}finally{f.dom.window.close()}
});
