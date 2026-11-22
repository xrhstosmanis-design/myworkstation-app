import test from 'node:test';import assert from 'node:assert/strict';
import {chatTopic,categoryTopic,topicRow,resolveChatCategory} from '../src/chat-topics.mjs';
import {chatSendContext} from '../src/chat-interactions.mjs';
test('topics are strict optional public enum; legacy categories are partitioned without mutation',()=>{
 assert.equal(chatTopic(undefined),null);
 for(const value of ['GENERAL','CASH','INVOICE'])assert.equal(chatTopic(value),value);
 for(const value of [null,'','cash',' CASH','ALL',[],{},['CASH'],7])assert.throws(()=>chatTopic(value),{status:400});
 for(const category of ['CASH','SHIFT'])assert.equal(categoryTopic(category),'CASH');
 assert.equal(categoryTopic('INVOICE'),'INVOICE');
 for(const category of ['GENERAL','PAYMENT','ANNOUNCEMENT','ORDER','INCIDENT','EQUIPMENT','STOCK_SHORTAGE'])assert.equal(categoryTopic(category),'GENERAL');
 const row={id:'m1',category:'SHIFT',replyTo:{id:'parent',category:'SHIFT'}};
 assert.deepEqual(topicRow(row),{...row,topic:'CASH',replyTo:{...row.replyTo,topic:'CASH'}});assert.equal(Object.hasOwn(row,'topic'),false);
});
test('new composer defaults resolve to selected topic while explicit mismatches reject',()=>{
 assert.equal(resolveChatCategory(), 'GENERAL');
 for(const topic of ['GENERAL','CASH','INVOICE'])for(const category of [undefined,'GENERAL'])assert.equal(resolveChatCategory({topic,category}),topic);
 assert.equal(resolveChatCategory({topic:'CASH',category:'SHIFT'}),'SHIFT');
 assert.equal(resolveChatCategory({category:'PAYMENT'}),'PAYMENT');
 for(const input of [{topic:'CASH',category:'INVOICE'},{topic:'INVOICE',category:'SHIFT'},{topic:'CASH',category:'ANNOUNCEMENT'},{topic:'GENERAL',category:'CASH'},{category:'BAD'},{topic:null}])assert.throws(()=>resolveChatCategory(input),{status:400});
});
test('replies retain parent topic/category, never silently promote a normal announcement reply',()=>{
 for(const parentCategory of ['CASH','SHIFT','INVOICE','PAYMENT']){
  assert.equal(resolveChatCategory({parentCategory}),parentCategory);
  assert.equal(resolveChatCategory({parentCategory,category:'GENERAL',topic:categoryTopic(parentCategory)}),parentCategory);
 }
 assert.equal(resolveChatCategory({parentCategory:'ANNOUNCEMENT',topic:'GENERAL'}),'GENERAL');
 assert.equal(resolveChatCategory({parentCategory:'ANNOUNCEMENT',category:'ANNOUNCEMENT',topic:'GENERAL'}),'ANNOUNCEMENT');
 for(const input of [{parentCategory:'CASH',topic:'INVOICE'},{parentCategory:'INVOICE',category:'CASH'},{parentCategory:'ANNOUNCEMENT',topic:'CASH'}])assert.throws(()=>resolveChatCategory(input),{status:400});
});
test('reply lookup remains tenant/store bound and invalid parents never reach a writer',async()=>{
 const store={companyId:'co',id:'s'},calls=[],db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return [{id:'p',category:'SHIFT'}]}};
 assert.deepEqual(await chatSendContext(db,store,'p',{topic:'CASH'}),{replyToId:'p',category:'SHIFT'});
 assert.deepEqual(calls[0].values,['p','co','s']);assert.match(calls[0].sql,/FOR KEY SHARE/);
 await assert.rejects(()=>chatSendContext(db,store,'p',{topic:'INVOICE'}),{status:400});
 await assert.rejects(()=>chatSendContext({$queryRaw:async()=>[]},store,'foreign',{topic:'CASH'}),{status:404});
 await assert.rejects(()=>chatSendContext(db,store,'bad/id'),{status:400});
 assert.deepEqual(await chatSendContext(db,store,null,{topic:'INVOICE'}),{replyToId:null,category:'INVOICE'});
});
