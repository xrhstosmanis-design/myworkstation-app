import test from 'node:test';import assert from 'node:assert/strict';
import {chatMessageId,deliveryIds,chatReaction,CHAT_REACTIONS} from '../src/chat-interactions.mjs';
test('Chat references accept existing message IDs and reject malformed/injected/unbounded values',()=>{
 for(const value of ['chat-1790000000-abc','UUID:42','a'.repeat(160)])assert.equal(chatMessageId(value),value);
 for(const value of [null,undefined,{},[],13,'',' a','a/b',"x' OR true --",'a\n','a'.repeat(161)])assert.throws(()=>chatMessageId(value),{status:400});
});
test('delivery batches deduplicate, bound200 and reject the entire malformed request',()=>{
 assert.deepEqual(deliveryIds(['m1','m2','m1']),['m1','m2']);assert.deepEqual(deliveryIds([]),[]);
 assert.equal(deliveryIds(Array.from({length:200},(_,i)=>`m${i}`)).length,200);
 for(const value of [null,{},'m1',['m1',null],['m1','a/b'],Array(201).fill('m1')])assert.throws(()=>deliveryIds(value),{status:400});
});
test('reaction set/replace/remove has one exact bounded vocabulary, no implicit defaults',()=>{
 for(const value of CHAT_REACTIONS)assert.equal(chatReaction(value),value);assert.equal(chatReaction(null),null);
 for(const value of [undefined,'',{},[],1,'❤','🔥','👍👍'])assert.throws(()=>chatReaction(value),{status:400});
});
