import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {persistLifecycleRecoveryStream,readLifecycleRecoveryStream,verifyLifecycleRecoveryStream,digestLifecycleRows} from '../src/services/store-lifecycle-recovery-stream.js';
import {randomBytes} from 'node:crypto';
import {assertFtextCashLifecycleApproved,assertFtextCashLifecycleCatalogueReviewed,ftextCashLifecycleReviewProposal,provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';

test('canonical ftext catalogue covers exact ownership/types/references while actual recovery acceptance remains OFF',()=>{
 const canonical=reviewedFreshStoreManifest(),proposal=ftextCashLifecycleReviewProposal();
 assert.doesNotThrow(()=>assertFtextCashLifecycleCatalogueReviewed(canonical));
 assert.throws(()=>assertFtextCashLifecycleApproved(canonical),e=>e.code==='FTEXT_CASH_RECOVERY_REVIEW_REQUIRED');
 assert.deepEqual(canonical.knownColumns.FtextCashRequest,proposal.knownColumns.FtextCashRequest);
 assert.deepEqual(canonical.tables.find(t=>t.name==='FtextCashRequest'),proposal.tables[0]);
 assert.equal(canonical.ftextRecoveryAcceptance.approved,false);
 const review=JSON.parse(readFileSync(new URL('../../ops/backup/lifecycle/column-review.json',import.meta.url)));
 for(const name of proposal.reviewedColumns)assert.equal(review.columns.filter(c=>c.column===name).length,1,name);
 for(const name of ['sessionId','claimedByDeviceId','saleId'])assert.match(review.columns.find(c=>c.column==='FtextCashRequest.'+name).classification,/HISTORICAL_NON_OWNING/);
 for(const name of ['plan','checkoutJson','result','clientTransactionId'])assert.match(review.columns.find(c=>c.column==='FtextCashRequest.'+name).classification,/NEVER_USED_TO_EXPAND_DELETION/);
});
test('unreviewed provisioning refuses before transaction or DDL; ordinary startup preserves the entire prior command',async()=>{
 let calls=0;await assert.rejects(provisionFtextRecoverySchema({$transaction(){calls++;}},{manifest:{}}));assert.equal(calls,0);
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url)));
 assert.match(pkg.scripts.start,/^node server\/scripts\/ensure-assistant-history.js && node server\/scripts\/ensure-ftext-recovery-schema.js && npm run prisma:generate/);
 const script=readFileSync(new URL('../scripts/ensure-ftext-recovery-schema.js',import.meta.url),'utf8');
 assert.match(script,/process.env.NODE_ENV==='production'/);assert.match(script,/process.exitCode=1/);
 for(const forbidden of ['createPairing','claimFtextCashRequest','recordFtextCashResult','finalizeFtextCashRequest'])assert.equal(script.includes(forbidden),false);
});
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native provisioning is mandatory in CI',()=>{if(process.env.CI)assert.equal(isolated(),true);});
test('native empty/installed/drifted queue provisioning preserves immutable cash/card history and controls',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='ftext_recovery_'+randomBytes(10).toString('hex');let a,b,clone,directory;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);a=new PrismaClient({datasourceUrl:url.href});b=new PrismaClient({datasourceUrl:url.href});
  const results=await Promise.all([provisionFtextRecoverySchema(a),provisionFtextRecoverySchema(b)]);for(const r of results)assert.deepEqual(r,{available:true,checkoutEnabled:false});
  assert.equal((await a.$queryRaw`SELECT count(*)::int AS n FROM "FtextCashRequest"`)[0].n,0);
  for(const [id,store,status,method] of [['sent','target','DISPATCHED','CASH'],['done','sibling','SALE_COMMITTED','CARD']])await a.$executeRawUnsafe(`INSERT INTO "FtextCashRequest" ("id","companyId","storeId","terminalPos","fiscalDeviceCode","serialNumber","clientTransactionId","requestHash","settingsHash","lifecycleGeneration","sessionId","plan","checkoutJson","total","status","claimedByDeviceId","claimedTokenVersion","dispatchedAt","result","resultHash","saleId") VALUES($1,'fixture-company',$2,'POS-01','FISCAL-01',$2,$1,'request-hash','settings-hash','0','historical-shift',$3::jsonb,$4::jsonb,1.25,$5,'old-device',3,'2026-10-23T12:00:00.123456Z',$6::jsonb,'immutable-result',$7)`,id,store,JSON.stringify({payment:{method},scope:{storeId:store}}),JSON.stringify({paymentMethod:method,productId:'foreign-id-not-ownership'}),status,JSON.stringify({outcome:status==='DISPATCHED'?'REQUIRES_CHECK':'CONFIRMED',dayId:'17',dayCounter:'42',cardNumberMasked:method==='CARD'?'416598******5605':null}),status==='SALE_COMMITTED'?'historical-sale':null);
  const rows=()=>a.$queryRaw`SELECT row_to_json(t)::text AS row FROM "FtextCashRequest" t ORDER BY "id"`,before=await rows();
  await provisionFtextRecoverySchema(a);assert.deepEqual(await rows(),before,'startup cannot reset DISPATCHED or clear a pending fiscal request');
  assert.throws(()=>assertFtextCashLifecycleApproved(),e=>e.code==='FTEXT_CASH_RECOVERY_REVIEW_REQUIRED');
  // Exact one-table native encrypted copy proof, deliberately NOT full-schema
  // recovery acceptance. The canonical activation flag remains false.
  directory=await mkdtemp(path.join(tmpdir(),'ftext-recovery-'));
  const descriptor={scope:{companyId:'fixture-company',storeId:'target',mode:'RESET'},manifestHash:'a'.repeat(64),sourceRevision:'b'.repeat(40),schemaSignature:'c'.repeat(64),tables:[{name:'FtextCashRequest',action:'REMOVE'}]};
  const options={directory,encryptionKey:randomBytes(32),keyId:'isolated-ftext-key',expectedScope:descriptor.scope,expectedManifestHash:descriptor.manifestHash,expectedSourceRevision:descriptor.sourceRevision,expectedSchemaSignature:descriptor.schemaSignature};
  const saved=await persistLifecycleRecoveryStream(descriptor,{...options,readRows:async function*(){for(const row of before.filter(r=>JSON.parse(r.row).storeId==='target'))yield row.row;}});
  const bytes=await readFile(saved.artifactPath),verifiedOptions={...options,expectedSnapshotHash:saved.snapshotHash};
  assert.equal((await verifyLifecycleRecoveryStream(bytes,verifiedOptions)).storageReadbackVerified,true);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}_clone"`);const cloneURL=new URL(process.env.DATABASE_URL);cloneURL.searchParams.set('schema',schema+'_clone');clone=new PrismaClient({datasourceUrl:cloneURL.href});await provisionFtextRecoverySchema(clone);
  for await(const chunk of readLifecycleRecoveryStream(bytes,verifiedOptions))for(const row of chunk.rows)await clone.$executeRawUnsafe(`INSERT INTO "FtextCashRequest" SELECT * FROM json_populate_record(NULL::"FtextCashRequest",$1::json)`,row);
  const restored=await clone.$queryRaw`SELECT row_to_json(t)::text AS row FROM "FtextCashRequest" t ORDER BY "id"`;
  const expected=before.filter(r=>JSON.parse(r.row).storeId==='target');assert.deepEqual(restored,expected);
  assert.deepEqual(await digestLifecycleRows(restored.map(r=>r.row)),await digestLifecycleRows(expected.map(r=>r.row)));assert.deepEqual(await rows(),before);
  await assert.rejects(verifyLifecycleRecoveryStream(bytes,{...verifiedOptions,expectedScope:{...descriptor.scope,storeId:'sibling'}}));
  await a.$executeRaw`ALTER TABLE "FtextCashRequest" ADD COLUMN "unreviewed" text`;
  await assert.rejects(provisionFtextRecoverySchema(a),e=>e.code==='FTEXT_RECOVERY_SCHEMA_CHANGED');
  await a.$executeRaw`ALTER TABLE "FtextCashRequest" DROP COLUMN "unreviewed"`;
  assert.deepEqual(await rows(),before);
  await a.$executeRaw`DROP INDEX "FtextCashRequest_register_pending_idx"`;
  await a.$executeRaw`CREATE INDEX "FtextCashRequest_register_pending_idx" ON "FtextCashRequest" ("companyId")`;
  await assert.rejects(provisionFtextRecoverySchema(a),e=>e.code==='FTEXT_RECOVERY_SCHEMA_CHANGED');
  assert.deepEqual(await rows(),before);
 }finally{await Promise.all([a?.$disconnect(),b?.$disconnect(),clone?.$disconnect()]);try{for(const name of [schema,schema+'_clone'])await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)}finally{await admin.$disconnect();if(directory)await rm(directory,{recursive:true,force:true});}}
});
