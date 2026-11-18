// Explicit operator-only installation candidate. Unmounted; no startup work.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isDeepStrictEqual} from 'node:util';
import {createLifecycleInstallationCore} from './store-lifecycle-executor.js';
import {readLifecycleInstallationControls,readLifecycleInstallationGlobalState} from './monthly-inventory-snapshot-installation.js';
import {validateLifecycleWorkerCapability} from './store-lifecycle-worker-ready.js';
import {buildBackofficeCompanyProposal,verifyBackofficeCompanyCompatibility} from './backoffice-company-compatibility.js';
import {validateCompanyInstallationBackupRequest,validateCompanyInstallationBackupProof} from './backoffice-company-installation-proof.js';
const execute=promisify(execFile),script=fileURLToPath(new URL('../../../ops/backup/lifecycle/company-installation-backup.py',import.meta.url));
const q=value=>'"'+value.replaceAll('"','""')+'"';
const fail=(code='COMPANY_INSTALL_REFUSED')=>{throw Object.assign(Error('Company authority installation refused.'),{status:409,code})};
const backupDiagnosticCategories=new Set(['UNSUPPORTED_SETTING','ARCHIVE_VERSION','PERMISSION','MISSING_ROLE','MISSING_TYPE','COLLATION','DUPLICATE_RELATION','ENCODING','MEMORY','PRIVATE_CONNECTION','DUPLICATE_SCHEMA','MISSING_SCHEMA','MISSING_FUNCTION','MISSING_EXTENSION','MISSING_RELATION','MISSING_COLUMN','MISSING_OPERATOR','CONSTRAINT','SQL_SYNTAX','UNKNOWN']);
export function companyInstallationBackupDiagnostic(stderr){
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>4096)return null;
 let value;try{value=JSON.parse(stderr.trim())}catch{return null}
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='code,command,error,exitCode,state'||value.state!=='REFUSED'||value.error!=='PrivatePostgresCommandError'||typeof value.code!=='string'||!value.code.startsWith('PRIVATE_PG_')||!backupDiagnosticCategories.has(value.code.slice(11))||!['initdb','pg_ctl','psql','pg_dump','pg_restore'].includes(value.command)||!Number.isInteger(value.exitCode)||value.exitCode<-255||value.exitCode>255)return null;
 return value.code;
}
const read=name=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/'+name,import.meta.url),'utf8'));
function installerActor(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('COMPANY_INSTALL_ACTOR_REQUIRED');
 const descriptors=Object.getOwnPropertyDescriptors(input),actor={};
 for(const key of ['supportContext','storeId','staffAccess','ownerCompanyId','companyAuthority','companyCapabilities'])if(Object.hasOwn(descriptors,key))fail('COMPANY_INSTALL_ACTOR_REQUIRED');
 for(const key of ['id','companyId','tokenType','sessionId','sessionVersion','isSuperAdmin','platformRole','role','mustChangePassword']){
  if(descriptors[key]){if(!Object.hasOwn(descriptors[key],'value'))fail('COMPANY_INSTALL_ACTOR_REQUIRED');actor[key]=descriptors[key].value;}
 }
 const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
 if(actor.tokenType!=='BACKOFFICE_USER'||!text(actor.id)||!text(actor.sessionId)||actor.companyId!==undefined&&!text(actor.companyId)||!Number.isInteger(actor.sessionVersion)||actor.sessionVersion<0||actor.sessionVersion>2147483647||actor.isSuperAdmin!==true||actor.platformRole!=='SUPER_ADMIN'||actor.role!=='OWNER'||actor.mustChangePassword!==undefined&&actor.mustChangePassword!==false)fail('COMPANY_INSTALL_ACTOR_REQUIRED');
 return Object.freeze(actor);
}
export function createBackofficeCompanyInstallation(db,{sourceRevision,enabled=false,profile='BASE',env=process.env}={}){
 if(!/^[a-f0-9]{40}$/.test(sourceRevision||'')||typeof enabled!=='boolean'||!['BASE','CAPTURE'].includes(profile))fail();
 verifyBackofficeCompanyCompatibility();
 const source=read(profile==='BASE'?'manifest.json':'monthly-inventory-capture-manifest.proposed.json'),review=read(profile==='BASE'?'column-review.json':'monthly-inventory-capture-column-review.proposed.json');
 const {manifest:target}=buildBackofficeCompanyProposal(source,review,{profile});
 const oldCore=createLifecycleInstallationCore(source,{sourceRevision}),targetCore=createLifecycleInstallationCore(target,{sourceRevision});
 const oldPlanHash=oldCore.describe().planHash,targetPlanHash=targetCore.describe().planHash;
 const storage={bucket:env.S3_BUCKET_NAME,region:env.AWS_REGION,endpoint:env.S3_ENDPOINT_URL};
 const description={sourceRevision,profile,oldPlanHash,targetPlanHash,targetRuntimeProfile:profile==='BASE'?'BACKOFFICE_COMPANY_BASE_V1':'BACKOFFICE_COMPANY_CAPTURE_V1',productionActivated:false};
 async function authorize(tx,actor,readOnly){
  actor=installerActor(actor);
  const rows=await tx.$queryRawUnsafe(`SELECT u."id",u."companyId" FROM "User" u JOIN "UserSession" s ON s."userId"=u."id" WHERE u."id"=$1 AND u."role"::text='SUPER_ADMIN' AND u."sessionVersion"=$2 AND u."mustChangePassword"=false AND s."id"=$3 AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp()${readOnly?'':' FOR SHARE OF u,s NOWAIT'}`,actor.id,actor.sessionVersion,actor.sessionId);
  if(rows.length!==1||actor.companyId!==undefined&&rows[0].companyId!==actor.companyId)fail('COMPANY_INSTALL_ACTOR_CHANGED');
  return {id:actor.id,isSuperAdmin:true};
 }
 const transaction=(rawActor,readOnly,fn)=>{const actor=installerActor(rawActor);return db.$transaction(async tx=>{
  if(readOnly)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  for(const sql of ["SET LOCAL TimeZone='UTC'","SET LOCAL DateStyle='ISO,YMD'","SET LOCAL lock_timeout='2s'","SET LOCAL statement_timeout='20s'"])await tx.$executeRawUnsafe(sql);
  const admitted=await authorize(tx,actor,readOnly);return fn(tx,admitted);
 },{isolationLevel:readOnly?'RepeatableRead':'ReadCommitted',timeout:600000,maxWait:3000})};
 async function observe(tx,actor){
  const schema=(await tx.$queryRawUnsafe('SELECT current_schema() AS schema'))[0]?.schema;if(schema!=='public')fail();
  const cols=await tx.$queryRawUnsafe(`SELECT data_type AS type,is_nullable AS nullable,column_default AS def FROM information_schema.columns WHERE table_schema=$1 AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities'`,schema);
  const installed=cols.length===1;
  if(cols.length>1||installed&&(cols[0].type!=='jsonb'||cols[0].nullable!=='NO'||cols[0].def!=="'[]'::jsonb"))fail('COMPANY_INSTALL_ACCOUNT_SCHEMA_CHANGED');
  const metadata=await (installed?targetCore:oldCore).inspectInTransaction(tx,actor);
  const controls=await readLifecycleInstallationControls(tx,schema),global=await readLifecycleInstallationGlobalState(tx,schema,controls.names,targetPlanHash);
  if(!metadata.guardsInstalled||global.fences.length===0||global.reasons.some(reason=>reason!=='MONTHLY_INSTALL_PLAN_TRANSITION_REQUIRED')||global.fences.some(f=>f.planHash!==(installed?targetPlanHash:oldPlanHash)||f.maintenance||f.retired||f.operationId!==null))fail('COMPANY_INSTALL_NOT_DRAINED');
  return {schema,installed,metadata,controls,global,packet:{...description,schema,installed,catalogueSignature:metadata.signature,controlsSignature:controls.signature,globalStateSignature:global.signature}};
 }
 async function pairedWorker(tx,manifestHash){
  try{
   const rows=await tx.$queryRawUnsafe(`SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"='backup-worker'`);
   return env.RENDER_GIT_COMMIT===sourceRevision&&rows.length===1&&validateLifecycleWorkerCapability(rows[0],{secret:env.BACKUP_MONITOR_SECRET,manifestHash})&&JSON.parse(rows[0].heartbeatJson).workerRevision===sourceRevision;
  }catch{return false}
 }
 async function consumeBackup(requestEnvelope,proofEnvelope){
  const directory=await mkdtemp(join(tmpdir(),'mws-company-install-consume-'));
  try{
   const request=join(directory,'request.json'),proof=join(directory,'proof.json'),output=join(directory,'observation.json');
   await writeFile(request,JSON.stringify(requestEnvelope),{mode:0o600});await writeFile(proof,JSON.stringify(proofEnvelope),{mode:0o600});
   // Fixed local reviewed program; no caller-supplied executable/SQL/adapter.
   await execute('python3',[script,'--request',request,'--proof',proof,'--output',output,'--authorize-isolated-installation-backup'],{env,maxBuffer:16384,timeout:540000});
   return JSON.parse(await readFile(output,'utf8'));
  }catch(error){const diagnostic=companyInstallationBackupDiagnostic(error?.stderr);fail(diagnostic?'COMPANY_INSTALL_BACKUP_'+diagnostic:'COMPANY_INSTALL_BACKUP_READBACK_FAILED')}
  finally{await rm(directory,{recursive:true,force:true})}
 }
 return Object.freeze({
  describe:()=>structuredClone(description),
  inspect:async(actor)=>transaction(actor,true,async(tx,admitted)=>{
   const observed=await observe(tx,admitted);
   const workerReady=await pairedWorker(tx,observed.installed?targetPlanHash:oldPlanHash);
   return {packet:observed.packet,eligible:workerReady,pairedWorker:workerReady,productionActivated:false};
  }),
  install:async(actor,input)=>{
   if(!enabled)fail('COMPANY_INSTALL_DISABLED');
   if(input?.explicitAuthorization!==true)fail('COMPANY_INSTALL_AUTHORIZATION_REQUIRED');
   const request=validateCompanyInstallationBackupRequest(input.requestEnvelope,{secret:env.BACKUP_MONITOR_SECRET,storage});
   validateCompanyInstallationBackupProof(input.proofEnvelope,{secret:env.BACKUP_MONITOR_SECRET,requestEnvelope:input.requestEnvelope,storage});
   if(request.sourceRevision!==sourceRevision||request.workerRevision!==sourceRevision||request.profile!==profile)fail('COMPANY_INSTALL_REVISION_CHANGED');
   return transaction(actor,false,async(tx,admitted)=>{
    await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('mws:monthly-snapshot-install-v1',0))");
    const before=await observe(tx,admitted);
    if(!isDeepStrictEqual(before.packet,input.packet))fail('COMPANY_INSTALL_STALE_PACKET');
    const requestHash=createHash('sha256').update(input.requestEnvelope.requestJson).digest('hex');
    if(before.installed){
     const recorded=await tx.$queryRawUnsafe(`SELECT "companyId" FROM "BackofficeStaffAudit" WHERE "event"='COMPANY_AUTHORITY_SCHEMA_INSTALLED' AND "detail"->>'requestSha256'=$1 AND "detail"->>'targetPlanHash'=$2 AND "detail"->>'sourceRevision'=$3 LIMIT 1001`,requestHash,targetPlanHash,sourceRevision);
     const companies=[...new Set(before.global.fences.map(f=>f.companyId))];
     if(recorded.length!==companies.length||companies.some(id=>!recorded.some(r=>r.companyId===id)))fail('COMPANY_INSTALL_REPLAY_UNCONFIRMED');
     return {...description,installed:true,idempotentReplay:true};
    }
    const rows=await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','f') ORDER BY c.relname LIMIT 601`,before.schema);
    const allowed=new Set([...target.knownTables,'StoreLifecycleFence','StoreLifecycleExecution','StoreLifecycleTombstone','StoreLifecycleRuntime']);
    if(rows.length>600||rows.some(row=>!allowed.has(row.name)))fail('COMPANY_INSTALL_UNKNOWN_RELATION');
    for(const row of rows)await tx.$executeRawUnsafe(`LOCK TABLE ${q(before.schema)}.${q(row.name)} IN EXCLUSIVE MODE NOWAIT`);
    const locked=await observe(tx,admitted);if(!isDeepStrictEqual(locked.packet,before.packet))fail('COMPANY_INSTALL_STATE_CHANGED');
    if(env.RENDER_GIT_COMMIT!==sourceRevision||!await pairedWorker(tx,oldPlanHash))fail('COMPANY_INSTALL_WORKER_UNAVAILABLE');
    const backed=await consumeBackup(input.requestEnvelope,input.proofEnvelope);
    if(backed.sourceObservationSha256!==request.sourceObservationSha256||backed.sourceOwnershipSha256!==request.sourceOwnershipSha256||backed.fullDataDigest!==request.fullDataDigest)fail('COMPANY_INSTALL_BACKUP_STATE_CHANGED');
    // Recheck identity, packet and receipt expiry after every external wait.
    await authorize(tx,actor,false);
    validateCompanyInstallationBackupProof(input.proofEnvelope,{secret:env.BACKUP_MONITOR_SECRET,requestEnvelope:input.requestEnvelope,storage});
    if(!await pairedWorker(tx,oldPlanHash))fail('COMPANY_INSTALL_WORKER_UNAVAILABLE');
    const final=await observe(tx,admitted);if(!isDeepStrictEqual(final.packet,before.packet))fail('COMPANY_INSTALL_STATE_CHANGED');
    await tx.$executeRawUnsafe(`ALTER TABLE ${q(before.schema)}."BackofficeStaffAccount" ADD COLUMN "companyCapabilities" JSONB NOT NULL DEFAULT '[]'::jsonb`);
    for(const fence of before.global.fences){
     const changed=await tx.$executeRawUnsafe(`UPDATE ${q(before.schema)}."StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"=$2 AND "companyId"=$3 AND "planHash"=$4 AND "generation"=$5::bigint AND NOT "maintenance" AND NOT "retired" AND "operationId" IS NULL`,targetPlanHash,fence.storeId,fence.companyId,oldPlanHash,fence.generation);
     if(changed!==1)fail('COMPANY_INSTALL_STATE_CHANGED');
    }
    const selected=before.global.fences[0];await targetCore.installInTransaction(tx,admitted,{companyId:selected.companyId,storeId:selected.storeId});
    const after=await observe(tx,admitted);
    if(!after.installed||after.global.fences.length!==before.global.fences.length||before.global.fences.some(f=>!after.global.fences.some(n=>n.storeId===f.storeId&&n.companyId===f.companyId&&n.generation===f.generation)))fail('COMPANY_INSTALL_READBACK_FAILED');
    if((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(before.schema)}."BackofficeStaffAccount" WHERE "companyCapabilities"<>'[]'::jsonb LIMIT 1`)).length)fail('COMPANY_INSTALL_DEFAULT_CHANGED');
    for(const companyId of [...new Set(before.global.fences.map(f=>f.companyId))]){
     const detail={requestSha256:requestHash,sourceRevision,oldPlanHash,targetPlanHash,artifactSha256:JSON.parse(input.proofEnvelope.proofJson).artifactSha256,objectKey:JSON.parse(input.proofEnvelope.proofJson).objectKey,objectVersion:JSON.parse(input.proofEnvelope.proofJson).objectVersion,previousCatalogueSignature:before.metadata.signature,catalogueSignature:after.metadata.signature,epochs:before.global.fences.filter(f=>f.companyId===companyId).map(f=>({storeId:f.storeId,generation:f.generation}))};
     await tx.$executeRawUnsafe(`INSERT INTO "BackofficeStaffAudit" ("id","companyId","actorId","targetUserId","event","detail") VALUES($1,$2,$3,$3,'COMPANY_AUTHORITY_SCHEMA_INSTALLED',$4::jsonb)`,randomUUID(),companyId,admitted.id,JSON.stringify(detail));
    }
    return {...description,installed:true,idempotentReplay:false,transitionedEnrollments:before.global.fences.length,catalogueSignature:after.metadata.signature,pairedNewWorkerRequired:true};
   });
  }
 });
}
