import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {isolatedDestination,cohort,scheduleActions,runSchedule,summarize,localJson} from '../../tools/pos-capacity/runner.mjs';

const env={NODE_ENV:'test',MWS_CAPACITY_ISOLATED:'1',DATABASE_URL:'postgresql://fixture:private@127.0.0.1:5432/myworkstation_test',E2E_BASE_URL:'http://127.0.0.1:8080'};
const actor={id:'capacity-actor'};
test('capacity gate rejects real/remote databases and unsafe origins before any action',()=>{
  assert.deepEqual(isolatedDestination(env),{base:'http://127.0.0.1:8080',database:'myworkstation_test',host:'127.0.0.1',port:'5432'});
  for(const patch of [{NODE_ENV:'production'},{MWS_CAPACITY_ISOLATED:'0'},{DATABASE_URL:'postgresql://fixture:private@db.example.invalid/myworkstation_test'},{DATABASE_URL:'postgresql://fixture:private@localhost/myworkstation'},{DATABASE_URL:env.DATABASE_URL+'?host=remote.example.invalid'},{DATABASE_URL:env.DATABASE_URL+'?schema=live'},{E2E_BASE_URL:'https://myworkstation-app.onrender.com'},{E2E_BASE_URL:'http://user:private@localhost'},{E2E_BASE_URL:'http://localhost/path'},{E2E_BASE_URL:'http://localhost?next=private'}]){
    assert.throws(()=>isolatedDestination({...env,...patch}),error=>!error.message.includes('private'));
  }
});
test('each cohort contains the exact number of active POS and explicit two-terminal stores',()=>{
  const actors=Array.from({length:100},(_,storeIndex)=>Array.from({length:storeIndex<10?2:1},(_,terminalIndex)=>({id:`${storeIndex}-${terminalIndex}`,storeIndex,terminalIndex}))).flat();
  for(const [stores,pos,extra] of [[20,22,2],[50,55,5],[100,110,10]]){
    const selected=cohort(actors,stores);assert.equal(selected.length,pos);assert.equal(new Set(selected.map(a=>a.storeIndex)).size,stores);assert.equal(selected.filter(a=>a.terminalIndex===1).length,extra);
  }
  assert.throws(()=>cohort(actors,10));assert.throws(()=>cohort(actors.slice(1),100));
});
test('offered action deadlines are reproducible and preserve independent rates',()=>{
  const specs=[{kind:'search',perMinute:6},{kind:'sale',perMinute:1}];
  const events=scheduleActions([actor,{id:'capacity-second'}],specs,60000,{seed:'stable'});
  assert.equal(events.length,14);assert.equal(events.filter(e=>e.kind==='search').length,12);assert.equal(new Set(events.map(e=>e.id)).size,14);
  assert.deepEqual(events,scheduleActions([actor,{id:'capacity-second'}],specs,60000,{seed:'stable'}));
  assert.notDeepEqual(events,scheduleActions([actor,{id:'capacity-second'}],specs,60000,{seed:'other'}));
  assert.throws(()=>scheduleActions([actor],[{kind:'search',perMinute:0}],100));
});
test('saturated generator reports offered actions as drops, never a silently reduced rate',async()=>{
  const events=Array.from({length:8},(_,i)=>({id:String(i),actor,kind:'sale',atMs:0}));
  const r=await runSchedule(events,async()=>{await delay(15);return {ok:true}},{maxInFlight:2});
  assert.equal(r.samples.length,8);assert.equal(r.byKind.sale.offered,8);assert.equal(r.byKind.sale.started,2);assert.equal(r.byKind.sale.dropped,6);assert.equal(r.byKind.sale.errors.GENERATOR_LIMIT,6);assert.equal(r.peakInFlight,2);
});
test('slow real HTTP responses do not move later offered deadlines',async()=>{
  const server=http.createServer(async(req,res)=>{await delay(45);res.setHeader('content-type','application/json');res.end('{"ok":true}')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const events=Array.from({length:6},(_,i)=>({id:String(i),actor,kind:'read',atMs:i*5}));
    const r=await runSchedule(events,()=>localJson(base,'/api/test'));
    assert.equal(r.byKind.read.completed,6);assert.equal(r.byKind.read.dropped,0);assert.ok(r.peakInFlight>1,'Closed-loop generator serialized responses');
    assert.ok(r.samples.every(s=>s.offeredLatencyMs>=s.latencyMs));
  }finally{await new Promise(resolve=>server.close(resolve))}
});
test('HTTP redirect rejection, status counts and failures retain no secrets or response bodies',async()=>{
  const base='http://127.0.0.1:8080',calls=[];
  const response=await localJson(base,'/api/test',{token:'private-token',fetchImpl:async(url,options)=>{calls.push(options);return {ok:false,status:503,json:async()=>({code:'AUTH_VALIDATION_UNAVAILABLE',error:'private message'})}}});
  assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);assert.equal(response.errorCode,'AUTH_VALIDATION_UNAVAILABLE');
  const r=await runSchedule([{id:'one',actor,kind:'read',atMs:0},{id:'two',actor,kind:'read',atMs:0}],async e=>{if(e.id==='two')throw Error('private-token');return response});
  assert.equal(r.byKind.read.errors.AUTH_VALIDATION_UNAVAILABLE,1);assert.equal(r.byKind.read.errors.ACTION_FAILED,1);assert.ok(!JSON.stringify(r).includes('private'));
  await assert.rejects(localJson('https://remote.invalid','/api/test'));await assert.rejects(localJson(base,'//remote.invalid/path'));
});
test('quantiles stay per action and separately include scheduled-arrival latency',()=>{
  const samples=[1,2,3,100].map((n,i)=>({id:String(i),kind:'search',ok:true,latencyMs:n,offeredLatencyMs:n+50,dispatchLagMs:50}));
  samples.push({id:'drop',kind:'search',ok:false,dropped:true,errorCode:'GENERATOR_LIMIT'});
  const x=summarize(samples).search;assert.equal(x.p50Ms,2);assert.equal(x.p95Ms,100);assert.equal(x.offeredP95Ms,150);assert.equal(x.started,4);assert.equal(x.offered,5);
});
test('invalid deadline order, duplicate action IDs and generator limits reject before execution',async()=>{
  let calls=0;const exec=async()=>{calls++;return {ok:true}};
  await assert.rejects(runSchedule([{id:'a',actor,atMs:5},{id:'b',actor,atMs:0}],exec));
  await assert.rejects(runSchedule([{id:'a',actor,atMs:0},{id:'a',actor,atMs:1}],exec));
  await assert.rejects(runSchedule([],exec,{maxInFlight:0}));assert.equal(calls,0);
});
