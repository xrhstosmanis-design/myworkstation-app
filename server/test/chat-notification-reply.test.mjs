import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {chatMessageId,chatSendContext} from '../src/chat-interactions.mjs';
import {categoryTopic} from '../src/chat-topics.mjs';

test('notification replies inherit scoped parent category and deduplicate exact retries',async()=>{
  const store={id:'store',companyId:'company',name:'LAB'};
  const parent={id:'chat-parent',category:'SHIFT',storeId:store.id,companyId:store.companyId};
  const owner={id:'owner',companyId:store.companyId,role:'OWNER'};
  const messages=[],audits=[],pushed=[];
  const db={
    store:{findUnique:async({where})=>where.id===store.id?store:null},
    $transaction:handler=>handler(db),
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes('FOR KEY SHARE'))return values.every((value,i)=>[parent.id,parent.companyId,parent.storeId][i]===value)?[parent]:[];
      if(sql.includes('INSERT INTO "StoreChatMessage"')){
        if(messages.some(row=>row[0]===values[0]))return [];
        messages.push(values);
        return [{id:values[0]}];
      }
      return messages.filter(row=>[row[0],row[1],row[2],row[3],row[6],row[5]].every((value,i)=>values[i]===value));
    },
    $executeRaw:async(...data)=>audits.push(data)
  };
  let handler;
  const router={get(){},post(path,callback){if(path.endsWith('/notification-reply'))handler=callback},put(){},patch(){}};
  const source=readFileSync(new URL('../src/routes/store-chat.js',import.meta.url),'utf8')
    .replace(/^import .*;$/gm,'').replace('export async function','async function').replace('export default router;','return router;');
  new Function('express','prisma','crypto','isPlatformSuperAdmin','chatMessageId','chatSendContext','categoryTopic','sendStoreChatPush','nativePushStatus','mountChatGroups',source)(
    {Router:()=>router},db,crypto,()=>false,chatMessageId,chatSendContext,categoryTopic,async value=>pushed.push(value),()=>({configured:false}),()=>{}
  );
  const requestId=crypto.randomUUID();
  async function request({body='Απάντηση',messageId=parent.id,user=owner}={}){
    const res={code:200,status(code){this.code=code;return this},setHeader(){},json(value){this.value=value}};
    await handler({body:{body,requestId},user,params:{storeId:store.id,messageId}},res,error=>{res.code=error.status||500});
    return res;
  }
  assert.equal((await request({user:{...owner,companyId:'other'}})).code,404);
  assert.equal((await request({messageId:'foreign-parent'})).code,404);
  assert.equal((await request({body:'  '})).code,400);
  assert.equal(messages.length,0);
  const first=await request();
  const replay=await request();
  assert.equal(first.code,201);
  assert.equal(replay.code,200);
  assert.equal(replay.value.id,first.value.id);
  assert.equal((await request({body:'Άλλο κείμενο'})).code,409);
  assert.equal(messages.length,1);
  assert.equal(audits.length,1);
  assert.deepEqual(messages[0].slice(1),[store.companyId,store.id,owner.id,'SHIFT','Απάντηση',parent.id]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(pushed,[{store,senderId:owner.id,messageId:first.value.id,topic:'CASH'}]);
});
