import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticReportScheduler} from '../src/services/automatic-report-scheduler.js';
import {createBackgroundDrain} from '../src/server-shutdown.js';
function fixture(){
 const work=createBackgroundDrain(),queries=[],calls=[],timers=[];let control={valid:true,enabled:true,fingerprint:'one'};
 const db={$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join('?'),values});return[{companyId:'c',storeId:'s'},{companyId:'d',storeId:'t'}]}};
 const dispatcher={dispatch:async(scope,options)=>{calls.push({scope,options});return{attempted:1}}};
 const scheduler=createAutomaticReportScheduler({db,dispatcher,activationProvider:()=>control,work,batchSize:2,maxAttempts:3,timers:{setInterval:(fn,ms)=>{const t={fn,ms,unref(){this.unrefed=true}};timers.push(t);return t},clearInterval:t=>{t.cleared=true}}});
 return{scheduler,db,dispatcher,work,queries,calls,timers,setControl:c=>{control=c}};
}
test('construction is inert, explicit start once creates unref timer and OFF makes zero database calls',async()=>{
 const h=fixture();assert.equal(h.timers.length,0);h.scheduler.start();h.scheduler.start();assert.equal(h.timers.length,1);assert.equal(h.timers[0].ms,60000);assert.equal(h.timers[0].unrefed,true);
 h.setControl({valid:true,enabled:false});assert.equal((await h.scheduler.sweep()).status,'OFF');assert.equal(h.queries.length,0);assert.equal(h.calls.length,0);
 h.work.stop();assert.equal(h.timers[0].cleared,true);
});
test('bounded sweep runs only three known frequencies and uses keyset on following sweep',async()=>{
 const h=fixture();assert.equal((await h.scheduler.sweep()).attempted,3);assert.deepEqual(h.calls.map(x=>x.scope.frequency),['DAILY','WEEKLY','MONTHLY']);assert.equal(h.queries[0].values.at(-1),2);assert.deepEqual(h.calls.map(x=>x.options.maxAttempts),[3,2,1]);
 await h.scheduler.sweep();assert.match(h.queries[1].sql,/\("companyId","storeId"\)>/);assert.deepEqual(h.queries[1].values,['c','s',2]);
});
test('concurrent sweeps share one tracked task; shutdown stops admission but drains current operation',async()=>{
 const h=fixture();let release;const wait=new Promise(r=>{release=r});h.dispatcher.dispatch=async scope=>{h.calls.push(scope);await wait;return{attempted:1}};
 const a=h.scheduler.sweep(),b=h.scheduler.sweep();assert.equal(a,b);await new Promise(r=>setImmediate(r));assert.equal(h.work.size,1);assert.equal(h.calls.length,1);
 h.work.stop();let drained=false;const draining=h.work.drain().then(()=>{drained=true});await Promise.resolve();assert.equal(drained,false);
 release();await a;await draining;assert.equal(h.calls.length,1);assert.equal(h.work.size,0);assert.equal((await h.scheduler.sweep()).status,'OFF');
});
test('fresh OFF/epoch change mid-sweep prevents additional frequency/store admission',async()=>{
 const h=fixture();h.dispatcher.dispatch=async scope=>{h.calls.push(scope);h.setControl({valid:true,enabled:true,fingerprint:'changed'});return{attempted:1}};
 assert.equal((await h.scheduler.sweep()).attempted,1);assert.equal(h.calls.length,1);
});
test('invalid bounds or dishonest dispatcher cannot silently exceed batch budget',async()=>{
 const h=fixture();h.dispatcher.dispatch=async()=>({attempted:99});await assert.rejects(h.scheduler.sweep());await h.work.drain();assert.equal(h.work.size,0);
 assert.throws(()=>createAutomaticReportScheduler({db:h.db,dispatcher:h.dispatcher,activationProvider:()=>({}),work:h.work,intervalMs:1}));
});
