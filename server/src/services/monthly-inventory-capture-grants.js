// Explicit, unmounted personal management only. No jobs, leases, timers,
// enrollment, schema creation or automatic activation are performed here.
import {randomUUID} from 'node:crypto';
import {authorizeMonthlyCaptureGrantManagementInTransaction,requireMonthlyCaptureContext} from './monthly-inventory-capture-authorization.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';

const PURPOSE='MONTHLY_INVENTORY_CAPTURE',MAX=9223372036854775807n;
const fail=code=>{throw Object.assign(new Error('Monthly inventory capture grant management refused.'),{status:409,code})};
const text=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value,'utf8')<=160&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const integer=(value,positive=false)=>typeof value==='string'&&value.length<=19&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<=MAX&&(!positive||BigInt(value)>0n);
const version=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.slice(0,23)+'Z';
const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value};
function input(raw,action){
 const keys=['companyId','storeId',...(action==='read'?[]:['lifecycleGeneration']),...(['enable','revoke'].includes(action)?['grantId','expectedRevision']:[]),...(action==='enable'?['purpose']:[])];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail('MONTHLY_CAPTURE_GRANT_INPUT_INVALID');
 const descriptors=Object.getOwnPropertyDescriptors(raw);
 if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(descriptors[key],'value'))||keys.some(key=>!Object.hasOwn(descriptors,key)))fail('MONTHLY_CAPTURE_GRANT_INPUT_INVALID');
 const value=Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
 if(!text(value.companyId)||!text(value.storeId)||action!=='read'&&!integer(value.lifecycleGeneration)||['enable','revoke'].includes(action)&&(!text(value.grantId)||!integer(value.expectedRevision,true))||action==='enable'&&value.purpose!==PURPOSE)fail('MONTHLY_CAPTURE_GRANT_INPUT_INVALID');
 return freeze(value);
}
const dates=['firstScheduledFor','createdAt','grantedAt','revokedAt','updatedAt'];
const select=`SELECT "id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration"::text AS "lifecycleGeneration","revision"::text AS revision,"active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","createdByUserId","grantedByUserId","revokedByUserId","updatedByUserId",${dates.map(key=>`to_char("${key}" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "${key}"`).join(',')},to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAt" FROM "MonthlyInventoryCaptureGrant" WHERE "companyId"=$1 AND "storeId"=$2 AND "purpose"=$3 FOR UPDATE NOWAIT`;
function verify(row,context){
 if(!row)return null;
 if(row.companyId!==context.companyId||row.storeId!==context.storeId||row.lifecycleGeneration!==context.lifecycleGeneration||row.purpose!==PURPOSE||row.purposeVersion!==1||!text(row.id)||!integer(row.revision,true)||typeof row.active!=='boolean'||!text(row.delegatorUserId)||!version(row.delegatorSessionVersion)||!text(row.createdByUserId)||!text(row.updatedByUserId)||!stamp(row.createdAt)||!stamp(row.updatedAt)||!stamp(row.observedAt)||row.createdAt>row.updatedAt||row.updatedAt>row.observedAt)fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
 if((row.revokedByUserId===null)!==(row.revokedAt===null)||row.revokedAt!==null&&(!text(row.revokedByUserId)||!stamp(row.revokedAt)||row.revokedAt<row.createdAt||row.revokedAt>row.updatedAt||row.active))fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
 if(row.activationId===null){
  if(row.active||['firstIssueMonth','firstScheduledFor','grantedByUserId','grantedAt'].some(key=>row[key]!==null))fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
 }else{
  if(!text(row.activationId)||!text(row.grantedByUserId)||row.grantedByUserId!==row.delegatorUserId||!stamp(row.grantedAt)||!stamp(row.firstScheduledFor)||row.grantedAt<row.createdAt||row.grantedAt>row.updatedAt||row.firstScheduledFor<row.grantedAt||row.revokedAt!==null&&row.revokedAt<row.grantedAt)fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
  let period;try{period=monthlyInventorySnapshotPeriod(row.firstIssueMonth)}catch{fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID')}
  if(row.firstScheduledFor!==period.scheduledFor.slice(0,23)+'000Z'||row.active&&(row.revokedAt!==null||row.revokedByUserId!==null))fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
 }
 const {observedAt,...grant}=row;return freeze(grant);
}
async function read(tx,context){return verify((await tx.$queryRawUnsafe(select,context.companyId,context.storeId,PURPOSE))[0],context)}
async function current(tx,context){
 const row=(await tx.$queryRawUnsafe(`SELECT clock_timestamp()<$1::timestamptz AS valid`,context.validUntil))[0];
 if(row?.valid!==true)fail('MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED');
}
function sameGrant(grant,request){if(!grant||grant.id!==request.grantId)fail('MONTHLY_CAPTURE_GRANT_UNAVAILABLE')}
function expected(grant,request){if(grant.revision!==request.expectedRevision)fail('MONTHLY_CAPTURE_GRANT_REVISION_STALE')}
function nextRevision(grant){if(BigInt(grant.revision)>=MAX)fail('MONTHLY_CAPTURE_GRANT_REVISION_LIMIT');return String(BigInt(grant.revision)+1n)}
function firstSlot(now){
 const instant=new Date(now);if(!Number.isFinite(instant.getTime()))fail('MONTHLY_CAPTURE_GRANT_CLOCK_INVALID');
 const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(instant).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 const previous=new Date(Date.UTC(Number(values.year),Number(values.month)-2,1)).toISOString().slice(0,7);
 let period;try{period=monthlyInventorySnapshotPeriod(previous);if(period.scheduledFor.slice(0,23)+'000Z'<now)period=monthlyInventorySnapshotPeriod(values.year+'-'+values.month)}catch{fail('MONTHLY_CAPTURE_GRANT_CLOCK_INVALID')}
 return period;
}
const instant=`WITH management_write AS MATERIALIZED (SELECT clock_timestamp() AS now)`;
function admitted(db,actor,request,mutate,perform){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
  const opaque=await authorizeMonthlyCaptureGrantManagementInTransaction(tx,actor,{companyId:request.companyId,storeId:request.storeId});
  const context=requireMonthlyCaptureContext(tx,opaque,'MANAGEMENT');
  if(request.lifecycleGeneration!==undefined&&request.lifecycleGeneration!==context.lifecycleGeneration)fail('MONTHLY_CAPTURE_GRANT_GENERATION_STALE');
  if(mutate){const epoch=await assertLifecycleMutation(tx,{companyId:context.companyId,storeId:context.storeId},context.lifecycleGeneration,{lock:true});if(!epoch.enrolled)fail('MONTHLY_CAPTURE_GRANT_GENERATION_STALE')}
  const result=await perform(tx,context);
  // This must remain the LAST database query before returning the callback:
  // INSERT/unique-row waits or readback may outlive the admission bound.
  // Expiry here rolls back a new change and refuses an expired replay alike.
  await current(tx,context);
  return result;
 },{isolationLevel:'ReadCommitted',maxWait:2000,timeout:30000});
}

export function createMonthlyInventoryCaptureGrantManager(db){
 return Object.freeze({
  async read(actor,raw){const request=input(raw,'read');return admitted(db,actor,request,false,async(tx,context)=>freeze({status:'READ',companyId:context.companyId,storeId:context.storeId,lifecycleGeneration:context.lifecycleGeneration,purpose:PURPOSE,grant:await read(tx,context)}))},
  async createInactive(actor,raw){
   const request=input(raw,'create');return admitted(db,actor,request,true,async(tx,context)=>{
    const prior=await read(tx,context);if(prior)return freeze({status:'ALREADY_EXISTS',grant:prior});
    const inserted=await tx.$queryRawUnsafe(`${instant} INSERT INTO "MonthlyInventoryCaptureGrant" ("id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration","revision","active","delegatorUserId","delegatorSessionVersion","createdByUserId","createdAt","updatedByUserId","updatedAt") SELECT $1,$2,$3,$4,1,$5::bigint,1,false,$6,$7,$6,w.now,$6,w.now FROM management_write w WHERE w.now<$8::timestamptz ON CONFLICT ("companyId","storeId","purpose") DO NOTHING RETURNING "id"`,randomUUID(),context.companyId,context.storeId,PURPOSE,context.lifecycleGeneration,context.actorId,context.sessionVersion,context.validUntil);
    const stored=await read(tx,context);if(!stored)fail('MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED');
    return freeze({status:inserted.length?'CREATED_INACTIVE':'ALREADY_EXISTS',grant:stored});
   });
  },
  async enable(actor,raw){
   const request=input(raw,'enable');return admitted(db,actor,request,true,async(tx,context)=>{
    const grant=await read(tx,context);sameGrant(grant,request);
    if(grant.active){
     if(grant.delegatorUserId!==context.actorId||grant.delegatorSessionVersion!==context.sessionVersion)fail('MONTHLY_CAPTURE_GRANT_ALREADY_ACTIVE');
     if(grant.revision!==request.expectedRevision&&BigInt(grant.revision)!==BigInt(request.expectedRevision)+1n)fail('MONTHLY_CAPTURE_GRANT_REVISION_STALE');
     return freeze({status:'ALREADY_ENABLED',grant});
    }
    expected(grant,request);const revision=nextRevision(grant);
    const now=(await tx.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`))[0]?.now;
    if(!stamp(now))fail('MONTHLY_CAPTURE_GRANT_CLOCK_INVALID');const period=firstSlot(now);
    const updated=await tx.$queryRawUnsafe(`${instant} UPDATE "MonthlyInventoryCaptureGrant" g SET "revision"=$1::bigint,"active"=true,"delegatorUserId"=$2,"delegatorSessionVersion"=$3,"activationId"=$4,"firstIssueMonth"=$5,"firstScheduledFor"=$6::timestamptz,"grantedByUserId"=$2,"grantedAt"=w.now,"revokedByUserId"=NULL,"revokedAt"=NULL,"updatedByUserId"=$2,"updatedAt"=w.now FROM management_write w WHERE g."id"=$7 AND g."companyId"=$8 AND g."storeId"=$9 AND g."purpose"=$10 AND g."lifecycleGeneration"=$11::bigint AND g."revision"=$12::bigint AND g."active"=false AND w.now<$13::timestamptz AND $6::timestamptz>=w.now RETURNING g."id"`,revision,context.actorId,context.sessionVersion,randomUUID(),period.issueMonth,period.scheduledFor,grant.id,context.companyId,context.storeId,PURPOSE,context.lifecycleGeneration,grant.revision,context.validUntil);
    if(updated.length!==1)fail('MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED');const stored=await read(tx,context);if(!stored||stored.revision!==revision||!stored.active||stored.delegatorUserId!==context.actorId||stored.delegatorSessionVersion!==context.sessionVersion)fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
    return freeze({status:'ENABLED',grant:stored});
   });
  },
  async revoke(actor,raw){
   const request=input(raw,'revoke');return admitted(db,actor,request,true,async(tx,context)=>{
    const grant=await read(tx,context);sameGrant(grant,request);
    if(!grant.active&&grant.revokedAt!==null&&(grant.revision===request.expectedRevision||grant.revokedByUserId===context.actorId&&BigInt(grant.revision)===BigInt(request.expectedRevision)+1n))return freeze({status:'ALREADY_REVOKED',grant});
    expected(grant,request);const revision=nextRevision(grant);
    const updated=await tx.$queryRawUnsafe(`${instant} UPDATE "MonthlyInventoryCaptureGrant" g SET "revision"=$1::bigint,"active"=false,"revokedByUserId"=$2,"revokedAt"=w.now,"updatedByUserId"=$2,"updatedAt"=w.now FROM management_write w WHERE g."id"=$3 AND g."companyId"=$4 AND g."storeId"=$5 AND g."purpose"=$6 AND g."lifecycleGeneration"=$7::bigint AND g."revision"=$8::bigint AND w.now<$9::timestamptz RETURNING g."id"`,revision,context.actorId,grant.id,context.companyId,context.storeId,PURPOSE,context.lifecycleGeneration,grant.revision,context.validUntil);
    if(updated.length!==1)fail('MONTHLY_CAPTURE_GRANT_AUTHORIZATION_EXPIRED');const stored=await read(tx,context);if(!stored||stored.active||stored.revision!==revision||stored.revokedByUserId!==context.actorId)fail('MONTHLY_CAPTURE_GRANT_STORED_INVALID');
    return freeze({status:'REVOKED',grant:stored});
   });
  }
 });
}
