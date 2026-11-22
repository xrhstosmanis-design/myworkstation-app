import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFile} from 'node:fs/promises';
import {createFtextRouter} from '../src/routes/ftext-v1.js';
import {stopFtextBeforeExecution} from '../src/services/ftext-handoff.js';
import {ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
import {stopFixture} from './helpers/ftext-stop-fixture.mjs';
test('actual employee stop and device terminal acknowledgement enforce separate authentication, exact scope and no execution',async()=>{
 const f=stopFixture({phase:'OFFERED'}),source=await readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const helpers=source.split('\n').filter(l=>l.startsWith('function assertStore(')||l.startsWith('async function storeFor(')).join('\n'),line=source.split('\n').find(l=>l.startsWith("router.post('/stores/:storeId/ftext-cash/:requestId/stop-before-execution'"));assert.ok(line);
 const db={$transaction:async fn=>fn(f.tx),store:{findFirst:async({where})=>where.id===f.scope.storeId&&where.companyId===f.scope.companyId?{id:f.scope.storeId}:null}},router=express.Router();
 new Function('router','prisma','requestTerminal','stopFtextBeforeExecution','ftextCashService','ftextCashRequestView',helpers+'\n'+line)(router,db,async req=>req.headers['x-terminal']||f.scope.terminalPos,stopFtextBeforeExecution,{unpublishedContext:f.context},ftextCashRequestView);
 const service={authenticated:async(token,action)=>{if(token!=='synthetic-device')throw Object.assign(Error('Unauthorized device'),{status:401});return action(f.tx,f.device,f.settings);}};
 const app=express();app.use(express.json());app.use('/ftext',createFtextRouter({service,db:{},ensure:async()=>{},userAuth:()=>assert.fail('Device stop used employee auth')}));
 app.use((req,res,next)=>{if(!req.headers['x-actor'])return res.sendStatus(401);req.user={id:req.headers['x-actor'],companyId:req.headers['x-company']||f.scope.companyId,storeId:f.scope.storeId,tokenType:'STORE_OPERATOR'};next()});app.use(router);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const stop=(headers={},store=f.scope.storeId,body={stopBeforeExecution:true})=>fetch(base+'/stores/'+store+'/ftext-cash/'+f.row.id+'/stop-before-execution',{method:'POST',headers:{'content-type':'application/json','x-actor':'cashier',...headers},body:JSON.stringify(body)});
 const device=(body,token='synthetic-device')=>fetch(base+'/ftext/device/cash-handoff-accept',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
 try{
  assert.equal((await stop({'x-actor':''})).status,401);assert.equal((await stop({},'foreign')).status,403);assert.equal((await stop({'x-company':'foreign'})).status,404);assert.equal((await stop({'x-terminal':'foreign'})).status,409);assert.equal((await stop({'x-actor':'foreign'})).status,409);assert.equal((await stop({},f.scope.storeId,{stopBeforeExecution:true,command:'PAY'})).status,400);assert.equal(f.writes,0);
  let res=await stop();assert.equal(res.status,200);const stopped=await res.json();assert.equal(stopped.allowResend,false);assert.equal(stopped.request.operatorReleaseMode,'RELEASED');assert.equal(stopped.request.status,'DISPATCHED');
  assert.equal((await device(f.handoffInput(),'foreign')).status,401);assert.equal((await device({...f.handoffInput(),nonce:'370a0232-aeb7-4320-9919-d96c3f9f52d6'})).status,409);
  res=await device(f.handoffInput());assert.equal(res.status,200);const ack=await res.json();assert.equal(ack.state,'STOPPED');assert.equal(ack.authorization,null);assert.equal(ack.allowResend,false);assert.equal(ack.stop.id,f.row.checkoutJson.ftextPreExecutionStop.proofHash);
  assert.deepEqual(await(await device(f.handoffInput())).json(),ack);assert.equal((await stop()).status,200);assert.equal(f.writes,1);
 }finally{await new Promise(r=>server.close(r))}
});
