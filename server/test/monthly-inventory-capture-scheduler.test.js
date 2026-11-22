import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonthlyInventoryCaptureScheduler} from '../src/services/monthly-inventory-capture-scheduler.js';
import {MONTHLY_CAPTURE_SERVICE_ID,MONTHLY_CAPTURE_CONTROL_ENV} from '../src/services/monthly-inventory-capture-activation.js';
import {createBackgroundDrain} from '../src/server-shutdown.js';

const control=(changes={})=>({v:1,purpose:'MONTHLY_INVENTORY_CAPTURE',serviceId:MONTHLY_CAPTURE_SERVICE_ID,epoch:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-10-30T12:00:00.000Z',notBefore:'2026-10-31T12:00:00.000Z',enabled:true,...changes});
async function withEnvironment(run,{enabled=true}={}){
 const names=['RENDER_SERVICE_ID',MONTHLY_CAPTURE_CONTROL_ENV],saved=new Map(names.map(name=>[name,process.env[name]]));
 try{process.env.RENDER_SERVICE_ID=MONTHLY_CAPTURE_SERVICE_ID;process.env[MONTHLY_CAPTURE_CONTROL_ENV]=JSON.stringify(control({enabled}));return await run(changes=>{process.env[MONTHLY_CAPTURE_CONTROL_ENV]=JSON.stringify(control(changes))});}
 finally{for(const [name,value] of saved)if(value===undefined)delete process.env[name];else process.env[name]=value;}
}
const rows=[{id:'grant-a',companyId:'company-a',storeId:'store-a'},{id:'grant-b',companyId:'company-a',storeId:'store-b'},{id:'grant-c',companyId:'company-b',storeId:'store-c'}];
function fixture(options={}){
 const work=createBackgroundDrain(),scans=[],calls=[],timers=[];let clock=0,scan=async()=>rows;
 const jobs={scanEligibleGrants:async input=>{scans.push(input);return scan(input)},runGrant:async id=>{calls.push(id);return {status:'SUCCEEDED',attempted:1}}};
 const scheduler=createMonthlyInventoryCaptureScheduler({jobs,work,timers:{setInterval:(fn,ms)=>{const timer={fn,ms,unref(){this.unrefed=true}};timers.push(timer);return timer},clearInterval:timer=>{timer.cleared=true}},monotonicNow:()=>clock,...options});
 return {scheduler,work,jobs,scans,calls,timers,setClock:value=>{clock=value},setScan:value=>{scan=value}};
}

test('construction is inert and OFF start/sweep never queries or creates a timer or dynamically revives',()=>withEnvironment(async setControl=>{
 const h=fixture();assert.equal(h.scans.length,0);assert.equal(h.timers.length,0);assert.equal(h.work.size,0);
 h.scheduler.start();assert.equal(h.timers.length,0);assert.deepEqual(await h.scheduler.sweep(),{status:'OFF',attempted:0,visited:0});assert.equal(h.scans.length,0);assert.equal(h.calls.length,0);
 setControl({enabled:true});h.scheduler.start();assert.equal((await h.scheduler.sweep()).status,'OFF');assert.equal(h.scans.length,0);assert.equal(h.timers.length,0);
 const restarted=fixture();restarted.scheduler.start();assert.equal(restarted.timers.length,1);restarted.work.stop();h.work.stop();
},{enabled:false}));

test('enabled explicit start creates one unref timer and bounded fair scans wrap only on a later empty sweep',()=>withEnvironment(async()=>{
 const h=fixture({batchSize:3,maxAttempts:2});h.scheduler.start();h.scheduler.start();assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,60000);assert.equal(h.timers[0].unrefed,true);
 assert.deepEqual(await h.scheduler.sweep(),{status:'COMPLETE',attempted:2,visited:2});assert.deepEqual(h.calls,['grant-a','grant-b']);assert.deepEqual(h.scans[0],{after:null,limit:3});
 h.setScan(async()=>[rows[2]]);await h.scheduler.sweep();assert.deepEqual(h.scans[1].after,{companyId:'company-a',storeId:'store-b',id:'grant-b'});
 h.setScan(async()=>[]);await h.scheduler.sweep();assert.equal(h.scans[2].after.id,'grant-c');await h.scheduler.sweep();assert.equal(h.scans[3].after,null);h.work.stop();assert.equal(h.timers[0].cleared,true);
}));

test('one tracked sweep is shared and stop drains the current job without admitting another store',()=>withEnvironment(async()=>{
 const h=fixture();let release;const held=new Promise(resolve=>{release=resolve});h.jobs.runGrant=async id=>{h.calls.push(id);await held;return{status:'SUCCEEDED',attempted:1}};
 const a=h.scheduler.sweep(),b=h.scheduler.sweep();assert.equal(a,b);assert.equal(h.work.size,1);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.calls,['grant-a']);
 h.work.stop();let drained=false;const drain=h.work.drain().then(()=>{drained=true});await Promise.resolve();assert.equal(drained,false);release();assert.deepEqual(await a,{status:'COMPLETE',attempted:1,visited:1});await drain;assert.equal(h.work.size,0);assert.equal((await h.scheduler.sweep()).status,'OFF');assert.equal(h.calls.length,1);
}));

test('OFF or a changed ON epoch after scan or job withdraws further admission and clears the timer',()=>withEnvironment(async setControl=>{
 for(const change of [{enabled:false},{epoch:'22222222-2222-4222-8222-222222222222'}]){
  setControl({enabled:true});const h=fixture();h.scheduler.start();h.jobs.runGrant=async id=>{h.calls.push(id);setControl(change);return{status:'SUCCEEDED',attempted:1}};
  assert.equal((await h.scheduler.sweep()).attempted,1);assert.equal(h.calls.length,1);assert.equal(h.timers[0].cleared,true);setControl({enabled:true});assert.equal((await h.scheduler.sweep()).status,'OFF');h.scheduler.start();assert.equal(h.timers.length,1);h.work.stop();
 }
 setControl({enabled:true});const h=fixture();h.setScan(async()=>{setControl({enabled:false});return rows});assert.equal((await h.scheduler.sweep()).status,'OFF');assert.equal(h.calls.length,0);h.work.stop();
}));

test('monotonic elapsed and scan count bound work even when held jobs report zero attempts',()=>withEnvironment(async()=>{
 const h=fixture({batchSize:2,maxSweepMs:25});h.setScan(async()=>rows.slice(0,2));h.jobs.runGrant=async id=>{h.calls.push(id);h.setClock(25);return{status:'HOLD',attempted:0}};
 assert.deepEqual(await h.scheduler.sweep(),{status:'COMPLETE',attempted:0,visited:1});assert.equal(h.calls.length,1);assert.equal(h.scans[0].limit,2);h.work.stop();
}));

test('a failed store advances the private fair cursor and the tracked rejection still drains',()=>withEnvironment(async()=>{
 const h=fixture();h.jobs.runGrant=async()=>{throw new Error('SYNTHETIC_STORE_FAILURE')};await assert.rejects(h.scheduler.sweep(),/SYNTHETIC_STORE_FAILURE/);await h.work.drain();assert.equal(h.work.size,0);
 h.setScan(async()=>[]);await h.scheduler.sweep();assert.deepEqual(h.scans[1].after,{companyId:'company-a',storeId:'store-a',id:'grant-a'});h.work.stop();
}));

test('invalid bounded scan/results and budget clock fail visibly without exceeding a batch',()=>withEnvironment(async()=>{
 const h=fixture({batchSize:1});h.setScan(async()=>rows);await assert.rejects(h.scheduler.sweep(),/Invalid bounded/);assert.equal(h.calls.length,0);
 h.setScan(async()=>[rows[0]]);h.jobs.runGrant=async()=>({status:'SUCCEEDED',attempted:2});await assert.rejects(h.scheduler.sweep(),/Invalid monthly capture job result/);await h.work.drain();h.work.stop();
 const backwards=fixture();backwards.setScan(async()=>{backwards.setClock(-1);return rows});await assert.rejects(backwards.scheduler.sweep(),/budget clock/);assert.equal(backwards.calls.length,0);backwards.work.stop();
 for(const change of [{intervalMs:1},{batchSize:0},{batchSize:21},{maxAttempts:61},{maxSweepMs:0},{monotonicNow:null}])assert.throws(()=>fixture(change),TypeError);
}));

test('runtime control cannot be injected through an extra activation provider option',()=>withEnvironment(async()=>{
 let invoked=false;const h=fixture({activationProvider:()=>{invoked=true;return{valid:true,enabled:true,fingerprint:'forged'}}});h.scheduler.start();await h.scheduler.sweep();assert.equal(invoked,false);assert.equal(h.scans.length,0);assert.equal(h.timers.length,0);h.work.stop();
},{enabled:false}));
