import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {stopFixture} from './helpers/ftext-stop-fixture.mjs';
import {ensureFtextCashSchema,ftextCashLifecycleReviewProposal} from '../src/services/ftext-cash-schema.js';
import {prepareFtextCashRequest,recordFtextCashResult,findPendingFtextCashRequest,ftextCashRequestView} from '../src/services/ftext-cash-requests.js';
import {pollFtextDeviceWork} from '../src/services/ftext-device-work.js';
import {acceptFtextHandoff,stopFtextBeforeExecution} from '../src/services/ftext-handoff.js';
import {finalizeFtextCashRequest} from '../src/services/ftext-cash-finalize.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native unpublished stop: real row-lock stop/accept races, immutable replay, live next claim and zero financial writers',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient();
 try{for(const [method,format] of [['CASH','OPERATOR_CONFIRMATION'],['CARD','OPERATOR_CONFIRMATION'],['CARD','POS_LINE8_OS7']])await t.test(method+'/'+format,async()=>{
  const f=stopFixture({method,format}),schema='ftext_stop_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
  const fresh=()=>{f.device.lastSeenAt=new Date();f.device.metadata.ftextLastStatus.checkedAt=new Date().toISOString();f.device.metadata.ftextLastStatus.receivedAt=new Date().toISOString();};
  const base={settings:f.settings,scope:f.scope,sessionId:'shift-a',requestHash:'original',checkout:{actorId:'cashier',paymentMethod:method},items:[{productId:'product-a',name:'SYNTHETIC',quantity:1,effectiveUnitPrice:1.25,lineTotal:1.25,discount:0,fiscalDepartment:4,vatRate:13}],summary:{subtotal:1.25,discount:0,total:1.25}};
  const prepare=key=>a.$transaction(tx=>prepareFtextCashRequest(tx,{...base,clientTransactionId:key}));
  const stop=(db,id,actor='cashier')=>db.$transaction(tx=>stopFtextBeforeExecution(tx,id,f.scope,actor,{stopBeforeExecution:true},{context:f.context}));
  const poll=async()=>{fresh();return a.$transaction(tx=>pollFtextDeviceWork(tx,f.device,f.settings,{handoffVersion:1,handoffStopVersion:1}));};
  const accept=(db,r)=>{fresh();return db.$transaction(tx=>acceptFtextHandoff(tx,f.device,f.settings,{requestId:r.id,settingsHash:r.settingsHash,nonce:r.handoff.nonce,commandHash:r.handoff.commandHash,readyForExecution:true}));};
  try{
   await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;await ensureFtextCashSchema(a,{manifest:ftextCashLifecycleReviewProposal()});
   const controlSettings={...f.settings,companyId:'company-control',storeId:'store-control',terminalPos:'POS-CONTROL',serialNumber:'CONTROL01'},controlScope={...f.scope,companyId:controlSettings.companyId,storeId:controlSettings.storeId,terminalPos:controlSettings.terminalPos};
   const control=await a.$transaction(tx=>prepareFtextCashRequest(tx,{...base,settings:controlSettings,scope:controlScope,clientTransactionId:'control-original'}));
   const prepared=await prepare('prepared-original'),before=prepared; // Independent raw SQL snapshot; Prisma Decimal is not structured-cloneable.
   await assert.rejects(stop(a,prepared.id,'foreign'));await assert.rejects(a.$transaction(tx=>stopFtextBeforeExecution(tx,prepared.id,{...f.scope,terminalPos:'FOREIGN'},'cashier',{stopBeforeExecution:true},{context:f.context})));
   const stopped=await stop(a,prepared.id);assert.equal(ftextCashRequestView(stopped).operatorReleaseMode,'RELEASED');
   for(const k of ['status','plan','result','resultHash','saleId','claimedByDeviceId','claimedTokenVersion','dispatchedAt','clientTransactionId'])assert.deepEqual(stopped[k],before[k]);
   assert.deepEqual(await stop(b,prepared.id),stopped);assert.equal(await findPendingFtextCashRequest(a,f.scope),null);
   await assert.rejects(finalizeFtextCashRequest(a,prepared.id,f.scope,{context:f.context}));
   const next=await prepare('next-after-prepared-stop'),offer=(await poll()).request;assert.equal(offer.id,next.id);assert.equal(offer.handoff.stopVersion,1);
   const pair=await Promise.all([stop(a,offer.id),stop(b,offer.id)]);assert.deepEqual(pair[0].checkoutJson.ftextPreExecutionStop,pair[1].checkoutJson.ftextPreExecutionStop);
   const terminal=await accept(a,offer);assert.equal(terminal.state,'STOPPED');assert.equal(terminal.authorization,null);assert.deepEqual(await accept(b,offer),terminal);
   assert.equal((await poll()).request,null,'Stopped OFFERED work must not starve the next request');
   await assert.rejects(a.$transaction(tx=>recordFtextCashResult(tx,f.device,f.settings,{requestId:offer.id,settingsHash:offer.settingsHash,outcome:'REQUIRES_CHECK',description:'The physical receipt could not be verified. Do not resend.'})));
   await assert.rejects(finalizeFtextCashRequest(a,offer.id,f.scope,{context:f.context}));
   const race=await prepare('stop-accept-race'),raceOffer=(await poll()).request;assert.equal(raceOffer.id,race.id);
   const outcomes=await Promise.allSettled([stop(a,race.id),accept(b,raceOffer)]);
   const row=(await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${race.id}`)[0];
   if(row.checkoutJson.ftextPreExecutionStop){
    assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'fulfilled');assert.equal(outcomes[1].value.state,'STOPPED');assert.equal(outcomes[1].value.authorization,null);
    await prepare('accepted-first');const accepted=(await poll()).request;const ack=await accept(a,accepted);assert.equal(ack.state,'ACCEPTED');assert.ok(ack.authorization.acceptedAt);await assert.rejects(stop(b,accepted.id));
   }else{
    assert.equal(outcomes[0].status,'rejected');assert.equal(outcomes[1].status,'fulfilled');assert.equal(outcomes[1].value.state,'ACCEPTED');assert.ok(outcomes[1].value.authorization.acceptedAt);await assert.rejects(stop(a,race.id));
   }
   assert.deepEqual((await a.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${control.id}`)[0],control);
   const tables=await a.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname=current_schema()`;assert.equal(tables.some(r=>['Sale','Payment','StoreTransaction','StockMovement','StoreOperatorAudit'].includes(r.tablename)),false);
  }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);}
 });}finally{await admin.$disconnect();}
});
