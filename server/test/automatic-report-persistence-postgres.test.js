import fs from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {automaticReportDispatchDDL,provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {createAutomaticReportManagement} from '../src/services/automatic-report-dispatch-policy.js';
import {invalidateStoreDispatchRecipients} from '../src/services/automatic-report-recipients.js';
import {withLifecycleContext} from '../src/services/store-lifecycle-context.js';
function isolated(value=process.env.DATABASE_URL,mode=process.env.NODE_ENV){
 try{
  const u=new URL(value),database=decodeURIComponent(u.pathname);
  if(mode!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(database))return false;
  const seen=new Set();
  for(const[key,entry]of u.searchParams){
   if(seen.has(key))return false;seen.add(key);
   if(key==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(entry))return false;continue}
   const allowed={connection_limit:[1,1000],pool_timeout:[0,600],statement_cache_size:[0,100000]},bounds=Object.hasOwn(allowed,key)?allowed[key]:null;
   if(!bounds||!/^\d{1,6}$/.test(entry)||Number(entry)<bounds[0]||Number(entry)>bounds[1])return false;
  }
  return true;
 }catch{return false}
}

test('persistence native fixture guard rejects remote, production and URL overrides',()=>{
 for(const value of ['postgresql://u:p@localhost/production','postgresql://u:p@localhost/module_test?host=remote','postgresql://u:p@localhost/module_test?options=-csearch_path=public','postgresql://u:p@localhost/module_test?schema=one&schema=two','postgresql://u:p@remote/module_test','postgresql://u:p@localhost/contest'])assert.equal(isolated(value,'test'),false,value);
 assert.equal(isolated('postgresql://u:p@localhost/module_test?schema=public&connection_limit=3','test'),true);assert.equal(isolated('postgresql://u:p@localhost/module_test','production'),false);
 if(process.env.CI)assert.ok(isolated(),'CI must run native persistence fixture');
});
test('native six-table provisioning, mailbox verification/consent, concurrency, invalidation and rollback',{skip:!isolated(),timeout:120000},async t=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='report_persistence_'+randomBytes(12).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await a.$executeRawUnsafe('CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"role" TEXT NOT NULL,"sessionVersion" INTEGER NOT NULL)');
  await a.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"generation" BIGINT NOT NULL,"maintenance" BOOLEAN NOT NULL,"retired" BOOLEAN NOT NULL)');
  await a.$executeRaw`INSERT INTO "Store" VALUES ('s','c','Synthetic',true),('control','c','Control',true)`;await a.$executeRaw`INSERT INTO "User" VALUES ('admin','SUPER_ADMIN',2),('employee','EMPLOYEE',0)`;await a.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('s','c',3,false,false),('control','c',3,false,false)`;
  await t.test('provisioning failure rolls back all DDL atomically before successful explicit provisioning',async()=>{
   let n=0;const wrapped={$transaction:fn=>a.$transaction(tx=>fn({$executeRawUnsafe:sql=>{if(++n===4)throw new Error('synthetic DDL failure');return tx.$executeRawUnsafe(sql)}}))};
   await assert.rejects(provisionAutomaticReportDispatchSchema(wrapped),/synthetic DDL failure/);const [row]=await a.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'AutomaticReportDispatchPolicy'))::text AS name`;assert.equal(row.name,null);await provisionAutomaticReportDispatchSchema(a);const [count]=await a.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'AutomaticReport%'`;assert.equal(count.n,6);
  });
  await t.test('actual PostgreSQL columns agree with prospective reviewed manifest',async()=>{
   const manifest=JSON.parse(fs.readFileSync(new URL('../../ops/backup/lifecycle/automatic-report-manifest.proposed.json',import.meta.url),'utf8'));
   for(const name of ['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot']){
    const columns=await a.$queryRaw`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=${name} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
    assert.deepEqual(columns.map(c=>[c.name,c.type,c.notNull]),manifest.knownColumns[name],name);
   }
  });
  let now=new Date('2026-10-22T12:00:00.000Z');const mail=[],activation={valid:true,enabled:false,epoch:'42aa5b03-e883-4c16-a4c3-d239e85674ed',issuedAt:'2026-10-22T11:00:00.000Z',notBefore:'2026-10-23T04:00:00.000Z',activationFingerprint:'a'.repeat(64)};
  const management=db=>createAutomaticReportManagement({db,clock:()=>now,activationProvider:()=>activation,sendVerification:async m=>{const row=(await b.$queryRaw`SELECT "challengeHash" FROM "AutomaticReportRecipient" WHERE "email"=${m.to}`)[0];assert.ok(row.challengeHash,'challenge committed before SMTP callback');mail.push(m);return {accepted:[m.to],rejected:[],messageId:'native-fixture'}}});
  const service=management(a),scope={actorId:'admin',companyId:'c',storeId:'s'},run=fn=>withLifecycleContext({s:'3'},fn);let recipientId;
  const token=()=>mail.at(-1).text.match(/Κωδικός: ([a-f0-9]{32})/)[1];
  await t.test('real management verifies mailbox, separate consent proof and safe public status',async()=>{
   const r=await run(()=>service.saveRecipient(scope,{email:'mailbox@example.invalid',expectedVersion:0}));recipientId=r.recipientId;
   const issued=await run(()=>service.issueRecipientVerification(scope,{recipientId,expectedVersion:1}));assert.equal(issued.issued,true);assert.doesNotMatch(JSON.stringify(issued),new RegExp(token()));await run(()=>service.confirmRecipientVerification(scope,{recipientId,expectedVersion:1,token:token()}));
   const [empty]=await b.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipientConsent"`;assert.equal(empty.n,0);
   now=new Date(now.getTime()+61000);await run(()=>service.issueRecipientConsent(scope,{recipientId,expectedVersion:1,expectedRevision:0,allowedFrequencies:['DAILY']}));await run(()=>service.confirmRecipientConsent(scope,{recipientId,expectedVersion:1,expectedRevision:0,token:token(),explicitConsent:true}));
   const state=await run(()=>service.getDispatchManagement(scope));assert.equal(state.recipients[0].consent.active,true);assert.doesNotMatch(JSON.stringify(state),/challengeHash|challengeNonce|proofHash/);
   await assert.rejects(run(()=>service.saveAutomationGrant(scope,{expectedRevision:0,active:true,allowedFrequencies:['DAILY']})),{code:'REPORT_EXPLICIT_AUTHORIZATION_REQUIRED'});
   await run(()=>service.saveAutomationGrant(scope,{expectedRevision:0,active:true,allowedFrequencies:['DAILY'],explicitAuthorization:true}));await run(()=>service.saveDispatchPolicy(scope,{expectedRevision:0,dispatchEnabled:true,allowsProvisional:true,allowedFrequencies:['DAILY']}));
  });
  await t.test('native wrong token attempts commit, stale revision refuses and role cannot be supplied',async()=>{
   now=new Date(now.getTime()+61000);await run(()=>service.issueRecipientConsent(scope,{recipientId,expectedVersion:1,expectedRevision:1,allowedFrequencies:['DAILY']}));
   await assert.rejects(run(()=>service.confirmRecipientConsent(scope,{recipientId,expectedVersion:1,expectedRevision:1,token:'0'.repeat(32),explicitConsent:true})),{code:'REPORT_CHALLENGE_INVALID'});const [r]=await b.$queryRaw`SELECT "challengeAttempts" FROM "AutomaticReportRecipient" WHERE "recipientId"=${recipientId}`;assert.equal(r.challengeAttempts,1);
   await assert.rejects(run(()=>service.saveDispatchPolicy(scope,{expectedRevision:0,dispatchEnabled:false,allowsProvisional:true,allowedFrequencies:['DAILY']})),{code:'REPORT_REVISION_CHANGED'});
   await assert.rejects(run(()=>service.saveRecipient(scope,{email:'bad@example.invalid',expectedVersion:0,actorId:'employee'})));
   await assert.rejects(withLifecycleContext({s:'3'},()=>service.saveRecipient({...scope,actorId:'employee'},{email:'bad@example.invalid',expectedVersion:0})),{code:'REPORT_SUPER_ADMIN_REQUIRED'});
  });
  await t.test('native reader SHARE blocks first recipient insertion with explicit busy/no retry',async()=>{
   await b.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR SHARE`;await assert.rejects(run(()=>service.saveRecipient(scope,{email:'blocked@example.invalid',expectedVersion:0})),{code:'REPORT_DISPATCH_BUSY'})});const [n]=await a.$queryRaw`SELECT count(*)::int AS n FROM "AutomaticReportRecipient"`;assert.equal(n.n,1);
  });
  await t.test('email invalidation rolls back atomically and accepted slot persists after committed invalidation',async()=>{
   await a.$executeRaw`INSERT INTO "AutomaticReportDeliverySlot" VALUES ('retained','c','s',1,'ACCEPTED',null,'{}'::jsonb)`;
   const before=await a.$queryRaw`SELECT "version"::text AS version,"verifiedAt" FROM "AutomaticReportRecipient" WHERE "recipientId"=${recipientId}`;
   const change=tx=>invalidateStoreDispatchRecipients(tx,scope,{beforeEmails:['old@example.invalid'],afterEmails:['new@example.invalid'],now});
   await assert.rejects(a.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR NO KEY UPDATE`;await change(tx);throw new Error('rollback')}),/rollback/);assert.deepEqual(await b.$queryRaw`SELECT "version"::text AS version,"verifiedAt" FROM "AutomaticReportRecipient" WHERE "recipientId"=${recipientId}`,before);
   await a.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"='s' FOR NO KEY UPDATE`;await change(tx)});
   const [r]=await b.$queryRaw`SELECT "verifiedAt","challengeHash","version"::text AS version FROM "AutomaticReportRecipient" WHERE "recipientId"=${recipientId}`;assert.equal(r.verifiedAt,null);assert.equal(r.challengeHash,null);assert.equal(r.version,'2');const [p]=await b.$queryRaw`SELECT "dispatchEnabled" FROM "AutomaticReportDispatchPolicy"`;assert.equal(p.dispatchEnabled,false);const [g]=await b.$queryRaw`SELECT "active" FROM "AutomaticReportAutomationGrant"`;assert.equal(g.active,false);const [c]=await b.$queryRaw`SELECT "active","proofHash" FROM "AutomaticReportRecipientConsent"`;assert.equal(c.active,false);assert.equal(c.proofHash,null);assert.equal((await b.$queryRaw`SELECT "status" FROM "AutomaticReportDeliverySlot"`)[0].status,'ACCEPTED');
  });
  await t.test('native constraints reject invalid frequencies and oversized projection without weakening slot contract',async()=>{await assert.rejects(a.$executeRaw`UPDATE "AutomaticReportDispatchPolicy" SET "allowedFrequencies"=ARRAY['HOURLY']::text[]`);await assert.rejects(a.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "version"=0`);assert.equal(automaticReportDispatchDDL.length,6)});
 }finally{try{await Promise.all([a.$disconnect(),b.$disconnect()])}finally{try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}}
});
