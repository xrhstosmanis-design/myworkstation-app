import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createAutomaticReportManagement,dispatchSchemaReady,readLockedDispatchAuthorization} from '../src/services/automatic-report-dispatch-policy.js';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {createAutomaticReportInvitations,parseInvitation} from '../src/services/automatic-report-invitations.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';

function isolated(value=process.env.DATABASE_URL){
 try{const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(u.pathname)||u.hash)return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!Object.hasOwn({connection_limit:1,pool_timeout:1,statement_cache_size:1},k)||!/^\d{1,6}$/.test(v))return false}return true}catch{return false}
}
test('invitation native fixture refuses remote/production/URL override targets',()=>{
 for(const value of ['postgresql://u:p@localhost/production','postgresql://u:p@remote/module_test','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=a&schema=b'])assert.equal(isolated(value),false);
 if(process.env.CI)assert.ok(isolated(),'CI must execute real PostgreSQL invitation proof');
});
test('native invitation proof, public authority, stale links, rollback and two-client confirmation',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='report_invitation_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false,now=new Date('2026-10-25T10:00:00.000Z'),mail=[];
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await a.$executeRawUnsafe('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"role" TEXT NOT NULL,"sessionVersion" INTEGER NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"generation" BIGINT NOT NULL,"maintenance" BOOLEAN NOT NULL,"retired" BOOLEAN NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "BusinessControl" ("id" TEXT PRIMARY KEY,"cash" INTEGER NOT NULL,"stock" INTEGER NOT NULL)');
  await a.$executeRaw`INSERT INTO "Store" VALUES ('s','c','Synthetic',true),('control','foreign','Control',true)`;await a.$executeRaw`INSERT INTO "User" VALUES ('admin','SUPER_ADMIN',2),('employee','EMPLOYEE',0)`;await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('s','c',3,false,false),('control','foreign',3,false,false)`;await a.$executeRaw`INSERT INTO "BusinessControl" VALUES ('unaffected',777,555)`;
  await provisionAutomaticReportDispatchSchema(a);
  const management=createAutomaticReportManagement({db:a,clock:()=>now,activationProvider:()=>({valid:true,enabled:false}),sendVerification:async m=>{assert.ok((await b.$queryRaw`SELECT "challengeHash" FROM "AutomaticReportRecipient" WHERE "email"=${m.to}`)[0]?.challengeHash,'committed before SMTP');mail.push(m);return {accepted:[m.to],rejected:[],messageId:'native-invitation'}}});
  const authority=db=>createAutomaticReportInvitations({db,clock:()=>now,readAuthorization:readLockedDispatchAuthorization,schemaReady:dispatchSchemaReady}),publicA=authority(a),publicB=authority(b),scope={companyId:'c',storeId:'s',actorId:'admin'},run=fn=>withLifecycleContext({s:'3'},fn);
  const issue=()=>run(()=>management.issueRecipientInvitation(scope,{email:'mailbox@example.invalid',expectedVersion:mail.length?1:0,allowedFrequencies:['DAILY']}));
  const latest=()=>parseInvitation(new URL(mail.at(-1).text.match(/https:\/\/[^\s]+/)[0]).hash.slice(1));
  const recipient=async()=>((await a.$queryRaw`SELECT row_to_json(r)::text AS data FROM "AutomaticReportRecipient" r WHERE "email"='mailbox@example.invalid'`)[0]?.data);
  let proof;
  await t.test('real issuance commits one hash-only CONSENT challenge, no token response, preserved schema',async()=>{
   const result=await issue();proof=latest();assert.equal(result.invitationIssued,true);assert.equal(mail.length,1);assert.doesNotMatch(JSON.stringify(result),new RegExp(proof.token));
   const [r]=await b.$queryRaw`SELECT "challengePurpose","verifiedAt","challengeHash" FROM "AutomaticReportRecipient"`;assert.equal(r.challengePurpose,'CONSENT');assert.equal(r.verifiedAt,null);assert.match(r.challengeHash,/^[a-f0-9]{64}$/);
   await assert.rejects(run(()=>management.issueRecipientInvitation({...scope,actorId:'employee'},{email:'other@example.invalid',expectedVersion:0,allowedFrequencies:['DAILY']})),{code:'REPORT_SUPER_ADMIN_REQUIRED'});
  });
  await t.test('inspection is read-only and actor-injected/foreign/stale envelopes expose no authority',async()=>{
   const before=await recipient();const preview=await publicA.inspect(proof);assert.equal(preview.storeName,'Synthetic');assert.deepEqual(preview.allowedFrequencies,['DAILY']);assert.equal(await recipient(),before);
   await assert.rejects(publicA.inspect({...proof,actorId:'admin'}));await assert.rejects(publicA.inspect({...proof,companyId:'foreign'}));assert.equal(await recipient(),before);
   assert.equal((await a.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipientConsent"`)[0].n,0);
  });
  await t.test('actual legacy VERIFY and CONSENT cannot consume the invitation hash domain',async()=>{
   await assert.rejects(run(()=>management.confirmRecipientVerification(scope,{recipientId:proof.recipientId,expectedVersion:1,token:proof.token})),{code:'REPORT_CHALLENGE_INVALID'});
   assert.equal((await a.$queryRaw`SELECT "verifiedAt" FROM "AutomaticReportRecipient"`)[0].verifiedAt,null);
   // Synthetic arrangement isolates hash-domain rejection from the legacy
   // consent endpoint's separate prerequisite that the email is verified.
   await a.$executeRaw`UPDATE "AutomaticReportRecipient" SET "verifiedAt"=${now} WHERE "recipientId"=${proof.recipientId}`;
   await assert.rejects(run(()=>management.confirmRecipientConsent(scope,{recipientId:proof.recipientId,expectedVersion:1,expectedRevision:0,token:proof.token,explicitConsent:true})),{code:'REPORT_CHALLENGE_INVALID'});
   assert.equal((await a.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipientConsent"`)[0].n,0);
   await a.$executeRaw`UPDATE "AutomaticReportRecipient" SET "verifiedAt"=NULL WHERE "recipientId"=${proof.recipientId}`;
  });
  await t.test('public confirmation rolls back atomically if commit fails, without falsely consuming proof',async()=>{
   const before=await recipient(),broken=authority({$transaction:(fn,options)=>a.$transaction(async tx=>{await fn(tx);throw new Error('synthetic commit failure')},options)});
   await assert.rejects(broken.confirm({invitation:proof,explicitConsent:true}),/synthetic commit failure/);assert.equal(await recipient(),before);assert.equal((await a.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipientConsent"`)[0].n,0);
  });
  await t.test('two independent clients consume proof once with mailbox actor, no policy/grant activation',async()=>{
   const results=await Promise.allSettled([publicA.confirm({invitation:proof,explicitConsent:true}),publicB.confirm({invitation:proof,explicitConsent:true})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
   const [c]=await a.$queryRaw`SELECT "revision"::text AS revision,"consentedBy","active","proofHash" FROM "AutomaticReportRecipientConsent"`;assert.equal(c.revision,'1');assert.equal(c.active,true);assert.equal(c.consentedBy,'report-recipient:'+proof.recipientId);assert.match(c.proofHash,/^[a-f0-9]{64}$/);
   const [r]=await a.$queryRaw`SELECT "verifiedBy","challengeHash" FROM "AutomaticReportRecipient"`;assert.equal(r.verifiedBy,c.consentedBy);assert.equal(r.challengeHash,null);
   for(const table of ['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportPayload','AutomaticReportDeliverySlot'])assert.equal((await a.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`))[0].n,0,table);
   const before=await recipient();await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}));assert.equal(await recipient(),before,'consumed proof cannot spend future attempts');
  });
  await t.test('already verified/current consent reuses identity with zero writes and no new email',async()=>{
   const before=await recipient(),count=mail.length;const result=await issue();assert.equal(result.alreadyConfirmed,true);assert.equal(mail.length,count);assert.equal(await recipient(),before);
  });
  await t.test('replacement nonce and revision fences keep old links from exhausting current attempts',async()=>{
   await run(()=>management.saveRecipientConsent(scope,{recipientId:proof.recipientId,expectedRecipientVersion:1,expectedRevision:1,active:false}));now=new Date(now.getTime()+61000);await issue();const old=latest();now=new Date(now.getTime()+61000);await issue();proof=latest();
   const before=await recipient();for(const stale of [old,{...proof,version:2},{...proof,issuedAt:old.issuedAt}])await assert.rejects(publicA.confirm({invitation:stale,explicitConsent:true}));assert.equal(await recipient(),before);
   const wrong={...proof,token:'0'.repeat(32)};for(let i=0;i<5;i++)await assert.rejects(publicA.confirm({invitation:wrong,explicitConsent:true}));assert.equal((await a.$queryRaw`SELECT "challengeAttempts" FROM "AutomaticReportRecipient"`)[0].challengeAttempts,5);await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}));
  });
  await t.test('busy parent, expiry, lifecycle cutover and revocation refuse without a second send or consent',async()=>{
   now=new Date(now.getTime()+61000);await issue();proof=latest();const before=await recipient();
   await b.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR SHARE`;await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}),{code:'REPORT_DISPATCH_BUSY'})});assert.equal(await recipient(),before);
   now=new Date(now.getTime()+600001);await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}));assert.equal(await recipient(),before,'expired proof changes no attempts');
   await issue();proof=latest();await a.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=4 WHERE "storeId"='s'`;const cutover=await recipient();await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}));assert.equal(await recipient(),cutover);await a.$executeRaw`UPDATE "StoreLifecycleFence" SET "generation"=3 WHERE "storeId"='s'`;
   await run(()=>management.revokeRecipient(scope,{recipientId:proof.recipientId,expectedVersion:1}));const revoked=await recipient();await assert.rejects(publicA.confirm({invitation:proof,explicitConsent:true}));assert.equal(await recipient(),revoked);
   const [c]=await a.$queryRaw`SELECT "active" FROM "AutomaticReportRecipientConsent"`;assert.equal(c.active,false);assert.deepEqual(await a.$queryRaw`SELECT * FROM "BusinessControl"`,[{id:'unaffected',cash:777,stock:555}]);
  });
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
