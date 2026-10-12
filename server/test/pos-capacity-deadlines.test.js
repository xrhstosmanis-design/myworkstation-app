import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../../tools/pos-capacity/runner.mjs',import.meta.url),'utf8');
const compile=(clock,sleep)=>new Function('performance','delay',source.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+';return runSchedule;')(clock,sleep);

test('actual scheduler never starts a fractional offered deadline early when timer delays are truncated',async()=>{
  let now=0;const dispatch=[],waits=[];
  const run=compile({now:()=>now},async ms=>{waits.push(ms);now+=Math.max(1,Math.floor(ms))});
  const events=[0,5.5,11.25,12.75].map((atMs,i)=>({id:String(i),actor:{id:'synthetic'},kind:'read',atMs}));
  const result=await run(events,async event=>{dispatch.push({deadline:event.atMs,actual:now});now+=1;return {ok:true}});
  assert.equal(dispatch.length,events.length);assert.ok(dispatch.every(row=>row.actual>=row.deadline));
  assert.ok(waits.every(ms=>Number.isInteger(ms)&&ms>=1));assert.ok(result.samples.every(row=>row.offeredLatencyMs>=row.latencyMs));assert.equal(result.byKind.read.dropped,0);
});

test('actual scheduler rechecks monotonic time after an early wake without moving offered deadlines',async()=>{
  let now=0;const waits=[],dispatch=[];
  const run=compile({now:()=>now},async ms=>{waits.push(ms);now+=Math.max(.25,ms-.75)});
  const events=[{id:'first',actor:{id:'synthetic'},kind:'read',atMs:0},{id:'fractional',actor:{id:'synthetic'},kind:'read',atMs:5.5}];
  const before=structuredClone(events);
  const result=await run(events,async event=>{dispatch.push({deadline:event.atMs,actual:now});now+=1;return {ok:true}});
  assert.ok(waits.length>=2,'a single ceil-rounded timer still wakes before the deadline');
  assert.equal(dispatch[1].deadline,5.5);assert.ok(dispatch[1].actual>=5.5);assert.deepEqual(events,before);
  assert.ok(result.samples.every(row=>row.offeredLatencyMs>=row.latencyMs));assert.equal(result.samples.length,2);
});
