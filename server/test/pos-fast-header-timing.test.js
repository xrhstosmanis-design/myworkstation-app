import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createFastHeaderTiming} from '../src/lib/pos-fast-header-timing.js';

test('default diagnostic sink writes one JSON line with no supplied business data',t=>{
 const output=[];
 t.mock.method(console,'info',(...args)=>{output.push(args)});
 const res=new EventEmitter();
 const timing=createFastHeaderTiming(res,{now:()=>100});
 timing.start('azure_header')('ok');res.emit('finish');res.emit('close');
 assert.equal(output.length,2);
 for(const [prefix,text] of output){
  assert.equal(prefix,'POS_FAST_HEADER_TIMING');assert.equal(typeof text,'string');assert.doesNotMatch(text,/\n/);
  const record=JSON.parse(text);
  assert.deepEqual(Object.keys(record).sort(),['correlationId','elapsedMs','outcome','stage']);
  assert.equal(record.elapsedMs,0);
 }
 assert.deepEqual(output.map(([,text])=>JSON.parse(text).stage),['azure_header','request_total']);
});

test('elapsed spans are finite nonnegative differences and faulty clock readings never change the work',async()=>{
 const res=new EventEmitter(),events=[];let current=5000;
 const timing=createFastHeaderTiming(res,{emit:event=>events.push(event),now:()=>current});
 const end=timing.start('azure_header');current=5123.125;end('ok');
 assert.equal(events[0].elapsedMs,123.125);
 const reversed=timing.start('azure_supplier_match');current=5000;reversed('ok');assert.equal(events[1].elapsedMs,0);
 const value={private:'secret'};
 const result=await timing.measure('openai_header',()=>{current=Infinity;return value});
 assert.equal(result,value);assert.equal(events.length,2,'non-finite end readings are omitted');
 current=5200;res.emit('finish');
 assert.equal(events.at(-1).elapsedMs,200);
 assert.ok(events.every(event=>Number.isFinite(event.elapsedMs)&&event.elapsedMs>=0));
 assert.doesNotMatch(JSON.stringify(events),/private|secret/);
});

test('unrecognized stages, outcomes and unbounded attempts never become diagnostic payloads',async()=>{
 const res=new EventEmitter(),events=[];
 const timing=createFastHeaderTiming(res,{emit:event=>events.push(event),now:()=>0});
 timing.start('secret-filename.pdf')('error');
 for(const attempt of [0,3,-1,Infinity,NaN,'1',{},null])timing.start('openai_attempt',attempt)('ok');
 timing.start('azure_header',1)('ok');
 const end=timing.start('azure_header');end('secret-error-body');end('ok');end('error');
 await timing.measure('secret-dynamic-stage',()=>({documentNumber:'secret-document'}));
 assert.deepEqual(events.map(({stage,outcome})=>({stage,outcome})),[{stage:'azure_header',outcome:'ok'}]);
 for(const attempt of [1,2])timing.start('openai_attempt',attempt)('error');
 assert.deepEqual(events.slice(1).map(event=>event.attempt),[1,2]);
 assert.doesNotMatch(JSON.stringify(events),/secret|documentNumber|filename/);
});

test('synchronous or asynchronous sink failure preserves the exact work result and original error once',async()=>{
 for(const asynchronous of [false,true]){
  const res=new EventEmitter(),sinkError=new Error('secret sink failure'),originalError=new Error('original provider failure');
  let calls=0,emits=0;
  const timing=createFastHeaderTiming(res,{emit(){emits++;if(asynchronous)return Promise.reject(sinkError);throw sinkError}});
  const originalResult=Object.freeze({totalGross:24.8});
  assert.equal(await timing.measure('azure_header',()=>{calls++;return originalResult}),originalResult);
  await assert.rejects(timing.measure('openai_header',()=>{calls++;throw originalError}),error=>error===originalError);
  assert.doesNotThrow(()=>{res.emit('finish');res.emit('close')});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);assert.equal(emits,3);
 }
});

test('failed timing initialization is silent and leaves both provider values and errors untouched',async()=>{
 const failure=new Error('secret setup failure');
 const cases=[
  [new EventEmitter(),{randomId(){throw failure}}],
  [new EventEmitter(),{randomId:()=> 'secret-client-supplied-id'}],
  [new EventEmitter(),{now(){throw failure}}],
  [new EventEmitter(),{now:()=>NaN}],
  [{},{}],
  [new EventEmitter(),{emit:null}],
  [new EventEmitter(),{now:null}],
 ];
 for(const [res,options] of cases){
  let emits=0,calls=0;
  const timing=createFastHeaderTiming(res,{emit:()=>{emits++},...options});
  const value={private:'secret'};
  assert.equal(await timing.measure('azure_header',()=>{calls++;return value}),value);
  await assert.rejects(timing.measure('openai_header',()=>{calls++;throw failure}),error=>error===failure);
  assert.doesNotThrow(()=>{timing.start('openai_attempt',1)('ok');res.emit?.('finish');res.emit?.('close')});
  assert.equal(calls,2);assert.equal(emits,0);
 }
});

test('partially registered response observers cannot emit or replace an error after setup fails',async()=>{
 const res=new EventEmitter(),events=[],failure=new Error('secret listener failure');
 const once=res.once.bind(res);let registrations=0;
 res.once=(name,listener)=>{if(++registrations===2)throw failure;return once(name,listener)};
 const timing=createFastHeaderTiming(res,{emit:event=>events.push(event)});
 const result={original:true};assert.equal(await timing.measure('azure_header',()=>result),result);
 res.emit('finish');res.emit('close');
 assert.deepEqual(events,[]);
 await assert.rejects(timing.measure('openai_header',()=>{throw failure}),error=>error===failure);
});
