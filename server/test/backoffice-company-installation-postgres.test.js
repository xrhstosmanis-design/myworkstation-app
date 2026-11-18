import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PrismaClient} from '@prisma/client';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {ensureStoreChatInteractions} from '../src/chat-interactions.mjs';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {provisionMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {provisionMonthlyInventoryCaptureSchema} from '../src/services/monthly-inventory-capture-schema.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {verifyNativeCompanyPartyReports} from './fixtures/backoffice-company-party-reports-native.mjs';
import {verifyNativeLegacyStoreReports} from './fixtures/backoffice-store-reports-legacy-native.mjs';
import {verifyNativeCompanyInventoryReports} from './fixtures/backoffice-company-inventory-reports-native.mjs';
import {verifyNativeCompanyAuditReports} from './fixtures/backoffice-company-audit-reports-native.mjs';
import {verifyNativeCompanyReports} from './fixtures/backoffice-company-reports-native.mjs';
import {verifyNativeSalesAndCompanyRoles} from './fixtures/backoffice-staff-sales-native.mjs';
import {verifyNativeWorkforceReads} from './fixtures/backoffice-staff-workforce-native.mjs';
import {verifyInstalledCompanyRuntime} from './fixtures/backoffice-company-installed-runtime.mjs';
import {createBackofficeCompanyInstallation} from '../src/services/backoffice-company-installation.js';
import {lifecycleWorkerCapabilityMac} from '../src/services/store-lifecycle-worker-ready.js';
import {LIFECYCLE_ROW_DIGEST_FORMAT} from '../src/services/store-lifecycle-recovery-stream.js';
const execute=promisify(execFile),revision='a'.repeat(40),secret='isolated-company-installation-native-secret',q=value=>'"'+value.replaceAll('"','""')+'"',literal=value=>"'"+value.replaceAll("'","''")+"'";
const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actor={id:'admin',tokenType:'BACKOFFICE_USER',sessionId:'admin-session',sessionVersion:0,isSuperAdmin:true,platformRole:'SUPER_ADMIN',role:'OWNER',mustChangePassword:false};
test('actual personal Super Admin issuer matches the unscoped installer fixture claims',async()=>{
 const {issueSession}=await import('../src/routes/auth.js'),{default:jwt}=await import('jsonwebtoken');
 const prior=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-company-installer-issuer-regression';
 try{
  const user={id:'admin',companyId:'company',role:'SUPER_ADMIN',sessionVersion:0,mustChangePassword:false,fullName:'SYNTHETIC',email:'admin@company-install.invalid',company:{id:'company',name:'SYNTHETIC'}};
  const issued=await issueSession(user,{headers:{}},'Isolated installer',{userSession:{create:async()=>({id:'admin-session',deviceName:'Isolated installer',expiresAt:new Date(Date.now()+60000)})}});
  const claims=jwt.verify(issued.token,process.env.JWT_SECRET);
  for(const [key,value] of Object.entries(actor))assert.equal(claims[key],value,key);
  for(const key of ['supportContext','storeId','staffAccess'])assert.equal(Object.hasOwn(claims,key),false,key);
 }finally{if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior}
});
// Only the AWS object-storage process is substituted. psql/pg_dump/pg_restore,
// catalogue validation, full COPY audit, guards and the installer remain native.
const awsFixture=`#!/usr/bin/env python3
import json,os,pathlib,sys,shutil
a=sys.argv[1:]; action=a[1]; root=pathlib.Path(os.environ['MWS_COMPANY_TEST_OBJECTS']); root.mkdir(exist_ok=True)
def value(k): return a[a.index(k)+1]
if action=='get-bucket-versioning': out={'Status':'Enabled'}
elif action=='get-bucket-encryption': out={'ServerSideEncryptionConfiguration':{'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]}}
elif action=='get-public-access-block': out={'PublicAccessBlockConfiguration':{k:True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']}}
elif action=='get-bucket-policy-status': out={'PolicyStatus':{'IsPublic':False}}
elif action=='put-object':
 shutil.copyfile(value('--body'),root/'object.dump'); (root/'metadata.json').write_text(json.dumps({'key':value('--key'),'metadata':json.loads(value('--metadata'))})); out={'VersionId':'native-fixture-exact-version'}
elif action in ['head-object','get-object']:
 m=json.loads((root/'metadata.json').read_text()); assert value('--key')==m['key']; assert value('--version-id')=='native-fixture-exact-version'
 if action=='head-object': out={'ContentLength':(root/'object.dump').stat().st_size,'ServerSideEncryption':'AES256','Metadata':m['metadata']}
 else: shutil.copyfile(root/'object.dump',a[a.index('--version-id')+2]); out={}
else: raise ValueError('Unexpected storage command')
print(json.dumps(out))
`;

async function fixture(profile){
 const admin=new PrismaClient(),name='company_install_'+randomBytes(8).toString('hex')+'_test',directory=await mkdtemp(join(tmpdir(),'company-install-native-'));let db,created=false;
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=new PrismaClient({datasourceUrl:url.href});
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe('CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE');
  for(const table of new Set(metadata.columns.map(c=>c.table)))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
  await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);await ensureStoreChatInteractions(db);
  if(profile==='CAPTURE'){await provisionMonthlyInventorySnapshotSchema(db);await provisionMonthlyInventoryCaptureSchema(db)}
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","updatedAt") VALUES ('company','SYNTHETIC',NOW()),('foreign','CONTROL',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","companyId","name","updatedAt") VALUES ('selected','company','SYNTHETIC',NOW()),('sibling','company','CONTROL',NOW()),('foreign','foreign','CONTROL',NOW())`);
  for(const[id,role]of[['admin','SUPER_ADMIN'],['staff','EMPLOYEE']])await db.$executeRawUnsafe(`INSERT INTO "User"("id","companyId","email","passwordHash","fullName","role","updatedAt") VALUES ($1,'company',$2,'FIXTURE-NOT-LOGIN-HASH','SYNTHETIC',$3::"UserRole",NOW())`,id,id+'@company-install.invalid',role);
  await db.$executeRawUnsafe(`INSERT INTO "UserSession"("id","userId","expiresAt") VALUES ('admin-session','admin',NOW()+INTERVAL '1 hour')`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffAccount"("userId","companyId","username","pinHash") VALUES ('staff','company','native.fixture','FIXTURE-NOT-PIN-HASH')`);
  await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffGrant"("userId","companyId","storeId","profile","capabilities") VALUES ('staff','company','selected','AUDITOR','["inventory.read"]'::jsonb)`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('item','company','SYNTHETIC'),('foreign-item','foreign','CONTROL')`);
  for(const[id,store,product,quantity]of[['stock','selected','item',-7.5],['sibling-stock','sibling','item',5.75],['foreign-stock','foreign','foreign-item',11]])await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES($1,$2,$3,$4)`,id,store,product,quantity);
  const source=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/'+(profile==='BASE'?'manifest.json':'monthly-inventory-capture-manifest.proposed.json'),import.meta.url))),core=createLifecycleInstallationCore(source,{sourceRevision:revision});
  await db.$transaction(tx=>core.installInTransaction(tx,actor,{companyId:'company',storeId:'selected'}),{timeout:120000,maxWait:3000});
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence"("storeId","companyId","planHash") VALUES ('sibling','company',$1),('foreign','foreign',$1)`,core.describe().planHash);
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=7 WHERE "storeId"='selected'`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreLifecycleRuntime" ("id" text PRIMARY KEY,"heartbeatJson" text NOT NULL,"mac" text NOT NULL)`);
  const heartbeatJson=JSON.stringify({protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1',manifestHash:core.describe().planHash,workerRevision:revision,checkedAt:new Date().toISOString(),storagePolicyVerified:true,rowDigestFormat:LIFECYCLE_ROW_DIGEST_FORMAT});
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleRuntime" VALUES('backup-worker',$1,$2)`,heartbeatJson,lifecycleWorkerCapabilityMac(secret,heartbeatJson));
  await writeFile(join(directory,'aws'),awsFixture,{mode:0o700});await chmod(join(directory,'aws'),0o700);
  const env={...process.env,DATABASE_URL:url.href,RENDER_GIT_COMMIT:revision,BACKUP_MONITOR_SECRET:secret,AWS_REGION:'fixture-region',S3_BUCKET_NAME:'fixture-private',S3_ENDPOINT_URL:'https://fixture.invalid',MWS_COMPANY_TEST_OBJECTS:join(directory,'objects'),PATH:directory+':'+process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'};
  const service=createBackofficeCompanyInstallation(db,{sourceRevision:revision,enabled:true,profile,env});
  return {db,env,service,directory,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();await rm(directory,{recursive:true,force:true})}};
 }catch(error){await db?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();await rm(directory,{recursive:true,force:true});throw error}
}

for(const profile of ['BASE','CAPTURE'])test(`native ${profile} company installation consumes actual full backup/private restore and preserves existing epochs and STORE policies`,{skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:600000},async()=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const f=await fixture(profile);
 try{
  await verifyNativeLegacyStoreReports({db:f.db});
  for(const changes of [{supportContext:{companyId:'company'}},{storeId:'selected'},{staffAccess:true},{ownerCompanyId:'company'},{mustChangePassword:true},{sessionVersion:-1},{isSuperAdmin:false},{platformRole:'OWNER'},{role:'EMPLOYEE'},{role:'SUPER_ADMIN'}])await assert.rejects(async()=>f.service.inspect({...actor,...changes}),{code:'COMPANY_INSTALL_ACTOR_REQUIRED'});
  assert.equal((await f.db.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities'`)).length,0,'scoped/masked identities cannot create schema');
  const inspect=await f.service.inspect(actor);assert.equal(inspect.eligible,true);assert.equal(inspect.productionActivated,false);
  const originalWorker=(await f.db.$queryRawUnsafe(`SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"='backup-worker'`))[0];
  const foreignWorker=JSON.stringify({...JSON.parse(originalWorker.heartbeatJson),workerRevision:'b'.repeat(40)});await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"='backup-worker'`,foreignWorker,lifecycleWorkerCapabilityMac(secret,foreignWorker));assert.equal((await f.service.inspect(actor)).eligible,false,'valid signed wrong worker revision cannot prepare installation');
  await f.db.$executeRawUnsafe(`UPDATE "StoreLifecycleRuntime" SET "heartbeatJson"=$1,"mac"=$2 WHERE "id"='backup-worker'`,originalWorker.heartbeatJson,originalWorker.mac);
  const stocks=await f.db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "StoreProduct" s ORDER BY "id"`);
  const before=await f.db.$queryRawUnsafe(`SELECT a.*,g."storeId",g."capabilities",g."revision" AS "grantRevision" FROM "BackofficeStaffAccount" a JOIN "BackofficeStaffGrant" g ON g."userId"=a."userId"`),epochs=await f.db.$queryRawUnsafe(`SELECT "storeId","companyId","generation" FROM "StoreLifecycleFence" ORDER BY "storeId"`);
  await assert.rejects(f.service.inspect({...actor,id:'staff'}),{code:'COMPANY_INSTALL_ACTOR_CHANGED'});
  const observerSql=readFileSync(new URL('../../ops/backup/lifecycle/company-installation-observe.sql',import.meta.url),'utf8'),originalCatalogue=digest(await f.db.$queryRawUnsafe(observerSql));
  const typeRows=await f.db.$queryRawUnsafe(observerSql),typeNames=JSON.parse(Object.values(typeRows[0])[0]).typeDefinitions.map(row=>row[0]);assert.equal(digest(typeNames),digest([...typeNames].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))),'native catalogue type ordering must use locale-independent UTF8 byte order');
  await f.db.$executeRawUnsafe(`CREATE TYPE "MWSCompanyUnusedEnumProbe" AS ENUM ('BEFORE')`);const enumBefore=digest(await f.db.$queryRawUnsafe(observerSql));await f.db.$executeRawUnsafe(`ALTER TYPE "MWSCompanyUnusedEnumProbe" ADD VALUE 'AFTER'`);assert.notEqual(digest(await f.db.$queryRawUnsafe(observerSql)),enumBefore,'unused enum label drift must change the actual signed catalogue observation');await f.db.$executeRawUnsafe(`DROP TYPE "MWSCompanyUnusedEnumProbe"`);assert.equal(digest(await f.db.$queryRawUnsafe(observerSql)),originalCatalogue);
  const script=new URL('../../ops/backup/lifecycle/company-installation-backup.py',import.meta.url).pathname,requestPath=join(f.directory,'request.json'),proofPath=join(f.directory,'proof.json');
  await execute('python3',[script,'--prepare','--profile',profile,'--source-revision',revision,'--output',requestPath,'--authorize-isolated-installation-backup'],{env:f.env,timeout:180000,maxBuffer:8000});
  await execute('python3',[script,'--request',requestPath,'--output',proofPath,'--authorize-isolated-installation-backup'],{env:f.env,timeout:300000,maxBuffer:8000});
  const requestEnvelope=JSON.parse(await readFile(requestPath,'utf8')),proofEnvelope=JSON.parse(await readFile(proofPath,'utf8')),input={explicitAuthorization:true,packet:inspect.packet,requestEnvelope,proofEnvelope};
  await assert.rejects(f.service.install({...actor,supportContext:{companyId:'company',storeId:'selected'}},input),{code:'COMPANY_INSTALL_ACTOR_REQUIRED'});
  await assert.rejects(f.service.install(actor,{...input,explicitAuthorization:false}),{code:'COMPANY_INSTALL_AUTHORIZATION_REQUIRED'});
  await assert.rejects(f.service.install(actor,{...input,packet:{...inspect.packet,catalogueSignature:'0'.repeat(64)}}),{code:'COMPANY_INSTALL_STALE_PACKET'});
  assert.equal((await f.db.$queryRawUnsafe(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities'`)).length,0);
  const result=await f.service.install(actor,input);assert.equal(result.installed,true);assert.equal(result.idempotentReplay,false);assert.equal(result.productionActivated,false);assert.equal(result.pairedNewWorkerRequired,true);assert.equal(result.transitionedEnrollments,3);
  const after=await f.db.$queryRawUnsafe(`SELECT a.*,g."storeId",g."capabilities",g."revision" AS "grantRevision" FROM "BackofficeStaffAccount" a JOIN "BackofficeStaffGrant" g ON g."userId"=a."userId"`);assert.deepEqual(after.map(({companyCapabilities,...row})=>row),before);assert.deepEqual(after[0].companyCapabilities,[]);assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "StoreProduct" s ORDER BY "id"`),stocks);assert.deepEqual(await f.db.$queryRawUnsafe(`SELECT "storeId","companyId","generation" FROM "StoreLifecycleFence" ORDER BY "storeId"`),epochs);
  const column=(await f.db.$queryRawUnsafe(`SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities'`))[0];assert.deepEqual(column,{data_type:'jsonb',is_nullable:'NO',column_default:"'[]'::jsonb"});
  const fresh=await f.service.inspect(actor);assert.equal(fresh.eligible,false,'old signed worker cannot authorize the new profile');assert.equal(fresh.packet.installed,true);
  const replay=await f.service.install(actor,{...input,packet:fresh.packet});assert.equal(replay.idempotentReplay,true);assert.equal((await f.db.$queryRawUnsafe(`SELECT 1 FROM "BackofficeStaffAudit" WHERE "event"='COMPANY_AUTHORITY_SCHEMA_INSTALLED'`)).length,2);
  await verifyInstalledCompanyRuntime({db:f.db,profile,revision,secret,planHash:f.service.describe().targetPlanHash});
  await verifyNativeWorkforceReads({db:f.db});
  await verifyNativeSalesAndCompanyRoles({db:f.db,profile,revision,secret});
  await verifyNativeCompanyReports({db:f.db,profile,revision,secret});
  await verifyNativeCompanyAuditReports({db:f.db,profile,revision,secret});
  await verifyNativeCompanyInventoryReports({db:f.db,profile,revision,secret});
  await verifyNativeCompanyPartyReports({db:f.db,profile,revision,secret});
 }finally{await f.close()}
});
