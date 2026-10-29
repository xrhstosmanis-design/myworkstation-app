import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../src/chat-operator-auth.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function library(db,enabled=async()=>true){return new Function('jwt','crypto','prisma','chatEnabled','ensureChatMobileSchema','assertCustomerDemoRuntimeClosed',source+';return {renewChatOperatorSession,issueChatOperatorSession,authorizeChatOperator,chatCredentialStamp,CHAT_SESSION_SECONDS}')(jwt,crypto,db,enabled,async()=>{},()=>{})}
const user={id:'employee-credential',employeeId:'employee',storeId:'store-A',companyId:'company-A',role:'EMPLOYEE',tokenType:'STORE_OPERATOR',chatSessionId:'session-A',chatCredentialStamp:'stamp'};
test('renewal keeps chat-only identity, finite expiry and a conditional non-resurrecting database update',async()=>{
 const writes=[],db={$executeRawUnsafe:async(...args)=>{writes.push(args);return 1}},lib=library(db),before=Date.now();
 const result=await lib.renewChatOperatorSession(user,{db,secret:'isolated-test-secret',enabled:async s=>{assert.deepEqual(s,{id:user.storeId,companyId:user.companyId});return true}});
 const claims=jwt.verify(result.token,'isolated-test-secret',{issuer:'myworkstation-chat',audience:'store-chat-only'});
 assert.equal(claims.tokenType,'STORE_CHAT_OPERATOR');assert.equal(claims.chatSessionId,user.chatSessionId);assert.equal(claims.credentialStamp,'stamp');assert.equal(claims.storeId,user.storeId);assert.equal(claims.exp-claims.iat,30*86400);
 assert.equal(writes.length,1);assert.match(writes[0][0],/"revokedAt" IS NULL AND "expiresAt">NOW\(\)/);assert.match(writes[0][0],/GREATEST/);assert.deepEqual(writes[0].slice(2),['session-A','employee-credential','store-A','company-A']);assert.ok(writes[0][1].getTime()>=before+30*86400000);
});
test('revoked, expired, foreign, general-account and disabled-module connections cannot renew',async()=>{
 for(const changed of [0,2]){const db={$executeRawUnsafe:async()=>changed};await assert.rejects(library(db).renewChatOperatorSession(user,{db,secret:'test',enabled:async()=>true}),e=>e.status===401)}
 let writes=0;const db={$executeRawUnsafe:async()=>{writes++;return 1}},lib=library(db);
 for(const patch of [{tokenType:'BACKOFFICE_USER'},{chatSessionId:''},{chatCredentialStamp:''}])await assert.rejects(lib.renewChatOperatorSession({...user,...patch},{db}),e=>e.status===401);
 await assert.rejects(lib.renewChatOperatorSession(user,{db,enabled:async()=>false}),e=>e.status===403);assert.equal(writes,0);
});
test('initial PIN session receives the same finite window and still needs an enabled chat module',async()=>{
 const original=process.env.JWT_SECRET;process.env.JWT_SECRET='test-secret';try{
  const writes=[],db={$executeRawUnsafe:async(...args)=>{writes.push(args);return 1}},row={...user,pinHash:'not-a-real-hash',displayName:'Fixture'};
  const lib=library(db),token=await lib.issueChatOperatorSession(row,{}),decoded=jwt.verify(token,'test-secret');
  assert.equal(decoded.exp-decoded.iat,30*86400);assert.equal(decoded.tokenType,'STORE_CHAT_OPERATOR');assert.equal(writes.length,1);assert.equal(writes[0][4],row.storeId);
  await assert.rejects(library(db,async()=>false).issueChatOperatorSession(row,{}),e=>e.status===403);
 }finally{if(original===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=original}
});
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native renewal cannot revive expired/revoked/foreign rows and preserves a concurrent logout',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='chat_renew_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  await db.$executeRawUnsafe('CREATE TABLE "StoreChatMobileSession" (id text primary key,"operatorId" text,"storeId" text,"companyId" text,"expiresAt" timestamptz,"revokedAt" timestamptz)');
  await db.$executeRawUnsafe('INSERT INTO "StoreChatMobileSession" VALUES ($1,$2,$3,$4,NOW()+interval \'1 hour\',NULL)',user.chatSessionId,user.id,user.storeId,user.companyId);
  const lib=library(db),renew=()=>lib.renewChatOperatorSession(user,{db,secret:'fixture',enabled:async()=>true});await renew();
  const [row]=await db.$queryRawUnsafe('SELECT "expiresAt">NOW()+interval \'29 days\' AS fresh FROM "StoreChatMobileSession"');assert.equal(row.fresh,true);
  for(const patch of [{storeId:'foreign'},{companyId:'foreign'},{id:'foreign'}])await assert.rejects(lib.renewChatOperatorSession({...user,...patch},{db,secret:'fixture',enabled:async()=>true}),e=>e.status===401);
  await Promise.allSettled([renew(),db.$executeRawUnsafe('UPDATE "StoreChatMobileSession" SET "revokedAt"=NOW() WHERE id=$1',user.chatSessionId)]);
  await assert.rejects(renew(),e=>e.status===401);const [revoked]=await db.$queryRawUnsafe('SELECT "revokedAt" IS NOT NULL AS revoked FROM "StoreChatMobileSession"');assert.equal(revoked.revoked,true);
  await db.$executeRawUnsafe('UPDATE "StoreChatMobileSession" SET "revokedAt"=NULL,"expiresAt"=NOW()-interval \'1 minute\'');await assert.rejects(renew(),e=>e.status===401);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
test('every restored chat request stops immediately when the paid chat module is disabled',async()=>{
 const row={id:'operator',employeeId:'employee',companyId:'company',storeId:'store',role:'EMPLOYEE',displayName:'Fixture',pinHash:'fixture-hash'},db={$queryRawUnsafe:async()=>[row]},lib=library(db),payload={...row,iss:'myworkstation-chat',aud:'store-chat-only',chatSessionId:'fixture-session',credentialStamp:lib.chatCredentialStamp(row,'fixture-secret')},req={originalUrl:'/api/store-chat/stores/store/messages'};
 assert.equal(await lib.authorizeChatOperator(req,payload,{db,secret:'fixture-secret',enabled:async()=>false}),null);
 assert.ok(await lib.authorizeChatOperator(req,payload,{db,secret:'fixture-secret',enabled:async()=>true}));
});
