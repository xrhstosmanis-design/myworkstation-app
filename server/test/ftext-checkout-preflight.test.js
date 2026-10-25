import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';

test('actual checkout preflight selects scoped ftext before offline RBS while retaining RBS guards',async()=>{
 const source=await readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const start=source.indexOf('    const offlineOrigin=body.paymentMethod==='),end=source.indexOf('    const txResult=await prisma.$transaction',start);
 assert.ok(start>0&&end>start);
 const block=source.slice(start,end),reads=[],writers=[];
 const ftextLine=source.split('\n').find(s=>s.startsWith('async function ftextConfigured('));
 const db={$queryRaw:async(parts,...v)=>{reads.push(v);return parts.join('').includes('to_regclass')?[{name:'fixture.CloudDevice'}]:v.join('|')==='company-A|store-A|ftext:POS-A'?[{configured:1}]:[]}};
 const actualConfigured=new Function(ftextLine+';return ftextConfigured;')();
 const run=new Function('prisma','ftextConfigured','capDriverV1WriterState','ensureRbsCapDriverV1RequestSchema',`return async(req,store,terminalPos,body)=>{${block};return {ftextPreflightConfigured,capDriverV1Active};}`)(db,actualConfigured,async(...scope)=>{writers.push(scope);return {configured:true,online:false}},()=>assert.fail('offline/FTEXT preflight must not bootstrap RBS requests'));
 const app=express();app.use(express.json());app.post('/checkout',async(req,res)=>{try{res.json(await run({user:{companyId:'company-A'}},{id:'store-A'},req.headers['x-terminal']||'POS-A',req.body))}catch(e){res.status(e.status||500).json({error:e.message,code:e.code})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=(method,terminal='POS-A')=>fetch('http://127.0.0.1:'+server.address().port+'/checkout',{method:'POST',headers:{'content-type':'application/json','x-terminal':terminal},body:JSON.stringify({paymentMethod:method,operationChannel:'COUNTER',items:[{productId:'water',quantity:1}]})});
 try {
  for(const method of ['CASH','CARD','MIXED']){const r=await request(method);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ftextPreflightConfigured:true,capDriverV1Active:false})}
  assert.deepEqual(writers,[],'selected ftext never consults RBS writer state');
  let r=await request('CASH','POS-B');assert.equal(r.status,503);assert.equal((await r.json()).code,'RBS_CAPDRIVER_V1_WRITER_OFFLINE');
  r=await request('MIXED','POS-B');assert.equal(r.status,409);assert.equal((await r.json()).code,'RBS_CAPDRIVER_V1_MIXED_UNSUPPORTED');
  assert.deepEqual(writers,[['company-A','store-A','POS-B'],['company-A','store-A','POS-B']]);
  assert.ok(reads.some(v=>v.join('|')==='company-A|store-A|ftext:POS-A'));assert.ok(reads.some(v=>v.join('|')==='company-A|store-A|ftext:POS-B'));
 } finally {await new Promise(r=>server.close(r))}
});

test('actual transaction rechecks provider selection before any ftext context or sale action',async()=>{
 const source=await readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const start=source.indexOf('const ftextIsConfigured=await ftextConfigured(tx,'),end=source.indexOf('const ftextContext=',start);
 assert.ok(start>0&&end>start);
 const verify=new Function('ftextConfigured',`return async(tx,req,store,terminalPos,ftextPreflightConfigured)=>{${source.slice(start,end)};return ftextIsConfigured}`);
 for(const before of [false,true]){
  const run=verify(async()=>!before);await assert.rejects(run({}, {user:{companyId:'A'}},{id:'A'},'POS-A',before),e=>e.status===409);
  assert.equal(await verify(async()=>before)({}, {user:{companyId:'A'}},{id:'A'},'POS-A',before),before);
 }
});
