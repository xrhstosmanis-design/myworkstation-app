import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteInputQueue} from '../../client/src/lib/remote-support-input.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('remote input preserves click/text/Enter order despite a delayed request and cancels queued text on blur',async()=>{
 const first=deferred(),sent=[];let focused=true;
 const queue=createRemoteInputQueue({allowed:()=>true,send:async x=>{sent.push(x);if(sent.length===1)await first.promise;},onError:()=>assert.fail('unexpected input error')});
 const click=queue.enqueue({type:'click'}),text=queue.enqueue({type:'text',text:'ά'},()=>focused),enter=queue.enqueue({type:'key',key:'Enter'},()=>focused);
 await Promise.resolve();assert.deepEqual(sent,[{type:'click'}]);first.resolve();assert.deepEqual(await Promise.all([click,text,enter]),[true,true,true]);assert.deepEqual(sent.map(x=>x.type),['click','text','key']);
 const hold=deferred();const q=createRemoteInputQueue({allowed:()=>true,send:async x=>{sent.push(x);await hold.promise;},onError:()=>{}});
 const a=q.enqueue({type:'click'}),b=q.enqueue({type:'text',text:'never'},()=>focused);await Promise.resolve();focused=false;hold.resolve();assert.equal(await a,true);assert.equal(await b,false);assert.equal(sent.some(x=>x.text==='never'),false);
});
test('STOP, stale frame/login guards, age and uncertain request discard input without retry',async()=>{
 let active=true,time=0;const first=deferred(),sent=[],errors=[];
 const queue=createRemoteInputQueue({allowed:()=>active,now:()=>time,send:async x=>{sent.push(x);if(sent.length===1)await first.promise;},onError:e=>errors.push(e.message)});
 const a=queue.enqueue('first'),b=queue.enqueue('second');await Promise.resolve();queue.cancel();first.resolve();assert.equal(await a,true);assert.equal(await b,false);
 active=false;assert.equal(await queue.enqueue('stopped'),false);active=true;
 const c=queue.enqueue('too old');time=3001;assert.equal(await c,false);
 const q=createRemoteInputQueue({allowed:()=>true,send:async x=>{sent.push(x);throw Error('uncertain');},onError:e=>errors.push(e.message)});
 const x=q.enqueue('failed'),y=q.enqueue('must not follow');assert.equal(await x,false);assert.equal(await y,false);assert.deepEqual(errors,['uncertain']);assert.deepEqual(sent,['first','failed']);
});

test('fast typing batches only adjacent text from the same focus without crossing Enter or another focus',async()=>{
 const first=deferred(),sent=[];const queue=createRemoteInputQueue({allowed:()=>true,send:async x=>{sent.push(x);if(sent.length===1)await first.promise;},onError:()=>assert.fail('unexpected error')});
 const jobs=[queue.enqueue({type:'click'})];await Promise.resolve();
 for(const char of 'Ελληνικά123')jobs.push(queue.enqueue({type:'text',text:char},()=>true,1));
 jobs.push(queue.enqueue({type:'key',key:'Enter'}));jobs.push(queue.enqueue({type:'text',text:'α'},()=>true,1));jobs.push(queue.enqueue({type:'text',text:'β'},()=>true,2));first.resolve();await Promise.all(jobs);
 assert.deepEqual(sent,[{type:'click'},{type:'text',text:'Ελληνικά123'},{type:'key',key:'Enter'},{type:'text',text:'α'},{type:'text',text:'β'}]);
});
