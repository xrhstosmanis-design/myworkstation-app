import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ftextSettingsHash} from '../src/services/ftext-installation.js';
import {recordFtextOperatorDecision} from '../src/services/ftext-operator-card.js';
import {ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
const settings={companyId:'company-a',storeId:'store-a',fiscalDeviceCode:'FISCAL-01',terminalPos:'POS-01',serialNumber:'SYNTHETIC',workFolder:'C:\\FText',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:4,vatRate:13,vatCode:'2'}]};
const device={id:'device-a',tokenVersion:3};
function fixture(){
 const row={id:'370a0232-aeb7-4320-9919-d96c3f9f52d5',...settings,settingsHash:ftextSettingsHash(settings),status:'REQUIRES_CHECK',saleId:null,claimedByDeviceId:device.id,claimedTokenVersion:3,plan:{payment:{method:'CASH',code:1}},checkoutJson:{actorId:'cashier',paymentMethod:'CASH'}};
 row.result={requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};row.resultHash=createHash('sha256').update(JSON.stringify(row.result)).digest('hex');return row;
}
function harness(row=fixture()){
 let saved=structuredClone(row),writes=0;
 const tx={$queryRaw:async(parts,...values)=>{if(parts.join('?').startsWith('SELECT'))return values[1]===settings.companyId&&values[2]===settings.storeId&&values[3]===settings.terminalPos?[saved]:[];writes++;saved={...saved,checkoutJson:JSON.parse(values[0])};return [saved]}};
 return {get row(){return saved},get writes(){return writes},decide:(outcome,actor='cashier',scope=settings,current={settings,device})=>recordFtextOperatorDecision(tx,row.id,scope,actor,{outcome},{context:async()=>current})};
}
test('CASH original unknown supports uncertain then atomic NO, immutable evidence and replay',async()=>{
 const h=harness(),before=structuredClone(h.row);assert.equal(ftextCashRequestView(h.row).operatorReviewMode,'CASH_UNKNOWN');
 await h.decide('UNCERTAIN');await h.decide('UNCERTAIN');assert.equal(h.writes,1);assert.equal(ftextCashRequestView(h.row).operatorReleaseMode,null);
 await h.decide('NO');assert.equal(h.writes,2);assert.equal(ftextCashRequestView(h.row).operatorReleaseMode,'RELEASED');assert.equal(ftextCashRequestView(h.row).operatorOutcome,'NO');
 await h.decide('NO');assert.equal(h.writes,2);assert.equal(h.row.checkoutJson.ftextCashDecisionHistory.length,2);
 for(const key of ['status','saleId','result','resultHash','plan'])assert.deepEqual(h.row[key],before[key]);
 assert.equal(h.row.checkoutJson.ftextOperatorRelease.readinessVerified,false);
 await assert.rejects(h.decide('YES'));await assert.rejects(h.decide('UNCERTAIN'));assert.equal(h.writes,2);
});
test('CASH review refuses missing/changed/fiscal/late/foreign evidence and never grants YES',async()=>{
 for(const patch of [{status:'DISPATCHED',result:null,resultHash:null},{status:'CONFIRMED'},{saleId:'sale'},{resultHash:'a'.repeat(64)},{result:{...fixture().result,code:0}},{checkoutJson:{...fixture().checkoutJson,ftextVoid:{status:'REQUESTED'}}},{checkoutJson:{...fixture().checkoutJson,ftextLateCashReceipt:{result:{outcome:'CONFIRMED'}}}},{claimedTokenVersion:4},{claimedByDeviceId:'foreign'},{lifecycleGeneration:'1'},{serialNumber:'foreign'},{plan:{payment:{method:'CARD',code:2}}}]){
  const h=harness({...fixture(),...patch});await assert.rejects(h.decide('NO'));assert.equal(h.writes,0);
 }
 const h=harness();for(const outcome of ['YES'])await assert.rejects(h.decide(outcome));
 await assert.rejects(h.decide('NO','foreign'));await assert.rejects(h.decide('NO','cashier',{...settings,storeId:'foreign'}));
 for(const patch of [{cashEnabled:false},{lifecycleGeneration:'1'},{serialNumber:'foreign'},{storeId:'foreign'}])await assert.rejects(h.decide('NO','cashier',settings,{settings:{...settings,...patch},device}));assert.equal(h.writes,0);
});

function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native CASH review races once, preserves immutable evidence, excludes released pending and late results; no business tables',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const {ensureFtextCashSchema,ftextCashLifecycleReviewProposal}=await import('../src/services/ftext-cash-schema.js');
 const {prepareFtextCashRequest,claimFtextCashRequest,recordFtextCashResult,findPendingFtextCashRequest}=await import('../src/services/ftext-cash-requests.js');
 const {finalizeFtextCashRequest}=await import('../src/services/ftext-cash-finalize.js');
 const admin=new PrismaClient(),schema='ftext_cash_review_'+Date.now(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 const context=async()=>({settings,device}),input={settings,scope:settings,sessionId:'shift-a',clientTransactionId:'cash-review-a',requestHash:'original',checkout:{paymentMethod:'CASH',actorId:'cashier'},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:1.25,discount:0,lineTotal:1.25,fiscalDepartment:4,vatRate:13}],summary:{subtotal:1.25,discount:0,total:1.25}};
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await ensureFtextCashSchema(a,{manifest:ftextCashLifecycleReviewProposal()});
  const row=await a.$transaction(tx=>prepareFtextCashRequest(tx,input));await a.$transaction(tx=>claimFtextCashRequest(tx,device,settings));
  const unknown={requestId:row.id,settingsHash:row.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'};
  const before=await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,unknown));
  const decide=(db,outcome,actor='cashier')=>db.$transaction(tx=>recordFtextOperatorDecision(tx,row.id,settings,actor,{outcome},{context}));
  await assert.rejects(decide(a,'NO','foreign'));await assert.rejects(decide(a,'YES'));
  await assert.rejects(a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'other'})));
  const results=await Promise.all([decide(a,'NO'),decide(b,'NO')]);assert.deepEqual(results[0].checkoutJson.ftextCashDecision,results[1].checkoutJson.ftextCashDecision);
  const after=results[0];assert.equal(after.checkoutJson.ftextCashDecisionHistory.length,1);for(const k of ['result','resultHash','status','saleId','plan','clientTransactionId'])assert.deepEqual(after[k],before[k]);
  assert.equal(await findPendingFtextCashRequest(a,settings),null);await assert.rejects(finalizeFtextCashRequest(a,row.id,settings,{context}));
  await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,device,settings,{...unknown,outcome:'CONFIRMED',code:0,serialNumber:settings.serialNumber,dayId:'1',dayCounter:'1',deviceTime:'fixture',qr:'https://www1.aade.gr/dcl/fixture',rawResultHash:'b'.repeat(64)})));
  const next=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...input,clientTransactionId:'next'}));assert.notEqual(next.id,row.id);assert.equal(next.status,'PREPARED');
  assert.equal((await a.$transaction(tx=>recordFtextCashResult(tx,device,settings,unknown))).id,row.id);
  const tables=await a.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname=current_schema()`;assert.equal(tables.some(t=>['Sale','Payment','StoreTransaction','StockMovement'].includes(t.tablename)),false);
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});

test('actual POS outcome HTTP handles CASH without card decision/finalization and enforces original scope',async()=>{
 const {default:express}=await import('express'),{readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/routes/store-pos.js',import.meta.url),'utf8');
 const start=source.indexOf("router.post('/stores/:storeId/ftext-cash/:requestId/outcome'"),end=source.indexOf("router.post('/stores/:storeId/ftext-cash/:requestId/finalize'",start);
 assert.ok(start>=0&&end>start);let saved=fixture(),writes=0;
 const db={store:{findFirst:async({where})=>where.id===settings.storeId&&where.companyId===settings.companyId?{id:settings.storeId}:null},$transaction:async fn=>fn({$queryRaw:async(parts,...v)=>{if(parts.join('?').startsWith('SELECT'))return v[0]===saved.id&&v[1]===settings.companyId&&v[2]===settings.storeId&&v[3]===settings.terminalPos?[saved]:[];writes++;saved={...saved,checkoutJson:JSON.parse(v[0])};return [saved]}})};
 const router=express.Router(),helpers=source.split('\n').filter(l=>l.startsWith('function assertStore(')||l.startsWith('async function storeFor(')).join('\n');
 new Function('router','prisma','requestTerminal','recordFtextOperatorDecision','ftextCashService','finalizeFtextCashRequest','ftextCashRequestView',helpers+'\n'+source.slice(start,end))(router,db,async req=>req.headers['x-terminal']||settings.terminalPos,recordFtextOperatorDecision,{cashContext:async()=>({settings,device})},()=>assert.fail('review finalized a sale'),ftextCashRequestView);
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(!req.headers['x-actor'])return res.sendStatus(401);req.user={id:req.headers['x-actor'],companyId:req.headers['x-company']||settings.companyId,tokenType:'STORE_OPERATOR',storeId:settings.storeId};next()});app.use(router);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const send=(outcome,headers={},store=settings.storeId)=>fetch('http://127.0.0.1:'+server.address().port+'/stores/'+store+'/ftext-cash/'+saved.id+'/outcome',{method:'POST',headers:{'content-type':'application/json','x-actor':'cashier',...headers},body:JSON.stringify({outcome})});
 try{
  assert.equal((await send('NO',{'x-actor':''})).status,401);assert.equal((await send('NO',{},'foreign')).status,403);assert.equal((await send('NO',{'x-company':'foreign'})).status,404);assert.equal((await send('NO',{'x-terminal':'foreign'})).status,409);assert.equal((await send('NO',{'x-actor':'foreign'})).status,409);assert.equal((await send('YES')).status,409);assert.equal(writes,0);
  let res=await send('UNCERTAIN');assert.equal(res.status,200);assert.equal((await res.json()).request.operatorOutcome,'UNCERTAIN');
  res=await send('NO');assert.equal(res.status,200);const body=await res.json();assert.equal(body.request.operatorReleaseMode,'RELEASED');assert.equal(body.allowResend,false);assert.equal(saved.status,'REQUIRES_CHECK');assert.equal(saved.saleId,null);assert.equal(writes,2);
  assert.equal((await send('NO')).status,200);assert.equal(writes,2);
 }finally{await new Promise(r=>server.close(r))}
});
