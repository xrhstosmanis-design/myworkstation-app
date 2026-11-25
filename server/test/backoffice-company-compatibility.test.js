import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {buildBackofficeCompanyProposal,verifyBackofficeCompanyCompatibility,companyCompatibilityHash,companyProfilePairCompatible,assertBackofficeCompanyRollback} from '../src/services/backoffice-company-compatibility.js';
import {createLifecycleInspectionCore} from '../src/services/store-lifecycle-executor.js';
import {lifecycleWorkerCapabilityMac,validateLifecycleWorkerCapability} from '../src/services/store-lifecycle-worker-ready.js';
import {LIFECYCLE_ROW_DIGEST_FORMAT} from '../src/services/store-lifecycle-recovery-stream.js';
const root=new URL('../../',import.meta.url),packetPath='ops/backup/lifecycle/backoffice-company-compatibility.proposed.json';
const column='BackofficeStaffAccount.companyCapabilities',added=['companyCapabilities','jsonb',true];
const read=path=>readFile(new URL(path,root));
const packet=async()=>JSON.parse(await read(packetPath));
const refuse=fn=>assert.throws(fn,error=>error.code==='COMPANY_COMPATIBILITY_REFUSED');

async function sources(){const spec=await packet(),files=new Map();for(const path of Object.keys(spec.sourceHashes))files.set(path,await read(path));return {spec,files,read:path=>{assert.ok(files.has(path),'unexpected compatibility source '+path);return files.get(path)}};}

test('inactive COMPANY proposal changes exactly one shared account column and its explicit review in both profiles',async()=>{
 const source=await sources(),result=verifyBackofficeCompanyCompatibility({packet:source.spec,read:source.read});
 assert.equal(result.executionEnabled,false);assert.equal(result.productionActivated,false);assert.deepEqual(result.variants.map(row=>row.profile),['BASE','CAPTURE','CURRENT_CAPTURE']);
 assert.deepEqual(source.spec.variants.map(({profile,proposedPlanHash,proposedReviewHash})=>[profile,proposedPlanHash,proposedReviewHash]),[
  ['BASE','87531261fbaaed42f2a25282042cd8f817c5991a0aa9e62bef1f1c92f727a20f','1fec682a7404108ac79ca49297e84abf972c918c11aaec6be8b6de85faa98132'],
  ['CAPTURE','8b298f318699a72d4b88b077d309953b9dc5f014f6f2ee763600103d0df93d95','a5d2aa8894d07d3116c939577df5725c0e8a57600fffbe7e8298961d4a55a9e2'],
  ['CURRENT_CAPTURE','9485ee86e3f706b4ead00cdaa240646e761b93f7420a40233dd97b12442f5419','a39600ecda5cdd45a794bc547735d2fae7ce092c0aa2f714b8dce1c376e98118']
 ]);

 for(const variant of source.spec.variants.filter(row=>row.profile!=='CURRENT_CAPTURE')){
  const original=JSON.parse(source.read(variant.sourceManifest)),originalReview=JSON.parse(source.read(variant.sourceReview)),before=structuredClone(original),beforeReview=structuredClone(originalReview);
  const {manifest,review}=buildBackofficeCompanyProposal(original,originalReview,{profile:variant.profile});
  assert.deepEqual(original,before);assert.deepEqual(originalReview,beforeReview);assert.equal(original.knownColumns.BackofficeStaffAccount.length,8);assert.equal(manifest.knownColumns.BackofficeStaffAccount.length,9);assert.deepEqual(manifest.knownColumns.BackofficeStaffAccount.at(-1),added);
  assert.equal(manifest.id,variant.proposedProfileId);assert.equal(review.profileId,manifest.id);assert.equal(review.executionEnabled,false);assert.equal(companyCompatibilityHash(manifest),variant.proposedPlanHash);assert.equal(companyCompatibilityHash(review),variant.proposedReviewHash);
  assert.deepEqual(manifest.tables,original.tables);assert.deepEqual(manifest.knownTables,original.knownTables);assert.deepEqual(manifest.valueGuards,original.valueGuards);assert.deepEqual(manifest.ftextRecoveryAcceptance,original.ftextRecoveryAcceptance);
  for(const name of ['BackofficeStaffAccount','BackofficeStaffAudit','BackofficeStaffLoginGuard'])assert.equal(manifest.tables.some(table=>table.name===name),false,'company security must stay outside store ownership');
  assert.deepEqual(manifest.tables.find(table=>table.name==='BackofficeStaffGrant'),original.tables.find(table=>table.name==='BackofficeStaffGrant'));assert.equal(manifest.tables.find(table=>table.name==='BackofficeStaffGrant').reset,'KEEP');
  const restored=structuredClone(manifest);restored.id=original.id;restored.knownColumns.BackofficeStaffAccount.pop();restored.reviewedColumns=restored.reviewedColumns.filter(value=>value!==column);assert.deepEqual(restored,original);
  const restoredReview=structuredClone(review);restoredReview.profileId=originalReview.profileId;restoredReview.columns=restoredReview.columns.filter(value=>value.column!==column);assert.deepEqual(restoredReview,originalReview);
  assert.doesNotThrow(()=>createLifecycleInspectionCore(manifest,{sourceRevision:'1'.repeat(40)}));
 }
 for(const [path,bytes] of source.files)assert.equal(createHash('sha256').update(bytes).digest('hex'),source.spec.sourceHashes[path]);
});

test('proposal verifier rejects activation, policy/retention/hash drift and missing paired worker evidence',async()=>{
 const source=await sources(),mutations=[
  p=>p.executionEnabled=true,p=>p.productionActivated=true,p=>p.column.default=['stores.read'],p=>p.column.owner='STORE',p=>p.column.storeDeletionSelector=true,p=>p.patch.accountColumn[1]='text',p=>p.patch.classification='DELETE_WITH_STORE',p=>p.variants.pop(),p=>p.variants.reverse(),p=>p.variants[0].proposedPlanHash='0'.repeat(64),p=>p.variants[1].proposedReviewHash='0'.repeat(64),p=>p.variants[0].sourceManifest='ops/backup/lifecycle/not-reviewed.json',p=>delete p.sourceHashes['ops/backup/lifecycle/worker.py'],p=>p.runtimeProfilesUnchanged.pop(),p=>p.eventReportVariantsPrepared=true,p=>p.rollbackRequires.nonEmptyCompanyPolicies=1,p=>p.rollbackRequires.sessionsRevoked=false
 ];
 for(const mutate of mutations){const p=structuredClone(source.spec);mutate(p);refuse(()=>verifyBackofficeCompanyCompatibility({packet:p,read:source.read}));}
 const corrupt=new Map(source.files);corrupt.set(source.spec.variants[0].sourceManifest,Buffer.concat([corrupt.get(source.spec.variants[0].sourceManifest),Buffer.from('\n')]));refuse(()=>verifyBackofficeCompanyCompatibility({packet:source.spec,read:path=>corrupt.get(path)}));
 for(const profile of ['BASE','CAPTURE']){
  const variant=source.spec.variants.find(row=>row.profile===profile),manifest=JSON.parse(source.read(variant.sourceManifest)),review=JSON.parse(source.read(variant.sourceReview));
  for(const change of [m=>m.knownColumns.BackofficeStaffAccount.push(['unreviewed','text',true]),m=>m.knownColumns.BackofficeStaffAccount[0][1]='integer',m=>m.knownColumns.BackofficeStaffAccount.reverse(),m=>m.tables.push({name:'BackofficeStaffAccount',owner:{kind:'DIRECT'},reset:'REMOVE'}),m=>m.reviewedColumns.push(column)]){const m=structuredClone(manifest);change(m);refuse(()=>buildBackofficeCompanyProposal(m,review,{profile}));}
  const r=structuredClone(review);r.executionEnabled=true;refuse(()=>buildBackofficeCompanyProposal(manifest,r,{profile}));
 }
});

test('old/new application-worker pairs and the real signed heartbeat fail closed for schema or profile mismatch',async()=>{
 const source=await sources(),now=Date.now(),secret='isolated-company-compatibility-worker-secret';
 for(const variant of source.spec.variants.filter(row=>row.profile!=='CURRENT_CAPTURE')){
  const oldManifest=JSON.parse(source.read(variant.sourceManifest)),oldColumns=oldManifest.knownColumns.BackofficeStaffAccount,newColumns=[...oldColumns,added],oldHash=companyCompatibilityHash(oldManifest),newHash=variant.proposedPlanHash;
  for(const [old,hash,columns] of [[true,oldHash,oldColumns],[false,newHash,newColumns]]){
   const value={appPlanHash:hash,workerPlanHash:hash,installedPlanHash:hash,accountColumns:columns,companyColumnExpected:!old};assert.equal(companyProfilePairCompatible(value),true);
   for(const key of ['appPlanHash','workerPlanHash','installedPlanHash'])assert.equal(companyProfilePairCompatible({...value,[key]:old?newHash:oldHash}),false,key);
   assert.equal(companyProfilePairCompatible({...value,accountColumns:old?newColumns:oldColumns}),false);
   for(const change of [c=>c.push(['unknownAuthority','jsonb',true]),c=>c.reverse(),c=>c[0][1]='integer',c=>c[0][2]=false,c=>c.push([...c[0]])]){const copy=structuredClone(columns);change(copy);assert.equal(companyProfilePairCompatible({...value,accountColumns:copy}),false);}
   assert.equal(companyProfilePairCompatible({...value,companyColumnExpected:'true'}),false);
   const heartbeatJson=JSON.stringify({protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1',manifestHash:hash,workerRevision:'1'.repeat(40),checkedAt:new Date(now).toISOString(),storagePolicyVerified:true,rowDigestFormat:LIFECYCLE_ROW_DIGEST_FORMAT}),record={heartbeatJson,mac:lifecycleWorkerCapabilityMac(secret,heartbeatJson)};
   assert.equal(validateLifecycleWorkerCapability(record,{secret,manifestHash:hash,now}),true);assert.equal(validateLifecycleWorkerCapability(record,{secret,manifestHash:old?newHash:oldHash,now}),false);assert.equal(validateLifecycleWorkerCapability({...record,mac:'0'.repeat(64)},{secret,manifestHash:hash,now}),false);
  }
 }
});

test('rollback eligibility cannot discard nonempty company grants or bypass drain, session revocation and verified backup',()=>{
 const safe={nonFinalOperations:0,nonEmptyCompanyPolicies:0,sessionsRevoked:true,verifiedBackup:true};assert.deepEqual(assertBackofficeCompanyRollback(safe),{eligible:true,executionEnabled:false});
 for(const key of ['nonFinalOperations','nonEmptyCompanyPolicies'])for(const value of [1,-1,0.1,'0',null,undefined,NaN,Infinity])refuse(()=>assertBackofficeCompanyRollback({...safe,[key]:value}));
 for(const key of ['sessionsRevoked','verifiedBackup'])for(const value of [false,1,'true',null,undefined])refuse(()=>assertBackofficeCompanyRollback({...safe,[key]:value}));refuse(()=>assertBackofficeCompanyRollback());
});

const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&url.pathname==='/myworkstation_test'}catch{return false}};
test('native PostgreSQL closed schema inspection rejects unknown company columns and never enrolls or removes shared policy',{skip:!isolated(),timeout:60000},async()=>{
 const spec=await packet(),baseline=JSON.parse(await read(spec.variants[0].sourceManifest)),columns=baseline.knownColumns.BackofficeStaffAccount,schema='staff_company_compat_'+randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),actor={id:'isolated-admin',isSuperAdmin:true},scope={companyId:'company',storeId:'store'};
 const manifest={id:'ISOLATED_COMPANY_COMPATIBILITY',knownTables:['Store','BackofficeStaffAccount'],knownColumns:{Store:[['id','text',true],['companyId','text',true]],BackofficeStaffAccount:columns},reviewedColumns:['BackofficeStaffAccount.userId'],tables:[{name:'Store',owner:{kind:'ROOT'},reset:'KEEP'}]};
 const inspect=selected=>createLifecycleInspectionCore(selected,{sourceRevision:'1'.repeat(40)}).inspect(db,actor,scope);
 try{
  await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');await db.$executeRawUnsafe('CREATE TABLE "Store" ("id" text NOT NULL PRIMARY KEY,"companyId" text NOT NULL)');await db.$executeRawUnsafe('INSERT INTO "Store" VALUES (\'store\',\'company\')');
  await db.$executeRawUnsafe('CREATE TABLE "BackofficeStaffAccount" ("userId" text NOT NULL PRIMARY KEY,"companyId" text NOT NULL,"username" text NOT NULL,"pinHash" text NOT NULL,"active" boolean NOT NULL,"revision" integer NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL)');
  const old=await inspect(manifest);assert.equal(old.executionAvailable,false);assert.equal(old.guardsInstalled,false);assert.equal(old.counts.some(row=>row.table==='BackofficeStaffAccount'),false);
  await db.$executeRawUnsafe('ALTER TABLE "BackofficeStaffAccount" ADD COLUMN "companyCapabilities" jsonb NOT NULL DEFAULT \'[]\'::jsonb');await assert.rejects(inspect(manifest),/Reviewed column catalogue changed: BackofficeStaffAccount/);
  const next=structuredClone(manifest);next.knownColumns.BackofficeStaffAccount.push(added);await assert.rejects(inspect(next),/Unreviewed application or attachment field: BackofficeStaffAccount.companyCapabilities/);next.reviewedColumns.push(column);
  await db.$executeRawUnsafe('INSERT INTO "BackofficeStaffAccount" VALUES (\'staff\',\'company\',\'fixture\',\'NOT-A-REAL-HASH\',true,1,NOW(),NOW(),\'["stores.read"]\'::jsonb)');
  const before=await db.$queryRawUnsafe('SELECT * FROM "BackofficeStaffAccount"');const ready=await inspect(next);assert.equal(ready.executionAvailable,false);assert.equal(ready.guardsInstalled,false);assert.equal(ready.counts.some(row=>row.table==='BackofficeStaffAccount'),false);assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "BackofficeStaffAccount"'),before);refuse(()=>assertBackofficeCompanyRollback({nonFinalOperations:0,nonEmptyCompanyPolicies:before.length,sessionsRevoked:true,verifiedBackup:true}));
  await db.$executeRawUnsafe('ALTER TABLE "BackofficeStaffAccount" ADD COLUMN "unreviewedAuthority" text');await assert.rejects(inspect(next),/Reviewed column catalogue changed: BackofficeStaffAccount/);await db.$executeRawUnsafe('ALTER TABLE "BackofficeStaffAccount" DROP COLUMN "unreviewedAuthority"');assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "BackofficeStaffAccount"'),before);
  const guards=await db.$queryRawUnsafe('SELECT to_regclass(format(\'%I.%I\',current_schema(),\'StoreLifecycleFence\'))::text AS relation');assert.equal(guards[0].relation,null);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.$disconnect()}
});

test('merged report dependencies are bound without admitting the separate operational catalogue to COMPANY profiles',async()=>{const source=await sources(),dependencies=['server/src/services/automatic-report-operational-profile.js','server/src/services/automatic-report-source-compatibility.js','ops/backup/lifecycle/report-operational-compatibility.proposed.json','server/src/services/automatic-report-chat-compatibility.js','ops/backup/lifecycle/report-chat-compatibility.proposed.json','server/src/services/supplier-expected-receipts-lifecycle-profile.js','server/src/services/supplier-expected-receipts-lifecycle-inspection.js','server/src/services/supplier-expected-receipts-compatibility-definition.js','server/src/services/supplier-expected-receipts-compatibility.js','server/src/services/automatic-report-security-transition.js','server/src/services/automatic-report-security-compatibility.js','ops/backup/lifecycle/report-security-profile.proposed.json','ops/backup/lifecycle/report-security-compatibility.proposed.json'].concat(["server/src/services/weekly-stock-alarm-profile.js", "server/src/services/weekly-stock-alarm-catalogue.js", "server/src/services/weekly-stock-alarm-existing-lab.js", "ops/backup/lifecycle/weekly-stock-alarm-definition.proposed.json", "ops/backup/lifecycle/weekly-stock-alarm-existing-lab.proposed.json", "ops/backup/lifecycle/weekly_stock_alarm_profile.py"]);assert.equal(Object.keys(source.spec.sourceHashes).length,63);for(const path of dependencies){assert.ok(source.files.has(path));const corrupt=new Map(source.files);corrupt.set(path,Buffer.concat([corrupt.get(path),Buffer.from('\n')]));refuse(()=>verifyBackofficeCompanyCompatibility({packet:source.spec,read:name=>corrupt.get(name)}));const missing=structuredClone(source.spec);delete missing.sourceHashes[path];refuse(()=>verifyBackofficeCompanyCompatibility({packet:missing,read:source.read}));}const operational=JSON.parse(source.read(dependencies[2]));for(const v of source.spec.variants.filter(row=>row.profile!=='CURRENT_CAPTURE')){const generated=buildBackofficeCompanyProposal(JSON.parse(source.read(v.sourceManifest)),JSON.parse(source.read(v.sourceReview)),{profile:v.profile}).manifest;assert.equal(generated.preservedOperationalTables,undefined);assert.equal(generated.executionDisabled,undefined);for(const table of operational.tables)assert.equal(generated.knownTables.includes(table.name),false,table.name+' remains outside this COMPANY proposal');}});
