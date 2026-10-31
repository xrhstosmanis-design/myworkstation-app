import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import express from 'express';
import {createAutomaticReportManagement} from '../src/services/automatic-report-dispatch-policy.js';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {createAutomaticReportDispatchRouter} from '../src/routes/automatic-report-dispatch.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';
import {reportRecipientAuthority} from '../src/services/automatic-report-administrator-authorization.js';

function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}
test('SuperAdmin native fixture refuses production, remote and URL overrides',()=>{
 for(const u of ['postgresql://u:p@localhost/production','postgresql://u:p@remote/module_test','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?schema=x&schema=y'])assert.equal(isolated(u),false);
 if(process.env.CI)assert.ok(isolated(),'CI must run actual SuperAdmin authorization PostgreSQL/HTTP proof');
});
test('native administrative address/grant/policy are atomic, scoped, revocable and do not verify mailboxes or send invitations',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='report_admin_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false,server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await a.$executeRawUnsafe('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"role" TEXT NOT NULL,"sessionVersion" INTEGER NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"generation" BIGINT NOT NULL,"maintenance" BOOLEAN NOT NULL,"retired" BOOLEAN NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "BusinessControl" ("id" TEXT PRIMARY KEY,"cash" INTEGER NOT NULL,"stock" INTEGER NOT NULL)');
  await a.$executeRaw`INSERT INTO "Store" VALUES ('s','c','Synthetic',true),('control','foreign','Control',true),('race','c','Race',true),('rollback','c','Rollback',true)`;
  await a.$executeRaw`INSERT INTO "User" VALUES ('admin','SUPER_ADMIN',2),('employee','EMPLOYEE',0),('owner','OWNER',0)`;
  await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('s','c',3,false,false),('control','foreign',3,false,false),('race','c',3,false,false),('rollback','c',3,false,false)`;
  await a.$executeRaw`INSERT INTO "BusinessControl" VALUES ('unaffected',777,555)`;await provisionAutomaticReportDispatchSchema(a);
  const now=new Date('2026-11-01T08:00:00.000Z'),activation={valid:true,enabled:false,epoch:'42aa5b03-e883-4c16-a4c3-d239e85674ed',issuedAt:'2026-10-30T00:00:00.000Z',notBefore:'2026-10-31T05:00:00.000Z',activationFingerprint:'a'.repeat(64)};
  let mail=0;const management=db=>createAutomaticReportManagement({db,clock:()=>now,activationProvider:()=>activation,sendVerification:async()=>{mail++;assert.fail('administrative approval must never send an invitation')}}),service=management(a),scope={actorId:'admin',companyId:'c',storeId:'s'};
  const run=fn=>withLifecycleContext({s:'3',race:'3',rollback:'3',control:'3'},fn);
  const input={email:'mailbox@example.invalid',expectedRecipientVersion:0,expectedAuthorizationRevision:0,expectedGrantRevision:0,expectedPolicyRevision:0,allowedFrequencies:['DAILY','WEEKLY','MONTHLY'],explicitAuthorization:true};
  const snapshot=()=>a.$queryRaw`SELECT row_to_json(r)::text AS data FROM "AutomaticReportRecipient" r ORDER BY "recipientId"`;
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:req.headers['x-test-user']||'admin',isSuperAdmin:true};run(next)});app.use('/companies/:companyId/stores/:storeId',createAutomaticReportDispatchRouter(a,{management:service}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const http=(body,actor='admin',suffix='/recipients/authorize',company='c',store='s')=>fetch(`http://127.0.0.1:${server.address().port}/companies/${company}/stores/${store}${suffix}`,{method:'POST',headers:{'content-type':'application/json','x-test-user':actor},body:JSON.stringify(body)});
  let id,first;
  await t.test('actual current database role and strict body prohibit Owner/employee/spoof/foreign scope',async()=>{
   for(const actor of ['employee','owner'])assert.equal((await http(input,actor)).status,403);
   assert.equal((await http({...input,actorId:'admin'})).status,400);assert.equal((await http({...input,explicitAuthorization:false})).status,400);
   assert.ok([404,409].includes((await http(input,'admin','/recipients/authorize','foreign')).status));assert.deepEqual(await snapshot(),[]);
  });
  await t.test('existing unverified address is explicitly approved and atomically activates only selected store policy/grant',async()=>{
   const saved=await run(()=>service.saveRecipient(scope,{email:input.email,expectedVersion:0}));id=saved.recipientId;
   await a.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=${'b'.repeat(64)},"challengeNonce"=${'c'.repeat(32)},"challengePurpose"='CONSENT',"challengeExpiresAt"=${new Date(now.getTime()+600000)} WHERE "recipientId"=${id}`;
   first={...input,recipientId:id,expectedRecipientVersion:1};const response=await http(first);assert.equal(response.status,200);assert.equal((await response.json()).externalActivationEnabled,false);
   const state=await run(()=>service.getDispatchManagement(scope));assert.equal(state.policy.dispatchEnabled,true);assert.equal(state.grant.active,true);assert.equal(state.grant.principalId,'admin');assert.equal(state.grant.notBefore,now.toISOString());assert.equal(state.recipients[0].recipient.verifiedAt,null);assert.equal(state.recipients[0].recipient.verifiedBy,null);assert.equal(state.recipients[0].authorization.basis,'SUPER_ADMIN');assert.doesNotMatch(JSON.stringify(state),/proofHash|challengeHash|challengeNonce/);
   const [r]=await a.$queryRaw`SELECT * FROM "AutomaticReportRecipient" WHERE "recipientId"=${id}`;assert.equal(r.challengeHash,null);const [c]=await a.$queryRaw`SELECT * FROM "AutomaticReportRecipientConsent" WHERE "recipientId"=${id}`;assert.equal(c.consentedBy,'report-superadmin:admin');assert.equal(reportRecipientAuthority(r,c,{generation:'3',principalId:'admin'}).basis,'SUPER_ADMIN');
  });
  await t.test('second recipient shares one list without rewriting first, cutoffs or duplicating no-op authorization',async()=>{
   const before=await snapshot(),grantBefore=await a.$queryRaw`SELECT row_to_json(g)::text AS data FROM "AutomaticReportAutomationGrant" g`;
   await run(()=>service.authorizeAdministratorRecipient(scope,{...input,email:'second@example.invalid',expectedGrantRevision:1,expectedPolicyRevision:1}));
   const after=await snapshot();assert.equal(after.length,2);assert.deepEqual(after.find(x=>x.data.includes(id)),before[0]);assert.deepEqual(await a.$queryRaw`SELECT row_to_json(g)::text AS data FROM "AutomaticReportAutomationGrant" g`,grantBefore);
   const stable=await snapshot(),authorizations=await a.$queryRaw`SELECT row_to_json(c)::text AS data FROM "AutomaticReportRecipientConsent" c ORDER BY "recipientId"`;
   const result=await run(()=>service.authorizeAdministratorRecipient(scope,{...first,expectedAuthorizationRevision:1,expectedGrantRevision:1,expectedPolicyRevision:1}));assert.equal(result.alreadyAuthorized,true);assert.deepEqual(await snapshot(),stable);assert.deepEqual(await a.$queryRaw`SELECT row_to_json(c)::text AS data FROM "AutomaticReportRecipientConsent" c ORDER BY "recipientId"`,authorizations);
   await assert.rejects(run(()=>service.authorizeAdministratorRecipient(scope,first)),{code:'REPORT_REVISION_CHANGED'});
  });
  await t.test('revoke one approval excludes it while retaining the other, then address changes invalidate all old authorities',async()=>{
   await run(()=>service.saveRecipientConsent(scope,{recipientId:id,expectedRecipientVersion:1,expectedRevision:1,active:false}));let state=await run(()=>service.getDispatchManagement(scope));assert.equal(state.recipients.find(x=>x.recipient.recipientId===id).authorization,null);assert.equal(state.recipients.find(x=>x.recipient.recipientId===id).authorizationBasis,'SUPER_ADMIN','inactive approval must not be mislabeled recipient consent');assert.equal(state.recipients.filter(x=>x.authorization?.basis==='SUPER_ADMIN').length,1);
   await run(()=>service.authorizeAdministratorRecipient(scope,{...first,expectedAuthorizationRevision:2,expectedGrantRevision:1,expectedPolicyRevision:1}));
   await run(()=>service.saveRecipient(scope,{recipientId:id,expectedVersion:1,email:'changed@example.invalid'}));state=await run(()=>service.getDispatchManagement(scope));assert.equal(state.policy.dispatchEnabled,false);assert.equal(state.grant.active,false);assert.equal(state.recipients.some(x=>x.authorization),false);
   await run(()=>service.revokeRecipient(scope,{recipientId:id,expectedVersion:2}));state=await run(()=>service.getDispatchManagement(scope));
   await assert.rejects(run(()=>service.authorizeAdministratorRecipient(scope,{...input,email:'changed@example.invalid',expectedGrantRevision:state.grant.revision,expectedPolicyRevision:state.policy.revision})),{code:'REPORT_RECIPIENT_REVOKED'});
  });
  await t.test('two clients cannot both authorize stale snapshots; late commit failure rolls back all three writes',async()=>{
   const racing={...scope,storeId:'race'},results=await Promise.allSettled([run(()=>management(a).authorizeAdministratorRecipient(racing,input)),run(()=>management(b).authorizeAdministratorRecipient(racing,input))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await a.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipient" WHERE "storeId"='race'`)[0].n,1);
   const broken={$transaction:(fn,opts)=>a.$transaction(async tx=>{await fn(tx);throw new Error('synthetic commit failure')},opts)};
   await assert.rejects(run(()=>management(broken).authorizeAdministratorRecipient({...scope,storeId:'rollback'},input)),/synthetic commit failure/);
   for(const name of ['AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportAutomationGrant','AutomaticReportDispatchPolicy'])assert.equal((await a.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${name}" WHERE "storeId"='rollback'`))[0].n,0,name);
  });
  assert.equal(mail,0);assert.deepEqual(await a.$queryRaw`SELECT * FROM "BusinessControl"`,[{id:'unaffected',cash:777,stock:555}]);
  for(const name of ['AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportAutomationGrant','AutomaticReportDispatchPolicy','AutomaticReportPayload','AutomaticReportDeliverySlot'])assert.equal((await a.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${name}" WHERE "storeId"='control'`))[0].n,0,name);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
