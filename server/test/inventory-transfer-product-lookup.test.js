import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {z} from 'zod';
import {PrismaClient} from '@prisma/client';

test('actual transfer handler supports generated Prisma without a Product delegate',async()=>{
  const client=new PrismaClient();
  try{
    assert.equal(client.product,undefined);
    const handlers=new Map();let transactions=0,queries=0;
    const prisma={store:{findMany:async()=>[{id:'source'},{id:'destination'}]},product:client.product,
      $queryRaw:async(_strings,...values)=>{queries++;assert.deepEqual(values,['product','company']);return [{id:'product',name:'Virtual',costPrice:1,salePrice:2}]},
      $transaction:async()=>{transactions++;return {duplicate:true}}};
    const Router=()=>Object.fromEntries(['get','post','use','patch','delete','put'].map(method=>[method,(path,...hs)=>handlers.set(method+path,hs.at(-1))]));
    const source=fs.readFileSync(new URL('../src/routes/inventory-archive.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n/gm,'');
    new Function('Router','prisma','crypto','z',source)(Router,prisma,crypto,z);
    const result=await new Promise((resolve,reject)=>handlers.get('post/stock-transfer')({user:{companyId:'company',id:'owner'},body:{sourceStoreId:'source',destinationStoreId:'destination',productId:'product',quantity:1,reason:'Virtual transfer',idempotencyKey:'isolated-lookup-01'}},{json:resolve,status(){return this}},reject));
    assert.equal(result.ok,true);assert.equal(result.duplicate,true);assert.equal(queries,1);assert.equal(transactions,1);
  }finally{await client.$disconnect()}
});
