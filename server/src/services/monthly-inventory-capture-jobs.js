// Dedicated, default-OFF inventory work. No schema/bootstrap, mail or business
// posting occurs here. Only a currently authorized persisted grant can produce
// a job; only a committed bounded lease can enter the capture coordinator.
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readCurrentMonthlyCaptureActivation} from './monthly-inventory-capture-activation.js';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {captureMonthlyInventorySnapshotForAutomation} from './monthly-inventory-snapshot-capture.js';
import {createMonthlyInventorySnapshotRepository} from './monthly-inventory-snapshot-repository.js';
import {
 normalizeMonthlyCaptureExecution,requireMonthlyCaptureAttempt,requireMonthlyCaptureContext,
 authorizeMonthlyCaptureProducerInTransaction,authorizeMonthlyCaptureLeaseClaimInTransaction,
 authorizeMonthlyCaptureSettlementInTransaction,monthlyCaptureProducerGuardParameters,
 monthlyCaptureLeaseClaimGuardParameters,monthlyCaptureSettlementGuardParameters,
 finishMonthlyCaptureMutationInTransaction,sealMonthlyCaptureClaimInTransaction
} from './monthly-inventory-capture-authorization.js';

const PURPOSE='MONTHLY_INVENTORY_CAPTURE',EXECUTOR='MONTHLY_INVENTORY_CAPTURE_V1';
const reasons=new Set(['AUTHORITY_REVOKED','LEASE_EXPIRED','SOURCE_UNAVAILABLE','SCHEMA_UNAVAILABLE','MAINTENANCE','RETRY_LIMIT']);
const statuses=new Set(['PENDING','LEASED','SUCCEEDED','HOLD','FAILED']);
const MAX=9223372036854775807n;
const fail=code=>{throw Object.assign(new Error('Monthly inventory work refused.'),{code,status:409})};
const text=v=>typeof v==='string'&&v.length>0&&v.trim()===v&&Buffer.byteLength(v,'utf8')<=160&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v,positive=false)=>typeof v==='string'&&v.length<=19&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=MAX&&(!positive||BigInt(v)>0n);
const stamp=v=>typeof v==='string'&&v.length===24&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const sha=v=>createHash('sha256').update(v,'utf8').digest('hex');
const fixed=(key,value)=>({type:'SERVICE_DELEGATION',purpose:PURPOSE,executor:EXECUTOR,[key]:value});
function closed(raw,keys){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 const descriptors=Object.getOwnPropertyDescriptors(raw);
 if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||!keys.includes(k)||!('value'in descriptors[k]))||keys.some(k=>!Object.hasOwn(descriptors,k)))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
function request(raw,key){
 const value=closed(raw,['type','purpose','executor',key]);
 if(value.type!=='SERVICE_DELEGATION'||value.purpose!==PURPOSE||value.executor!==EXECUTOR||!text(value[key]))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 return Object.freeze(value);
}
export function monthlyCaptureRetryDelay(attemptNumber){
 if(!Number.isInteger(attemptNumber)||attemptNumber<1||attemptNumber>60)fail('MONTHLY_CAPTURE_RETRY_LIMIT');
 return [60,120,240,480,900][Math.min(attemptNumber-1,4)];
}
function publicJob(row){
 const {leaseTokenHash,leaseExpiresAt,claimedSourceRevision,...result}=row;
 return Object.freeze(result);
}
const dates=['scheduledFor','leaseExpiresAt','nextAttemptAt','createdAt','updatedAt'];
const columns=`j."id",j."companyId",j."storeId",j."purpose",j."purposeVersion",j."lifecycleGeneration"::text AS "lifecycleGeneration",j."issueMonth",j."grantId",j."grantRevision"::text AS "grantRevision",j."activationId",j."status",j."attempt",j."leaseTokenHash",j."claimedSourceRevision",j."holdReason",${dates.map(k=>`to_char(j."${k}" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "${k}"`).join(',')}`;
function job(row,scope){
 if(!row||!['id','companyId','storeId','grantId','activationId'].every(k=>text(row[k]))||row.purpose!==PURPOSE||row.purposeVersion!==1||!integer(row.lifecycleGeneration)||!integer(row.grantRevision,true)||!statuses.has(row.status)||!Number.isInteger(row.attempt)||row.attempt<0||row.attempt>60||!stamp(row.scheduledFor)||!stamp(row.createdAt)||!stamp(row.updatedAt)||row.createdAt>row.updatedAt||!(row.nextAttemptAt===null||stamp(row.nextAttemptAt))||!(row.holdReason===null||reasons.has(row.holdReason)))fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
 let period;try{period=monthlyInventorySnapshotPeriod(row.issueMonth)}catch{fail('MONTHLY_CAPTURE_JOB_STORED_INVALID')}
 if(row.scheduledFor!==period.scheduledFor)fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
 if(row.status==='LEASED'){
  if(row.attempt<1||typeof row.leaseTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(row.leaseTokenHash)||!stamp(row.leaseExpiresAt)||typeof row.claimedSourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(row.claimedSourceRevision)||row.holdReason!==null||row.nextAttemptAt!==null)fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
 }else if(row.leaseTokenHash!==null||row.leaseExpiresAt!==null||row.claimedSourceRevision!==null)fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
 if(row.status==='PENDING'&&(row.attempt!==0||row.holdReason!==null||row.nextAttemptAt!==null)||row.status==='SUCCEEDED'&&(row.holdReason!==null||row.nextAttemptAt!==null)||row.status==='HOLD'&&(!reasons.has(row.holdReason)||row.nextAttemptAt!==null)||row.status==='FAILED'&&(row.attempt<1||!['SOURCE_UNAVAILABLE','RETRY_LIMIT',null].includes(row.holdReason)||row.holdReason==='RETRY_LIMIT'&&(row.attempt!==60||row.nextAttemptAt!==null)||row.holdReason!=='RETRY_LIMIT'&&!stamp(row.nextAttemptAt)))fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
 if(scope&&['companyId','storeId','lifecycleGeneration','grantId','grantRevision','activationId'].some(k=>row[k]!==scope[k])||scope&&row.issueMonth!==(scope.issueMonth??scope.month))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 return Object.freeze(row);
}
async function readJob(tx,id,scope){
 const rows=await tx.$queryRawUnsafe(`SELECT ${columns} FROM "MonthlyInventoryCaptureJob" j WHERE j."id"=$1`,id);
 if(rows.length!==1)fail('MONTHLY_CAPTURE_JOB_UNAVAILABLE');return job(rows[0],scope);
}
function failure(error){
 const code=error?.code,pg=error?.meta?.code;
 if(['MONTHLY_CAPTURE_OFF','MONTHLY_CAPTURE_CONTROL_CHANGED','MONTHLY_CAPTURE_REVISION_CHANGED'].includes(code))return {off:true,reason:'AUTHORITY_REVOKED',transient:false};
 if(/MAINTENANCE|RETIRED/.test(String(code)))return {reason:'MAINTENANCE',transient:false};
 if(/SCHEMA|RECOVERY_REVIEW|ENROLLMENT/.test(String(code))||pg==='42P01')return {reason:'SCHEMA_UNAVAILABLE',transient:false};
 if(/LEASE|AUTHORIZATION_EXPIRED|ATTEMPT/.test(String(code)))return {reason:'LEASE_EXPIRED',transient:false};
 if(/RETRY_LIMIT/.test(String(code)))return {reason:'RETRY_LIMIT',transient:false};
 if(/AUTHORITY|DELEGATION|MODULE|GENERATION|BEFORE_DUE|LATEST_DUE|NOT_CLAIMABLE|RETRY_NOT_DUE|STORE_ALREADY/.test(String(code)))return {reason:'AUTHORITY_REVOKED',transient:false};
 if(['P1001','P1002','P1008','P1017','P2024','P2028','55P03','40001','40P01','57014'].includes(code)||['55P03','40001','40P01','57014'].includes(pg))return {reason:'SOURCE_UNAVAILABLE',transient:true};
 return {reason:'SOURCE_UNAVAILABLE',transient:false};
}

export function createMonthlyInventoryCaptureJobs(db,options={}){
 // Construction is inert, including when a test/startup has no running SHA.
 if(!options||typeof options!=='object'||Array.isArray(options))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 const supplied=closed(options,Object.keys(options));
 if(Object.keys(supplied).some(k=>k!=='sourceRevision')||supplied.sourceRevision!==undefined&&(typeof supplied.sourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(supplied.sourceRevision)))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 function active(){
  const control=readCurrentMonthlyCaptureActivation();
  if(!control.valid||!control.enabled)fail('MONTHLY_CAPTURE_OFF');
  const revision=process.env.RENDER_GIT_COMMIT||process.env.GIT_COMMIT;
  if(typeof revision!=='string'||!/^[a-f0-9]{40}$/.test(revision)||supplied.sourceRevision!==undefined&&supplied.sourceRevision!==revision)fail('MONTHLY_CAPTURE_REVISION_CHANGED');
  return revision;
 }
 function transaction(perform){
  const sourceRevision=active();
  if(!db||typeof db.$transaction!=='function')fail('MONTHLY_CAPTURE_DATABASE_UNAVAILABLE');
  return db.$transaction(async tx=>{
   await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
   return perform(tx,sourceRevision);
  },{isolationLevel:'ReadCommitted',maxWait:2000,timeout:30000});
 }
 async function lifecycle(tx,scope){
  const state=await assertLifecycleMutation(tx,{companyId:scope.companyId,storeId:scope.storeId},scope.lifecycleGeneration,{lock:true});
  if(!state.enrolled)fail('MONTHLY_CAPTURE_ENROLLMENT_REQUIRED');
 }
 async function produce(raw){
  if(arguments.length!==1)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  const input=request(raw,'grantId');
  return transaction(async(tx,sourceRevision)=>{
   const context=await authorizeMonthlyCaptureProducerInTransaction(tx,input,{sourceRevision,db});
   const scope=requireMonthlyCaptureContext(tx,context,'PRODUCER',db),guard=monthlyCaptureProducerGuardParameters(tx,context);
   await lifecycle(tx,scope);
   const inserted=await tx.$queryRawUnsafe(`WITH moment AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) AS now) INSERT INTO "MonthlyInventoryCaptureJob" ("id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision","activationId","status","attempt","createdAt","updatedAt") SELECT $1,$2,$3,'MONTHLY_INVENTORY_CAPTURE',1,$4::bigint,$5,$6::timestamptz,$7,$8::bigint,$9,'PENDING',0,m.now,m.now FROM moment m WHERE m.now<$10::timestamptz AND EXISTS (SELECT 1 FROM "MonthlyInventoryCaptureGrant" g WHERE g."id"=$7 AND g."companyId"=$2 AND g."storeId"=$3 AND g."lifecycleGeneration"=$4::bigint AND g."purpose"='MONTHLY_INVENTORY_CAPTURE' AND g."purposeVersion"=1 AND g."active"=TRUE AND g."revokedAt" IS NULL AND g."revision"=$8::bigint AND g."activationId"=$9 AND g."firstScheduledFor"<=$6::timestamptz) ON CONFLICT ("companyId","storeId","lifecycleGeneration","issueMonth") DO NOTHING RETURNING "id"`,randomUUID(),guard.companyId,guard.storeId,guard.lifecycleGeneration,guard.issueMonth,guard.scheduledFor,guard.grantId,guard.grantRevision,guard.activationId,guard.validUntil);
   const rows=await tx.$queryRawUnsafe(`SELECT ${columns} FROM "MonthlyInventoryCaptureJob" j WHERE j."companyId"=$1 AND j."storeId"=$2 AND j."lifecycleGeneration"=$3::bigint AND j."issueMonth"=$4`,guard.companyId,guard.storeId,guard.lifecycleGeneration,guard.issueMonth);
   if(rows.length!==1)fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');
   const stored=job(rows[0],scope),result=Object.freeze({status:inserted.length?'CREATED':'ALREADY_EXISTS',jobId:stored.id,job:publicJob(stored)});
   await finishMonthlyCaptureMutationInTransaction(tx,context);
   return result;
  });
 }
 async function claim(raw){
  if(arguments.length!==1)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  const input=request(raw,'jobId');
  return transaction(async(tx,sourceRevision)=>{
   const context=await authorizeMonthlyCaptureLeaseClaimInTransaction(tx,input,{sourceRevision,db});
   const scope=requireMonthlyCaptureContext(tx,context,'LEASE_CLAIM',db),guard=monthlyCaptureLeaseClaimGuardParameters(tx,context);
   await lifecycle(tx,scope);await readJob(tx,input.jobId,scope);
   const token=randomBytes(32).toString('hex'),execution=Object.freeze({...fixed('jobId',input.jobId),leaseToken:token});
   const updated=await tx.$queryRawUnsafe(`WITH moment AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) AS now) UPDATE "MonthlyInventoryCaptureJob" j SET "status"='LEASED',"attempt"="attempt"+1,"leaseTokenHash"=$1,"leaseExpiresAt"=m.now+INTERVAL '120 seconds',"claimedSourceRevision"=$2,"holdReason"=NULL,"nextAttemptAt"=NULL,"updatedAt"=m.now FROM moment m WHERE j."id"=$3 AND j."companyId"=$4 AND j."storeId"=$5 AND j."lifecycleGeneration"=$6::bigint AND j."grantId"=$7 AND j."grantRevision"=$8::bigint AND j."activationId"=$9 AND j."issueMonth"=$10 AND j."status"=$11 AND j."attempt"=$12 AND j."leaseTokenHash" IS NOT DISTINCT FROM $13::text AND j."claimedSourceRevision" IS NOT DISTINCT FROM $14::text AND j."attempt"<60 AND (j."status" IN ('PENDING','FAILED') AND (j."nextAttemptAt" IS NULL OR j."nextAttemptAt"<=m.now) OR j."status"='LEASED' AND j."leaseExpiresAt"<=m.now) AND m.now<$15::timestamptz RETURNING j."id"`,sha(token),sourceRevision,input.jobId,guard.companyId,guard.storeId,guard.lifecycleGeneration,guard.grantId,guard.grantRevision,guard.activationId,guard.issueMonth,guard.previousStatus,guard.previousAttempt,guard.previousLeaseTokenHash,guard.previousClaimedSourceRevision,guard.validUntil);
   if(updated.length!==1)fail('MONTHLY_CAPTURE_LEASE_INVALID');
   const stored=await readJob(tx,input.jobId,scope);
   const attempt=await sealMonthlyCaptureClaimInTransaction(tx,context,execution);
   // Return only after Prisma COMMIT. Any rolled-back seal is powerless:
   // every later phase independently rereads the actual committed lease.
   return Object.freeze({status:'LEASED',jobId:stored.id,execution,attempt,attemptNumber:stored.attempt});
  });
 }
 async function settle(execution,attempt,classification){
  const selected=normalizeMonthlyCaptureExecution(execution);
  requireMonthlyCaptureAttempt(db,selected,attempt);
  return transaction(async(tx,sourceRevision)=>{
   const context=await authorizeMonthlyCaptureSettlementInTransaction(tx,selected,{sourceRevision,db,attempt});
   const scope=requireMonthlyCaptureContext(tx,context,'SETTLEMENT',db),guard=monthlyCaptureSettlementGuardParameters(tx,context);
   await lifecycle(tx,scope);
   const repository=createMonthlyInventorySnapshotRepository(db,{sourceRevision,attempt});
   const receipt=await repository.findExistingForMonthlySettlementInTransaction(tx,context);
   if(!classification&&!receipt)fail('MONTHLY_CAPTURE_SNAPSHOT_UNAVAILABLE');
   // An uncertain capture response cannot turn an already committed immutable
   // success into a retry. Always verify the actual row before failure handling.
   let status='SUCCEEDED',holdReason=null,delay=null;
   if(!receipt){
    if(guard.attempt>=60){status='FAILED';holdReason='RETRY_LIMIT'}
    else if(classification.transient){status='FAILED';delay=monthlyCaptureRetryDelay(guard.attempt)}
    else {status='HOLD';holdReason=classification.reason}
   }
   const changed=await tx.$queryRawUnsafe(`WITH moment AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) AS now) UPDATE "MonthlyInventoryCaptureJob" j SET "status"=$1,"holdReason"=$2,"nextAttemptAt"=CASE WHEN $3::integer IS NULL THEN NULL ELSE m.now+($3::integer*INTERVAL '1 second') END,"leaseTokenHash"=NULL,"leaseExpiresAt"=NULL,"claimedSourceRevision"=NULL,"updatedAt"=m.now FROM moment m WHERE j."id"=$4 AND j."companyId"=$5 AND j."storeId"=$6 AND j."lifecycleGeneration"=$7::bigint AND j."issueMonth"=$8 AND j."grantId"=$9 AND j."grantRevision"=$10::bigint AND j."activationId"=$11 AND j."attempt"=$12 AND j."status"='LEASED' AND j."leaseTokenHash"=$13 AND j."claimedSourceRevision"=$14 AND j."leaseExpiresAt">m.now AND m.now<$15::timestamptz RETURNING j."id"`,status,holdReason,delay,selected.jobId,guard.companyId,guard.storeId,guard.lifecycleGeneration,guard.issueMonth,guard.grantId,guard.grantRevision,guard.activationId,guard.attempt,guard.leaseTokenHash,sourceRevision,guard.validUntil);
   if(changed.length!==1)fail('MONTHLY_CAPTURE_LEASE_INVALID');
   const stored=await readJob(tx,selected.jobId,scope);
   const transition={status,holdReason,nextAttemptAt:stored.nextAttemptAt};
   const result=Object.freeze({status,jobId:stored.id,...(receipt?{receipt}:{reason:holdReason??'SOURCE_UNAVAILABLE',nextAttemptAt:stored.nextAttemptAt})});
   await finishMonthlyCaptureMutationInTransaction(tx,context,transition);
   return result;
  });
 }
 async function settleSuccess(execution,attempt){
  if(arguments.length!==2)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  return settle(execution,attempt,null);
 }
 async function runGrant(grantId){
  if(arguments.length!==1)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  if(!text(grantId))fail('MONTHLY_CAPTURE_INPUT_INVALID');
  let lease=null;
  try{
   const produced=await produce(fixed('grantId',grantId));
   if(produced.job.status==='SUCCEEDED')return Object.freeze({status:'ALREADY_SETTLED',attempted:0,jobId:produced.jobId});
   if(produced.job.status==='HOLD')return Object.freeze({status:'HOLD',attempted:0,jobId:produced.jobId,reason:produced.job.holdReason});
   lease=await claim(fixed('jobId',produced.jobId));
   const captured=await captureMonthlyInventorySnapshotForAutomation(db,lease.execution,lease.attempt);
   const result=await settleSuccess(lease.execution,lease.attempt);
   return Object.freeze({status:result.status,attempted:1,jobId:lease.jobId,sourceReadPerformed:captured.sourceReadPerformed,newlyReadCandidateStored:captured.newlyReadCandidateStored});
  }catch(error){
   const classified=failure(error);
   if(lease&&!classified.off){
    try{
     const result=await settle(lease.execution,lease.attempt,classified);
     return Object.freeze({status:result.status,attempted:1,jobId:lease.jobId,...(result.status==='SUCCEEDED'?{verifiedExistingSnapshot:true}:{reason:result.reason})});
    }catch(freshError){
     const latest=failure(freshError);
     return Object.freeze({status:latest.off?'OFF':'HOLD',attempted:1,jobId:lease.jobId,reason:latest.reason});
    }
   }
   // Logical refusal is not a persisted status change. Never clean up a stale,
   // revoked or expired job using authority the old executor no longer owns.
   return Object.freeze({status:classified.off?'OFF':'HOLD',attempted:lease?1:0,...(lease?{jobId:lease.jobId}:{}),reason:classified.reason});
  }
 }
 async function scanEligibleGrants(raw){
  if(arguments.length!==1)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  const input=closed(raw,['after','limit']);
  if(!Number.isInteger(input.limit)||input.limit<1||input.limit>20)fail('MONTHLY_CAPTURE_INPUT_INVALID');
  let after=null;
  if(input.after!==null){after=closed(input.after,['companyId','storeId','id']);if(!Object.values(after).every(text))fail('MONTHLY_CAPTURE_INPUT_INVALID')}
  active();const control=readCurrentMonthlyCaptureActivation();
  if(!db||typeof db.$queryRawUnsafe!=='function')fail('MONTHLY_CAPTURE_DATABASE_UNAVAILABLE');
  const values=[PURPOSE,control.notBefore,input.limit];
  let cursor='';if(after){cursor=' AND ("companyId","storeId","id")>($4,$5,$6)';values.push(after.companyId,after.storeId,after.id)}
  const rows=await db.$queryRawUnsafe(`SELECT "id","companyId","storeId" FROM "MonthlyInventoryCaptureGrant" WHERE "purpose"=$1 AND "purposeVersion"=1 AND "active"=TRUE AND "firstScheduledFor"<=clock_timestamp() AND clock_timestamp()>=$2::timestamptz${cursor} ORDER BY "companyId","storeId","id" LIMIT $3`,...values);
  const fresh=readCurrentMonthlyCaptureActivation();
  if(!fresh.valid||!fresh.enabled||fresh.fingerprint!==control.fingerprint)fail('MONTHLY_CAPTURE_CONTROL_CHANGED');
  if(!Array.isArray(rows)||rows.length>input.limit)fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');
  return Object.freeze(rows.map(row=>{const value=closed(row,['id','companyId','storeId']);if(!Object.values(value).every(text))fail('MONTHLY_CAPTURE_JOB_STORED_INVALID');return Object.freeze(value)}));
 }
 return Object.freeze({produce,claim,settleSuccess,runGrant,scanEligibleGrants});
}
