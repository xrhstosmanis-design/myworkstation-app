import test from 'node:test';
import assert from 'node:assert/strict';
import {priority20Phases,priority20Events,assessPhase} from '../../tools/pos-capacity/profiles.mjs';
import {summarize} from '../../tools/pos-capacity/runner.mjs';
const actors=Array.from({length:22},(_,i)=>({id:`pos-${i}`})),owners=Array.from({length:20},(_,i)=>({id:`owner-${i}`}));
test('full20 profile preserves real warmup/normal/peak/two-hour durations and labels short preflight',()=>{
  const full=priority20Phases();assert.deepEqual(full.map(p=>p.seconds),[300,1800,900,1,7200]);
  assert.ok(full.every(p=>p.stores===20&&p.pos===22&&p.profile==='full'));
  assert.ok(priority20Phases('preflight').every(p=>p.seconds===3&&p.profile==='preflight'));
  assert.throws(()=>priority20Phases('smoke'));
});
test('normal and peak arrivals offer exact rates without double-counting refresh session validation',()=>{
  for(const [rate,expectedSales,expectedRefresh,expectedValidation,expectedSearch] of [['normal',22,22,22,132],['peak',66,44,0,264]]){
    const e=priority20Events({name:rate,rate,profile:'full',seconds:60},actors,owners);
    const count=k=>e.filter(a=>a.kind===k).length;
    assert.equal(count('pos-sale'),expectedSales);assert.equal(count('pos-refresh'),expectedRefresh);
    assert.equal(count('pos-session'),expectedValidation);assert.equal(expectedRefresh+expectedValidation,44);
    assert.equal(count('pos-local-search'),expectedSearch);assert.equal(new Set(e.map(a=>a.id)).size,e.length);
    assert.deepEqual(e,priority20Events({name:rate,rate,profile:'full',seconds:60},actors,owners));
  }
});
test('burst synchronizes all POS refresh/search and BackOffice reads with no synthetic sales',()=>{
  const e=priority20Events(priority20Phases()[3],actors,owners);
  assert.equal(e.length,84);assert.ok(e.every(e=>e.atMs===0&&e.kind!=='pos-sale'));
  assert.equal(new Set(e.filter(e=>e.kind==='pos-refresh').map(e=>e.actor.id)).size,22);
  assert.throws(()=>priority20Events(priority20Phases()[0],actors.slice(1),owners));
});
test('preflight exercises every POS in each phase, with sales restricted to fresh non-burst actions',()=>{
  for(const phase of priority20Phases('preflight')){
    const e=priority20Events(phase,actors,owners);
    assert.equal(new Set(e.filter(e=>e.kind.startsWith('pos-')).map(e=>e.actor.id)).size,22);
    assert.equal(e.filter(e=>e.kind==='pos-sale').length,phase.rate==='burst'?0:22);
    assert.ok(e.at(-1).atMs<3000);
  }
});
test('phase verdict rejects drops, errors, excessive lag and route-specific latency',()=>{
  const sample={kind:'pos-sale',ok:true,dropped:false,latencyMs:2,offeredLatencyMs:2,dispatchLagMs:0};
  const check=samples=>assessPhase({samples,byKind:summarize(samples)});
  assert.equal(check([sample]).status,'PASS');assert.equal(check([]).status,'FAIL');
  for(const patch of [{ok:false,errorCode:'HTTP_503'},{dropped:true,ok:false,errorCode:'GENERATOR_LIMIT'},{latencyMs:1001},{dispatchLagMs:1001}])assert.equal(check([{...sample,...patch}]).status,'FAIL');
});
