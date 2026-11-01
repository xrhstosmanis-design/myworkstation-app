import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
import {createAiOwnerWalletRoutes} from '../src/routes/ai-owner-wallet.js';
import {createWalletNotificationDispatcher} from '../src/services/ai-owner-wallet-notifications.js';
import {createAutomaticReportManagement} from '../src/services/automatic-report-dispatch-policy.js';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';

function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}
test('postpaid native proof requires local isolated PostgreSQL and runs unskipped in CI',()=>{
 for(const url of ['postgresql://u:p@localhost/production','postgresql://u:p@remote/feature_test','postgresql://u:p@localhost/feature_test?host=remote','postgresql://u:p@localhost/feature_test?schema=a&schema=b'])assert.equal(isolated(url),false);
 if(process.env.CI)assert.ok(isolated(),'Full CI must execute real postpaid PostgreSQL/HTTP cases');
});
test('native postpaid credit/debt/payment/recipient authority/outbox are atomic and preserve original controls',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wallet_postpaid_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});let server,created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   'CREATE TYPE "UserRole" AS ENUM (\'SUPER_ADMIN\',\'OWNER\',\'ADMIN\',\'MANAGER\',\'EMPLOYEE\')',
   'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" "UserRole","companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
   'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp,"lastSeenAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp)',
   'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)',
   'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"cash" integer,"stock" integer)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES('c','Synthetic postpaid LAB',true),('x','Untouched foreign company',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','Selected','c',true),('control','Control','c',true),('foreign','Foreign','x',true),('inactive','Inactive','c',false)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false),('control','c',0,false,false),('foreign','x',0,false,false),('inactive','c',0,false,false)`;
  await db.$executeRaw`INSERT INTO "User" VALUES('admin','admin@example.invalid','Admin','SUPER_ADMIN','c',1,false),('owner','owner@example.invalid','Owner','OWNER','c',1,false),('employee','employee@example.invalid','Employee','EMPLOYEE','c',1,false)`;
  for(const id of ['admin','owner','employee'])await db.$executeRaw`INSERT INTO "UserSession" VALUES(${id+'-session'},${id},NULL,NULL,NULL,NOW(),NOW(),NOW()+INTERVAL '1 day',NULL)`;
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('unchanged',777,333)`;
  const business=await db.$queryRaw`SELECT * FROM "BusinessControl"`;
  await provisionAutomaticReportDispatchSchema(db);
  const repository=createAiOwnerWalletRepository(db);await repository.ensure();await repository.credit('x',{amountMicros:'5000000',receiptReference:'FOREIGN-ORIGINAL'},'admin');
  const foreignBefore=await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='x'`;
  const now=new Date(),scope={companyId:'c',storeId:'s',actorId:'admin'},activation={valid:true,enabled:false,epoch:randomUUID(),activationFingerprint:'a'.repeat(64),issuedAt:new Date(now-86400000).toISOString(),notBefore:new Date(now-3600000).toISOString()};
  const reports=createAutomaticReportManagement({db,activationProvider:()=>activation,clock:()=>now,sendVerification:async()=>{throw Error('No invitation may be sent')}});
  for(const email of ['a@example.invalid','b@example.invalid']){const r=await reports.getDispatchManagement(scope);await reports.authorizeAdministratorRecipient(scope,{email,expectedRecipientVersion:0,expectedAuthorizationRevision:0,expectedGrantRevision:Number(r.grant?.revision||0),expectedPolicyRevision:Number(r.policy?.revision||0),allowedFrequencies:['DAILY'],explicitAuthorization:true})}
  const originalReportRows=await db.$queryRaw`SELECT * FROM "AutomaticReportRecipient" ORDER BY "recipientId"`;
  assert.ok(originalReportRows.every(r=>r.verifiedAt===null));
  const identities={admin:{id:'admin',sessionId:'admin-session',sessionVersion:1,isSuperAdmin:true,platformRole:'SUPER_ADMIN'},owner:{id:'owner',sessionId:'owner-session',sessionVersion:1,isSuperAdmin:true,platformRole:'SUPER_ADMIN'},employee:{id:'employee',sessionId:'employee-session',sessionVersion:1,isSuperAdmin:true,platformRole:'SUPER_ADMIN'},stale:{id:'admin',sessionId:'admin-session',sessionVersion:0,isSuperAdmin:true,platformRole:'SUPER_ADMIN'}};
  const app=express();app.use(express.json());app.use('/api/ai-wallet',createAiOwnerWalletRoutes({db,repository,enabled:()=>true,env:{},authenticate:(req,res,next)=>{req.user=identities[req.headers['x-test-user']||'admin'];next()}}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/ai-wallet/platform/companies`;
  const request=async(path,{method='GET',body,user='admin'}={})=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-test-user':user},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
  const session={sessionId:'admin-session',sessionVersion:1};
  let source=(await request('/c/postpaid-recipients?storeId=s')).body;
  assert.equal(source.recipients.length,2);assert.equal(source.generation,'0');
  const grant=(reference,overrides={})=>({version:0,storeId:'s',generation:source.generation,amountMicros:'10000000',reference,reason:'Synthetic unpaid AI credit',sendNotifications:true,recipientFingerprint:source.fingerprint,unpaidCreditConfirmed:true,...overrides});
  let first;
  await t.test('real HTTP rejects current non-admin, stale session, foreign store, forged email and missing acknowledgement without writes',async()=>{
   for(const user of ['owner','employee','stale'])assert.ok((await request('/c/postpaid-credits',{method:'POST',body:grant('DENIED-'+user),user})).status>=400);
   assert.equal((await request('/c/postpaid-credits',{method:'POST',body:grant('DENIED-FOREIGN',{storeId:'foreign'})})).status,404);
   assert.equal((await request('/c/postpaid-credits',{method:'POST',body:{...grant('DENIED-EMAIL'),emails:['foreign@example.invalid']}})).status,400);
   assert.equal((await request('/c/postpaid-credits',{method:'POST',body:grant('DENIED-ACK',{unpaidCreditConfirmed:false})})).status,400);
   assert.equal((await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`).length,0);
  });
  await t.test('one atomic unpaid grant prepares exactly two notices, keeps verification/prices/activation untouched and no-ops retries',async()=>{
   await db.$executeRaw`INSERT INTO "AiOwnerWallet" ("companyId","cycleId","balanceMicros","reservedMicros","lastCreditMicros") VALUES('c','original-control',2000000,1000000,2000000)`;
   await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros") VALUES('original-credit','c','CREDIT','POSTPAID/LEGACY-CONTROL','CREDITED',2000000)`;
   await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","feature") VALUES('original-review','c','control','USAGE','ORIGINAL-CONTROL-HOLD','REVIEW',1000000,'INVOICE_OPENAI')`;
   assert.equal((await request('/c/credits',{method:'POST',body:{amountMicros:'2000000',receiptReference:'POSTPAID/LEGACY-CONTROL',receiptConfirmed:true}})).body.replayed,true);
   const body=grant('ACCOUNT-FIRST');const result=await request('/c/postpaid-credits',{method:'POST',body});assert.equal(result.status,200);first=result.body.id;assert.equal(result.body.noticesPrepared,2);assert.equal((await db.$queryRaw`SELECT "storeId" FROM "AiOwnerWalletEntry" WHERE "id"=${first}`)[0].storeId,null,'All funding remains company-owned');
   const replay=await request('/c/postpaid-credits',{method:'POST',body});assert.equal(replay.body.id,first);assert.equal(replay.body.replayed,true);
   assert.equal((await request('/c/postpaid-credits',{method:'POST',body:{...body,reason:'Changed reason'}})).status,409);
   const r=await repository.read('c');assert.equal(r.availableMicros,'11000000');assert.equal(r.reservedMicros,'1000000');assert.equal(r.postpaid.outstandingMicros,'10000000');assert.equal(r.enabled,false);assert.equal(r.emailEnabled,false);assert.equal(r.customerPricing.additionalMarkupBps,0);assert.equal(r.customerPricing.callFeeMicros,'0');assert.equal(r.customerPricing.invoiceFeeMicros,'0');
   await repository.configure('c',{version:1,enabled:false,emailEnabled:false,notificationOwnerId:'',invoiceEnabled:false},'admin');
   assert.equal((await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='c' AND "emailStatus"='PENDING'`).length,2,'Legacy owner-mail settings must not revoke explicitly authorized financial notices');
   assert.equal((await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='c'`).length,2);assert.deepEqual(await db.$queryRaw`SELECT * FROM "AutomaticReportRecipient" ORDER BY "recipientId"`,originalReportRows);
  });
  await t.test('partial/full receipts reduce only debt and cannot be replayed as a second balance credit or overpayment',async()=>{
   const startVersion=(await repository.read('c')).version;const body={version:startVersion,creditEntryId:first,amountMicros:'4000000',receiptReference:'RECEIPT-PARTIAL',receiptConfirmed:true};assert.equal((await request('/c/postpaid-payments',{method:'POST',body})).status,200);assert.equal((await request('/c/postpaid-payments',{method:'POST',body})).body.replayed,true);
   assert.equal((await request('/c/postpaid-payments',{method:'POST',body:{...body,version:2,amountMicros:'5000000'}})).status,409);
   assert.equal((await request('/c/credits',{method:'POST',body:{amountMicros:'4000000',receiptReference:'RECEIPT-PARTIAL',receiptConfirmed:true}})).status,409);
   assert.equal((await request('/c/postpaid-payments',{method:'POST',body:{...body,version:2,receiptReference:'FOREIGN-ORIGINAL'}})).status,409);
   assert.equal((await request('/c/credits',{method:'POST',body:{amountMicros:'10000000',receiptReference:'POSTPAID/ACCOUNT-FIRST',receiptConfirmed:true}})).status,400);
   assert.equal((await request('/c/postpaid-payments',{method:'POST',body:{...body,version:startVersion+1,amountMicros:'7000000',receiptReference:'OVERPAYMENT'}})).status,400);
   let r=await repository.read('c');assert.equal(r.availableMicros,'11000000');assert.equal(r.reservedMicros,'1000000');assert.equal(r.postpaid.outstandingMicros,'6000000');assert.equal(r.version,startVersion+1);
   const sent=[];const drain=createWalletNotificationDispatcher({repository,enabled:()=>true,send:async mail=>{sent.push(mail);if(sent.length===1)throw Error('synthetic ambiguous transport');return {messageId:'synthetic-accepted',accepted:[mail.to],rejected:[]}}});
   assert.equal((await drain()).attempted,2);assert.equal(sent.length,2);assert.ok(sent.every(m=>m.text.includes('6,00')&&m.text.includes('11,00')&&m.subject.includes('εκκρεμεί εξόφληση')));assert.deepEqual((await db.$queryRaw`SELECT "emailStatus" FROM "AiOwnerWalletNotice" WHERE "companyId"='c' ORDER BY "emailStatus"`).map(r=>r.emailStatus),['ACCEPTED','UNKNOWN']);assert.equal((await drain()).attempted,0);assert.equal(sent.length,2);
   assert.equal((await request('/c/postpaid-payments',{method:'POST',body:{...body,version:startVersion+1,amountMicros:'6000000',receiptReference:'RECEIPT-FINAL'}})).status,200);r=await repository.read('c');assert.equal(r.availableMicros,'11000000');assert.equal(r.reservedMicros,'1000000');assert.equal(r.postpaid.outstandingMicros,'0');assert.equal(r.postpaid.grants[0].status,'PAID');
  });
  await t.test('concurrent clients serialize one wallet revision; same-reference replay commits one grant and late exception rolls back all artifacts',async()=>{
   const r2=createAiOwnerWalletRepository(other);await r2.ensure();const v=(await repository.read('c')).version;
   const bodies=[grant('CONCURRENT-A',{version:v,amountMicros:'1000000'}),grant('CONCURRENT-B',{version:v,amountMicros:'1000000'})];
   const results=await Promise.allSettled([repository.grantPostpaid('c',bodies[0],'admin',session),r2.grantPostpaid('c',bodies[1],'admin',session)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='AI_WALLET_CHANGED').length,1);
   const b=grant('CONCURRENT-SAME',{version:v+1,amountMicros:'1000000'});const same=await Promise.all([repository.grantPostpaid('c',b,'admin',session),r2.grantPostpaid('c',b,'admin',session)]);assert.equal(same[0].id,same[1].id);assert.equal(same.filter(r=>r.replayed).length,1);
   let armed=false;const proxy=new Proxy(db,{get(target,key){if(key==='$transaction')return(work,options)=>target.$transaction(async tx=>{const value=await work(tx);if(armed)throw Error('synthetic late commit refusal');return value},options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}),rollback=createAiOwnerWalletRepository(proxy);await rollback.ensure();armed=true;
   const before={wallet:await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`,entries:await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "companyId"='c' ORDER BY "id"`,notices:await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='c' ORDER BY "id"`,audits:await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='c' ORDER BY "id"`};
   await assert.rejects(rollback.grantPostpaid('c',grant('LATE-ROLLBACK',{version:v+2}),'admin',session),/late commit/);
   assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='c'`,before.wallet);assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "companyId"='c' ORDER BY "id"`,before.entries);assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='c' ORDER BY "id"`,before.notices);assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWalletAudit" WHERE "companyId"='c' ORDER BY "id"`,before.audits);
  });
  await t.test('late recipient revocation prevents every queued financial notice and lifecycle cutover rejects old financial events',async()=>{
   const r=await reports.getDispatchManagement(scope),entry=r.recipients[0];await reports.saveRecipientConsent(scope,{recipientId:entry.recipient.recipientId,expectedRecipientVersion:Number(entry.recipient.version),expectedRevision:Number(entry.consent.revision),active:false,allowedFrequencies:[],explicitConsent:false});
   let sends=0;const drain=createWalletNotificationDispatcher({repository,enabled:()=>true,send:async()=>{sends++;throw Error('must never send revoked metadata')}});assert.equal((await drain()).attempted,0);assert.equal(sends,0);assert.equal((await db.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "companyId"='c' AND "emailStatus"='PENDING'`).length,0);
   const current=(await repository.read('c')).version;assert.equal((await request('/c/postpaid-credits',{method:'POST',body:grant('STALE-CONTACTS',{version:current})})).status,409);
   await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`;
   assert.ok((await request('/c/postpaid-credits',{method:'POST',body:grant('STALE-GENERATION',{version:current,sendNotifications:false,recipientFingerprint:null})})).status>=400);
   const fresh=await request('/c/postpaid-recipients?storeId=s');assert.equal(fresh.status,200);assert.equal(fresh.body.generation,'1');assert.equal(fresh.body.recipients.length,0);
   const mismatch=grant('FORGED-FRESH',{version:current,generation:'1',sendNotifications:false,recipientFingerprint:null});await assert.rejects(withLifecycleContext({s:'0'},()=>repository.grantPostpaid('c',mismatch,'admin',session)),e=>e.code==='AI_WALLET_CHANGED');
  });
  await t.test('company debt remains payable after originating store retirement without funding or resurrecting it',async()=>{
   await db.$executeRaw`UPDATE "Store" SET "active"=false WHERE "id"='s'`;await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "retired"=true WHERE "storeId"='s'`;
   let r=await repository.read('c');const beforeBalance=r.availableMicros;
   for(const g of r.postpaid.grants.filter(g=>g.status!=='PAID')){const result=await request('/c/postpaid-payments',{method:'POST',body:{version:r.version,creditEntryId:g.id,amountMicros:g.outstandingMicros,receiptReference:'CLOSED-STORE-'+g.id,receiptConfirmed:true}});assert.equal(result.status,200);r=await repository.read('c')}
   assert.equal(r.availableMicros,beforeBalance);assert.equal(r.postpaid.outstandingMicros,'0');assert.ok((await db.$queryRaw`SELECT "storeId" FROM "AiOwnerWalletEntry" WHERE "feature"='POSTPAID_PAYMENT'`).every(r=>r.storeId===null));assert.equal((await db.$queryRaw`SELECT "active" FROM "Store" WHERE "id"='s'`)[0].active,false);
  });
  assert.equal((await db.$queryRaw`SELECT "reservedMicros" FROM "AiOwnerWallet" WHERE "companyId"='c'`)[0].reservedMicros,1000000n);assert.equal((await db.$queryRaw`SELECT "status" FROM "AiOwnerWalletEntry" WHERE "id"='original-review'`)[0].status,'REVIEW');
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "BusinessControl"`,business);assert.deepEqual(await db.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"='x'`,foreignBefore);assert.ok((await db.$queryRaw`SELECT "verifiedAt" FROM "AutomaticReportRecipient"`).every(r=>r.verifiedAt===null));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();await other.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
