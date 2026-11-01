// Unmounted delegation authority. Opaque contexts are valid only in their original transaction/stage.
import {createHash,timingSafeEqual} from 'node:crypto';
import {readCurrentMonthlyCaptureActivation} from './monthly-inventory-capture-activation.js';
import {companyModuleState,isCurrentlyActive} from '../middleware/module-access.js';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';
import {validateMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal} from './monthly-inventory-capture-schema.js';
const PURPOSE='MONTHLY_INVENTORY_CAPTURE',EXECUTOR='MONTHLY_INVENTORY_CAPTURE_V1';
const contexts=new WeakMap(),attempts=new WeakMap(),MAX=9223372036854775807n;
const fail=code=>{throw Object.assign(new Error('Monthly capture authorization refused.'),{status:403,code})};
const sha=v=>createHash('sha256').update(v).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))freeze(x)}return v};
const text=v=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v,'utf8')<=160&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v,positive=false)=>typeof v==='string'&&v.length<=19&&/^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v)<=MAX&&(!positive||BigInt(v)>0n);
const version=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const stamp=v=>typeof v==='string'&&v.length===24&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const iso=v=>{const d=v instanceof Date?v:new Date(v);if(!Number.isFinite(d.getTime()))fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');return d.toISOString()};
function copy(input,keys,required=keys){if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('MONTHLY_CAPTURE_INPUT_INVALID');const d=Object.getOwnPropertyDescriptors(input);if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||!keys.includes(k)||!('value'in d[k]))||required.some(k=>!d[k]))fail('MONTHLY_CAPTURE_INPUT_INVALID');return Object.fromEntries(Object.entries(d).map(([k,x])=>[k,x.value]))}
export function normalizeMonthlyCaptureExecution(input){const r=copy(input,['type','purpose','executor','jobId','leaseToken']);if(r.type!=='SERVICE_DELEGATION'||r.purpose!==PURPOSE||r.executor!==EXECUTOR||!text(r.jobId)||typeof r.leaseToken!=='string'||r.leaseToken.length!==64||!/^[a-f0-9]{64}$/.test(r.leaseToken))fail('MONTHLY_CAPTURE_INPUT_INVALID');return freeze(r)}
function actorCopy(input){if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))fail('MONTHLY_CAPTURE_INPUT_INVALID');const d=Object.getOwnPropertyDescriptors(input),a={};for(const k of ['id','companyId','role','platformRole','isSuperAdmin','ownerCompanyId','tokenType','sessionId','sessionVersion','mustChangePassword','storeId','supportContext'])if(d[k]){if(!('value'in d[k]))fail('MONTHLY_CAPTURE_INPUT_INVALID');a[k]=d[k].value;if(k==='supportContext'&&a[k]!=null){const context=copy(a[k],['companyId','companyName','storeId','storeName','destination'],['companyId']);if(!text(context.companyId)||!(context.storeId===undefined||context.storeId===null||text(context.storeId))||Object.hasOwn(context,'companyName')&&typeof context.companyName!=='string'||Object.hasOwn(context,'storeName')&&context.storeName!==null&&typeof context.storeName!=='string'||Object.hasOwn(context,'destination')&&!['ALL','BACKOFFICE','SHIFTS','CASH_CONTROL'].includes(context.destination))fail('MONTHLY_CAPTURE_INPUT_INVALID');a[k]={companyId:context.companyId,...(Object.hasOwn(context,'storeId')?{storeId:context.storeId}:{})}}}if(!text(a.id)||!text(a.companyId)||!text(a.sessionId)||!version(a.sessionVersion)||a.tokenType!=='BACKOFFICE_USER'||a.mustChangePassword===true)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');for(const [k,v]of Object.entries(a))if(k!=='supportContext'&&v!==null&&!['string','boolean','number'].includes(typeof v))fail('MONTHLY_CAPTURE_INPUT_INVALID');return freeze(a)}
async function clock(tx,stage){if(!tx||typeof tx.$queryRawUnsafe!=='function')fail('MONTHLY_CAPTURE_CONTEXT_INVALID');const r=(await tx.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation,to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "transactionStartedAt",to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt"`))[0];if(!r||!stamp(r.transactionStartedAt)||!stamp(r.readAt)||r.transactionStartedAt>r.readAt)fail('MONTHLY_CAPTURE_TRANSACTION_INVALID');if(stage==='SOURCE'){if(r.readOnly!=='on'||!['repeatable read','serializable'].includes(r.isolation)||Date.parse(r.readAt)-Date.parse(r.transactionStartedAt)>30000)fail('MONTHLY_CAPTURE_SOURCE_TRANSACTION_REQUIRED')}else if(r.readOnly!=='off'||r.isolation!=='read committed')fail('MONTHLY_CAPTURE_WRITE_TRANSACTION_REQUIRED');return r}
const rowLock=(stage,exclusive=false)=>stage==='SOURCE'?'':exclusive&&['LEASE_CLAIM','SETTLEMENT'].includes(stage)?' FOR UPDATE NOWAIT':' FOR SHARE NOWAIT';
async function locks(tx){for(const table of ['CompanyModule','OwnerCompanyAccess','StorePaidModule'])await tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN SHARE MODE NOWAIT`)}
async function user(tx,id,stage){const rows=await tx.$queryRawUnsafe(`SELECT "id","companyId","role"::text AS role,"sessionVersion","mustChangePassword" FROM "User" WHERE "id"=$1${rowLock(stage)}`,id);if(rows.length!==1)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');const r=rows[0];if(!text(r.id)||!text(r.companyId)||!['OWNER','SUPER_ADMIN'].includes(r.role)||!version(r.sessionVersion)||r.mustChangePassword!==false)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');return r}
async function job(tx,id,stage){const rows=await tx.$queryRawUnsafe(`SELECT "id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration"::text AS "lifecycleGeneration","issueMonth","scheduledFor","grantId","grantRevision"::text AS "grantRevision","activationId","status","attempt","leaseTokenHash","leaseExpiresAt","claimedSourceRevision","holdReason","nextAttemptAt","updatedAt" FROM "MonthlyInventoryCaptureJob" WHERE "id"=$1${rowLock(stage,true)}`,id);if(rows.length!==1)fail('MONTHLY_CAPTURE_JOB_UNAVAILABLE');return rows[0]}
async function grant(tx,id,stage){const rows=await tx.$queryRawUnsafe(`SELECT "id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration"::text AS "lifecycleGeneration","revision"::text AS revision,"active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","firstScheduledFor","grantedAt","revokedAt" FROM "MonthlyInventoryCaptureGrant" WHERE "id"=$1${rowLock(stage,true)}`,id);if(rows.length!==1)fail('MONTHLY_CAPTURE_GRANT_INACTIVE');return rows[0]}
async function authority(tx,current,scope,stage,now,actor=null){
 const ends=[];for(const id of [...new Set([current.companyId,scope.companyId])].sort()){const rows=await tx.$queryRawUnsafe(`SELECT "id","active" FROM "Company" WHERE "id"=$1${rowLock(stage)}`,id);if(rows.length!==1||(id===scope.companyId||current.role==='OWNER')&&rows[0].active!==true)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED')}
 const stores=await tx.$queryRawUnsafe(`SELECT "id","companyId","name","active" FROM "Store" WHERE "id"=$1${rowLock(stage)}`,scope.storeId);if(stores.length!==1||stores[0].companyId!==scope.companyId||stores[0].active!==true)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');
 if(current.role==='OWNER'&&current.companyId!==scope.companyId){const access=await tx.$queryRawUnsafe(`SELECT 1 FROM "OwnerCompanyAccess" WHERE "ownerId"=$1 AND "companyId"=$2 LIMIT 2`,current.id,scope.companyId);if(access.length!==1)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED')}
 if(actor){if(actor.storeId&&actor.storeId!==scope.storeId||actor.companyId!==scope.companyId)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');if(current.role==='OWNER'){if(actor.role!=='OWNER'||actor.isSuperAdmin||actor.platformRole==='SUPER_ADMIN'||actor.supportContext||current.companyId!==scope.companyId&&actor.ownerCompanyId!==scope.companyId)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED')}else if(actor.supportContext&&(actor.supportContext.companyId!==scope.companyId||actor.supportContext.storeId&&actor.supportContext.storeId!==scope.storeId))fail('MONTHLY_CAPTURE_AUTHORITY_DENIED')}
 const state=await companyModuleState(scope.companyId,{db:tx,now:new Date(now)});if(!state?.licenseAllowed)fail('MONTHLY_CAPTURE_MODULE_INACTIVE');if(state.subscriptionEndsAt!=null)ends.push(iso(state.subscriptionEndsAt));
 const overrides=await tx.$queryRawUnsafe(`SELECT "companyId","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=$1 AND "moduleKey"='INVENTORY' LIMIT 2`,scope.storeId);if(overrides.length>1||overrides[0]&&overrides[0].companyId!==scope.companyId)fail('MONTHLY_CAPTURE_MODULE_INACTIVE');
 const modules=state.modules.filter(m=>m.moduleKey==='INVENTORY');if(modules.length>1)fail('MONTHLY_CAPTURE_MODULE_INACTIVE');const effective=overrides[0]??modules[0];if(effective?.startsAt!=null&&iso(effective.startsAt)>now)fail('MONTHLY_CAPTURE_MODULE_INACTIVE');if(!effective||!isCurrentlyActive(effective,new Date(now)))fail('MONTHLY_CAPTURE_MODULE_INACTIVE');if(effective.endsAt!=null)ends.push(iso(effective.endsAt));
 return {store:freeze({id:stores[0].id,companyId:stores[0].companyId,name:stores[0].name}),ends};
}
async function fence(tx,scope,stage){const rows=await tx.$queryRawUnsafe(`SELECT "companyId","generation"::text AS generation,"maintenance","retired","operationId","planHash" FROM "StoreLifecycleFence" WHERE "storeId"=$1${rowLock(stage)}`,scope.storeId);const f=rows[0];if(rows.length!==1||f.companyId!==scope.companyId||!integer(f.generation))fail('MONTHLY_CAPTURE_ENROLLMENT_REQUIRED');const expected=sha(JSON.stringify(monthlyInventoryCaptureLifecycleManifestProposal()));if(f.planHash!==expected)fail('MONTHLY_CAPTURE_ENROLLMENT_REQUIRED');if(f.maintenance||f.retired||f.operationId!==null)fail('MONTHLY_CAPTURE_MAINTENANCE');return f}
async function schema(tx){const result=await validateMonthlyInventoryCaptureSchema(tx);if(result?.available!==true||result.lifecycleGuardsInstalled!==true)fail('MONTHLY_CAPTURE_SCHEMA_REQUIRED')}
function mint(tx,stage,data){const context=Object.freeze({});contexts.set(context,{tx,stage,...data});return context}

const staged = new Set(['SOURCE','LOOKUP','WRITE','MANAGEMENT','PRODUCER','LEASE_CLAIM','SETTLEMENT']);
const updateStages = new Set(['LEASE_CLAIM','SETTLEMENT']);
const reasons = new Set(['AUTHORITY_REVOKED','LEASE_EXPIRED','SOURCE_UNAVAILABLE','SCHEMA_UNAVAILABLE','MAINTENANCE','RETRY_LIMIT']);
const fixedRequest = (raw,key) => {
 const value=copy(raw,['type','purpose','executor',key]);
 if(value.type!=='SERVICE_DELEGATION'||value.purpose!==PURPOSE||value.executor!==EXECUTOR||!text(value[key]))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 return freeze(value);
};
const validRevision = value => typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function runtimeRevision(){
 const value=process.env.RENDER_GIT_COMMIT||process.env.GIT_COMMIT;
 if(!validRevision(value))fail('MONTHLY_CAPTURE_REVISION_UNAVAILABLE');
 return value;
}
function processControl(captured){
 const value=readCurrentMonthlyCaptureActivation();
 if(value?.valid!==true||value.enabled!==true)fail('MONTHLY_CAPTURE_OFF');
 if(captured&&value.fingerprint!==captured.fingerprint)fail('MONTHLY_CAPTURE_CONTROL_CHANGED');
 return value;
}
function controlledAt(now,captured){
 const value=processControl(captured);
 if(!stamp(now)||now<value.notBefore)fail('MONTHLY_CAPTURE_BEFORE_ACTIVATION');
 return value;
}
const fromMs = value => new Date(value).toISOString();
function latestDue(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const previous=offset=>new Date(Date.UTC(Number(parts.year),Number(parts.month)-1-offset,1)).toISOString().slice(0,7);
 let result=monthlyInventorySnapshotPeriod(previous(1));
 if(result.scheduledFor>now)result=monthlyInventorySnapshotPeriod(previous(2));
 return result;
}
export function monthlyCaptureLatestDuePeriod(dbReadAt){
 if(!stamp(dbReadAt))fail('MONTHLY_CAPTURE_CLOCK_INVALID');
 return latestDue(dbReadAt);
}
function currentPeriod(now,g,control,selected){
 const period=latestDue(now);
 if(selected&&iso(selected.scheduledFor)>now)fail('MONTHLY_CAPTURE_BEFORE_DUE');
 if(selected&&(selected.issueMonth!==period.issueMonth||iso(selected.scheduledFor)!==period.scheduledFor))fail('MONTHLY_CAPTURE_NOT_LATEST_DUE');
 const first=monthlyInventorySnapshotPeriod(g.firstIssueMonth).scheduledFor;
 if(iso(g.firstScheduledFor)!==first||first<iso(g.grantedAt))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 if(period.scheduledFor<first||period.scheduledFor<control.notBefore)fail('MONTHLY_CAPTURE_BEFORE_ELIGIBLE_SLOT');
 return period;
}
function activeGrant(g,current,scope,f){
 if(!text(g.id)||g.companyId!==scope.companyId||g.storeId!==scope.storeId||g.purpose!==PURPOSE||g.purposeVersion!==1||!integer(g.revision,true)||!integer(g.lifecycleGeneration)||g.lifecycleGeneration!==f.generation||g.active!==true||g.revokedAt!==null||!text(g.activationId)||g.delegatorUserId!==current.id||g.delegatorSessionVersion!==current.sessionVersion)fail('MONTHLY_CAPTURE_DELEGATION_STALE');
}
function sameOrigin(j,g){
 if(!text(j.id)||!text(j.grantId)||!text(j.activationId)||!integer(j.lifecycleGeneration)||!integer(j.grantRevision,true)||j.purpose!==PURPOSE||j.purposeVersion!==1||j.companyId!==g.companyId||j.storeId!==g.storeId||j.lifecycleGeneration!==g.lifecycleGeneration||j.grantId!==g.id||j.grantRevision!==g.revision||j.activationId!==g.activationId)fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 if(!Number.isInteger(j.attempt)||j.attempt<0||j.attempt>60)fail('MONTHLY_CAPTURE_LEASE_INVALID');
}
function attemptData(db,execution,attempt){
 const d=attempts.get(attempt);
 if(!d||d.db!==db||execution.jobId!==d.execution.jobId||execution.leaseToken!==d.execution.leaseToken)fail('MONTHLY_CAPTURE_ATTEMPT_REQUIRED');
 if(d.invalidated)fail('MONTHLY_CAPTURE_ATTEMPT_INVALIDATED');
 try{processControl(d.control);if(runtimeRevision()!==d.sourceRevision)fail('MONTHLY_CAPTURE_REVISION_CHANGED')}catch(error){d.invalidated=true;throw error}
 return d;
}
export function requireMonthlyCaptureAttempt(db,input,attempt){
 const execution=normalizeMonthlyCaptureExecution(input),d=attemptData(db,execution,attempt);
 return d.public;
}
function backgroundOptions(raw){
 const out=copy(raw,['sourceRevision','db','attempt'],['sourceRevision']);
 if(!validRevision(out.sourceRevision))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 return out;
}
function operationalOptions(raw){
 const out=backgroundOptions(raw);
 if(!out.db||typeof out.db.$transaction!=='function'||out.attempt!==undefined)fail('MONTHLY_CAPTURE_INPUT_INVALID');
 if(out.sourceRevision!==runtimeRevision())fail('MONTHLY_CAPTURE_REVISION_CHANGED');
 processControl();
 return out;
}
function contextData(tx,context,stage){
 const d=contexts.get(context);
 if(!d||d.tx!==tx||d.stage!==stage||!staged.has(stage))fail('MONTHLY_CAPTURE_CONTEXT_INVALID');
 return d;
}
export function requireMonthlyCaptureContext(tx,context,stage,db){
 const d=contextData(tx,context,stage);
 if((stage==='SETTLEMENT'&&db===undefined)||(db!==undefined&&d.db!==db))fail('MONTHLY_CAPTURE_CONTEXT_INVALID');
 return d.public;
}
export function monthlyCaptureWriteGuardParameters(tx,context){return contextData(tx,context,'WRITE').guard;}
export function monthlyCaptureProducerGuardParameters(tx,context){return contextData(tx,context,'PRODUCER').guard;}
export function monthlyCaptureLeaseClaimGuardParameters(tx,context){return contextData(tx,context,'LEASE_CLAIM').guard;}
export function monthlyCaptureSettlementGuardParameters(tx,context){return contextData(tx,context,'SETTLEMENT').guard;}
async function lockedAuthority(tx,gh,stage,initial){
 const uh=await user(tx,gh.delegatorUserId,'SOURCE');
 if(stage!=='SOURCE')await locks(tx);
 const scope={companyId:gh.companyId,storeId:gh.storeId};
 if(!text(scope.companyId)||!text(scope.storeId))fail('MONTHLY_CAPTURE_JOB_UNAVAILABLE');
 const auth=await authority(tx,uh,scope,stage,initial.readAt);
 const current=await user(tx,uh.id,stage);
 if(JSON.stringify(current)!==JSON.stringify(uh))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 const f=await fence(tx,scope,stage),g=await grant(tx,gh.id,stage);
 if(JSON.stringify(g)!==JSON.stringify(gh))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 activeGrant(g,current,scope,f);
 return {scope,auth,current,f,g};
}
function boundedUntil(initial,final,ends,expiry){
 const all=[fromMs(Date.parse(initial.readAt)+30000),...ends,...(expiry?[expiry]:[])];
 const until=all.sort()[0];
 if(final.readAt>=until)fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');
 return until;
}
function projection(base,period,final,validUntil,sourceRevision,extra={}){
 return freeze({...base.scope,month:period.issueMonth,issueMonth:period.issueMonth,scheduledFor:period.scheduledFor,lifecycleGeneration:base.f.generation,store:base.auth.store,principal:null,grantId:base.g.id,grantRevision:base.g.revision,activationId:base.g.activationId,checkedAt:final.readAt,validUntil,sourceRevision,...extra});
}
function mintOperational(tx,stage,base,period,initial,final,validUntil,options,control,extra={}){
 const pub=projection(base,period,final,validUntil,options.sourceRevision,extra.public);
 const guard=freeze({...base.scope,jobId:extra.job?.id??null,grantId:base.g.id,grantRevision:base.g.revision,activationId:base.g.activationId,lifecycleGeneration:base.f.generation,issueMonth:period.issueMonth,month:period.issueMonth,scheduledFor:period.scheduledFor,sourceRevision:options.sourceRevision,claimedSourceRevision:options.sourceRevision,validUntil,...extra.guard});
 return mint(tx,stage,{public:pub,guard,db:options.db,sourceRevision:options.sourceRevision,control,initial,base,period,job:extra.job??null,expiry:extra.expiry??null,attempt:extra.attempt??null,execution:extra.execution??null});
}
export async function authorizeMonthlyCaptureProducerInTransaction(tx,input,rawOptions){
 const request=fixedRequest(input,'grantId'),options=operationalOptions(rawOptions),control=processControl();
 const initial=await clock(tx,'PRODUCER');controlledAt(initial.readAt,control);await schema(tx);
 const hint=await grant(tx,request.grantId,'SOURCE'),base=await lockedAuthority(tx,hint,'PRODUCER',initial);
 const final=await clock(tx,'PRODUCER');controlledAt(final.readAt,control);
 const period=currentPeriod(final.readAt,base.g,control),validUntil=boundedUntil(initial,final,base.auth.ends);
 return mintOperational(tx,'PRODUCER',base,period,initial,final,validUntil,options,control);
}
export async function authorizeMonthlyCaptureLeaseClaimInTransaction(tx,input,rawOptions){
 const request=fixedRequest(input,'jobId'),options=operationalOptions(rawOptions),control=processControl();
 const initial=await clock(tx,'LEASE_CLAIM');controlledAt(initial.readAt,control);await schema(tx);
 const hint=await job(tx,request.jobId,'SOURCE'),gh=await grant(tx,hint.grantId,'SOURCE'),base=await lockedAuthority(tx,gh,'LEASE_CLAIM',initial);
 const j=await job(tx,request.jobId,'LEASE_CLAIM');
 if(JSON.stringify(j)!==JSON.stringify(hint))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 sameOrigin(j,base.g);
 const final=await clock(tx,'LEASE_CLAIM');controlledAt(final.readAt,control);
 const period=currentPeriod(final.readAt,base.g,control,j),validUntil=boundedUntil(initial,final,base.auth.ends);
 if(j.attempt>=60)fail('MONTHLY_CAPTURE_RETRY_LIMIT');
 if(!['PENDING','FAILED','LEASED'].includes(j.status))fail('MONTHLY_CAPTURE_JOB_NOT_CLAIMABLE');
 if(j.status==='LEASED'){
  if(!j.leaseExpiresAt||iso(j.leaseExpiresAt)>final.readAt)fail('MONTHLY_CAPTURE_JOB_NOT_CLAIMABLE');
 }else if(j.nextAttemptAt!==null&&iso(j.nextAttemptAt)>final.readAt)fail('MONTHLY_CAPTURE_RETRY_NOT_DUE');
 // The exclusive Grant row was acquired BEFORE any Job row, so this scan is
 // serialized across different periods of the same selected store.
 const competing=await tx.$queryRawUnsafe(`SELECT 1 FROM "MonthlyInventoryCaptureJob" WHERE "companyId"=$1 AND "storeId"=$2 AND "id"<>$3 AND "status"='LEASED' AND "leaseExpiresAt">clock_timestamp() LIMIT 1`,base.scope.companyId,base.scope.storeId,j.id);
 if(competing.length)fail('MONTHLY_CAPTURE_STORE_ALREADY_LEASED');
 return mintOperational(tx,'LEASE_CLAIM',base,period,initial,final,validUntil,options,control,{job:j,public:{jobId:j.id,status:j.status,attempt:j.attempt,attemptNumber:j.attempt,leaseTokenHash:j.leaseTokenHash,leaseExpiresAt:j.leaseExpiresAt===null?null:iso(j.leaseExpiresAt),claimedSourceRevision:j.claimedSourceRevision,nextAttemptAt:j.nextAttemptAt===null?null:iso(j.nextAttemptAt)},guard:{previousStatus:j.status,previousAttempt:j.attempt,previousLeaseTokenHash:j.leaseTokenHash,previousClaimedSourceRevision:j.claimedSourceRevision,previousLeaseExpiresAt:j.leaseExpiresAt===null?null:iso(j.leaseExpiresAt),attempt:j.attempt}});
}
async function background(tx,input,rawOptions,stage){
 const execution=normalizeMonthlyCaptureExecution(input),options=backgroundOptions(rawOptions);
 // Preserve transaction-mode refusal before schema work. A valid transaction
 // still needs a genuine claim-minted attempt; it is never minted here.
 const initial=await clock(tx,stage);
 const admitted=attemptData(options.db,execution,options.attempt);
 if(options.sourceRevision!==admitted.sourceRevision)fail('MONTHLY_CAPTURE_REVISION_CHANGED');
 const control=controlledAt(initial.readAt,admitted.control);
 await schema(tx);
 const hint=await job(tx,execution.jobId,'SOURCE'),gh=await grant(tx,hint.grantId,'SOURCE'),base=await lockedAuthority(tx,gh,stage,initial),j=await job(tx,execution.jobId,stage);
 if(JSON.stringify(j)!==JSON.stringify(hint))fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 sameOrigin(j,base.g);
 const digest=sha(execution.leaseToken);
 if(j.status!=='LEASED'||j.attempt!==admitted.attemptNumber||j.attempt<1||j.claimedSourceRevision!==options.sourceRevision||typeof j.leaseTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(j.leaseTokenHash)||!timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(j.leaseTokenHash,'hex')))fail('MONTHLY_CAPTURE_LEASE_INVALID');
 if(j.grantId!==admitted.grantId||j.grantRevision!==admitted.grantRevision||j.activationId!==admitted.activationId||j.lifecycleGeneration!==admitted.lifecycleGeneration||j.issueMonth!==admitted.issueMonth)fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 const final=await clock(tx,stage);controlledAt(final.readAt,control);
 if(final.transactionStartedAt!==initial.transactionStartedAt||final.readAt<initial.readAt)fail('MONTHLY_CAPTURE_TRANSACTION_INVALID');
 const period=currentPeriod(final.readAt,base.g,control,j);
 if(stage==='SOURCE'&&initial.transactionStartedAt<period.scheduledFor)fail('MONTHLY_CAPTURE_BEFORE_DUE');
 const expiry=iso(j.leaseExpiresAt);if(expiry>admitted.leaseExpiresAt)fail('MONTHLY_CAPTURE_LEASE_INVALID');
 const validUntil=boundedUntil(initial,final,base.auth.ends,expiry);
 const principal=freeze({type:'SERVICE_DELEGATION',purpose:PURPOSE,executor:EXECUTOR,delegatorUserId:base.current.id,delegatorSessionVersion:base.current.sessionVersion,grantId:base.g.id,grantRevision:base.g.revision,jobId:j.id,lifecycleGeneration:j.lifecycleGeneration,authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'});
 const context=mintOperational(tx,stage,base,period,initial,final,validUntil,options,control,{job:j,expiry,attempt:options.attempt,execution,public:stage==='SETTLEMENT'?{jobId:j.id,attempt:j.attempt,attemptNumber:j.attempt,leaseTokenHash:j.leaseTokenHash,leaseExpiresAt:expiry,claimedSourceRevision:j.claimedSourceRevision}:undefined,guard:{jobId:j.id,leaseTokenHash:j.leaseTokenHash,claimedSourceRevision:j.claimedSourceRevision,attempt:j.attempt,leaseExpiresAt:expiry}});
 const data=contexts.get(context);
 // Do not expose lease material on SOURCE/LOOKUP/WRITE public projections.
 if(stage!=='SETTLEMENT')data.public=freeze({...base.scope,month:j.issueMonth,lifecycleGeneration:j.lifecycleGeneration,store:base.auth.store,principal:stage==='WRITE'?principal:null,checkedAt:final.readAt,validUntil});
 return context;
}
export const authorizeMonthlyCaptureSourceInTransaction=(tx,input,options)=>background(tx,input,options,'SOURCE');
export const authorizeMonthlyCaptureLookupInTransaction=(tx,input,options)=>background(tx,input,options,'LOOKUP');
export const authorizeMonthlyCaptureWriteInTransaction=(tx,input,options)=>background(tx,input,options,'WRITE');
export const authorizeMonthlyCaptureSettlementInTransaction=(tx,input,options)=>background(tx,input,options,'SETTLEMENT');
function transitionInput(raw){
 const value=copy(raw,['status','holdReason','nextAttemptAt']);
 if(!['SUCCEEDED','FAILED','HOLD'].includes(value.status)||!(value.holdReason===null||reasons.has(value.holdReason))||!(value.nextAttemptAt===null||stamp(value.nextAttemptAt)))fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
 if(value.status==='SUCCEEDED'&&(value.holdReason!==null||value.nextAttemptAt!==null)||value.status==='HOLD'&&(!reasons.has(value.holdReason)||value.nextAttemptAt!==null)||value.status==='FAILED'&&value.holdReason!=='RETRY_LIMIT'&&(!stamp(value.nextAttemptAt)||value.holdReason!==null&&value.holdReason!=='SOURCE_UNAVAILABLE')||value.status==='FAILED'&&value.holdReason==='RETRY_LIMIT'&&value.nextAttemptAt!==null)fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
 return value;
}
async function finalMutation(tx,d,transition){
 if(runtimeRevision()!==d.sourceRevision)fail('MONTHLY_CAPTURE_REVISION_CHANGED');
 if(d.attempt)attemptData(d.db,d.execution,d.attempt);else processControl(d.control);
 // This is the LAST DB query. The row locks acquired at admission protect
 // current user/company/store/module/access/Fence/Grant throughout the callback.
 const rows=await tx.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt",g."revision"::text AS revision,g."active",g."activationId",g."lifecycleGeneration"::text AS generation,g."delegatorUserId",g."delegatorSessionVersion",u."sessionVersion",u."role"::text AS role,u."companyId" AS "userCompanyId",u."mustChangePassword",j."status",j."attempt",j."leaseTokenHash",j."leaseExpiresAt",j."claimedSourceRevision",j."holdReason",j."nextAttemptAt",j."updatedAt",j."grantId",j."grantRevision"::text AS "grantRevision",j."activationId" AS "jobActivationId",j."lifecycleGeneration"::text AS "jobGeneration",j."issueMonth",j."scheduledFor",EXISTS(SELECT 1 FROM "MonthlyInventorySnapshot" s WHERE s."companyId"=$2 AND s."storeId"=$3 AND s."lifecycleGeneration"=$4::bigint AND s."issueMonth"=$5) AS snapshot FROM "MonthlyInventoryCaptureGrant" g JOIN "User" u ON u."id"=g."delegatorUserId" LEFT JOIN "MonthlyInventoryCaptureJob" j ON j."id"=$6 WHERE g."id"=$1 AND g."companyId"=$2 AND g."storeId"=$3`,d.base.g.id,d.base.scope.companyId,d.base.scope.storeId,d.base.f.generation,d.period.issueMonth,d.job?.id??null);
 if(runtimeRevision()!==d.sourceRevision)fail('MONTHLY_CAPTURE_REVISION_CHANGED');
 if(d.attempt)attemptData(d.db,d.execution,d.attempt);else processControl(d.control);
 const r=rows[0];
 if(rows.length!==1||!stamp(r.readAt)||r.readAt<d.public.checkedAt||r.readAt>=d.public.validUntil||d.expiry&&r.readAt>=d.expiry)fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');
 controlledAt(r.readAt,d.control);
 if(r.revision!==d.base.g.revision||r.active!==true||r.activationId!==d.base.g.activationId||r.generation!==d.base.f.generation||r.delegatorUserId!==d.base.current.id||r.delegatorSessionVersion!==d.base.current.sessionVersion||r.sessionVersion!==d.base.current.sessionVersion||r.role!==d.base.current.role||r.userCompanyId!==d.base.current.companyId||r.mustChangePassword!==false)fail('MONTHLY_CAPTURE_DELEGATION_STALE');
 const period=currentPeriod(r.readAt,d.base.g,d.control,d.job?{issueMonth:d.period.issueMonth,scheduledFor:d.period.scheduledFor}:undefined);
 if(period.issueMonth!==d.period.issueMonth)fail('MONTHLY_CAPTURE_NOT_LATEST_DUE');
 if(d.job){
  if(r.grantId!==d.base.g.id||r.grantRevision!==d.base.g.revision||r.jobActivationId!==d.base.g.activationId||r.jobGeneration!==d.base.f.generation||r.issueMonth!==d.period.issueMonth||iso(r.scheduledFor)!==d.period.scheduledFor)fail('MONTHLY_CAPTURE_DELEGATION_STALE');
  if(d.stage==='LEASE_CLAIM'){
   if(r.status!=='LEASED'||r.attempt!==d.job.attempt+1||r.leaseTokenHash!==d.sealedTokenHash||r.claimedSourceRevision!==d.sourceRevision||iso(r.leaseExpiresAt)<=r.readAt||iso(r.leaseExpiresAt)>fromMs(Date.parse(r.readAt)+120000)||iso(r.updatedAt)>r.readAt)fail('MONTHLY_CAPTURE_LEASE_INVALID');
  }else if(d.stage==='SETTLEMENT'){
   if(r.status!==transition.status||r.attempt!==d.job.attempt||r.leaseTokenHash!==null||r.leaseExpiresAt!==null||r.claimedSourceRevision!==null||r.holdReason!==transition.holdReason||(r.nextAttemptAt===null?null:iso(r.nextAttemptAt))!==transition.nextAttemptAt)fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
   if(transition.status==='SUCCEEDED'&&!r.snapshot)fail('MONTHLY_CAPTURE_SNAPSHOT_UNAVAILABLE');
   if(transition.status==='FAILED'&&transition.nextAttemptAt!==null&&(transition.nextAttemptAt<=r.readAt||Date.parse(transition.nextAttemptAt)>Date.parse(r.readAt)+900000))fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
   if(transition.status==='FAILED'&&transition.holdReason==='RETRY_LIMIT'&&r.attempt!==60)fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
  }else if(r.status!=='LEASED'||r.attempt!==d.job.attempt||r.leaseTokenHash!==d.job.leaseTokenHash||r.claimedSourceRevision!==d.sourceRevision||iso(r.leaseExpiresAt)<=r.readAt)fail('MONTHLY_CAPTURE_LEASE_INVALID');
 }
 return r;
}
export async function finishMonthlyCaptureMutationInTransaction(tx,context,rawTransition){
 const d=contexts.get(context);
 if(!d||d.tx!==tx||!['PRODUCER','LEASE_CLAIM','LOOKUP','WRITE','SETTLEMENT'].includes(d.stage))fail('MONTHLY_CAPTURE_CONTEXT_INVALID');
 if(d.stage==='LEASE_CLAIM'&&!d.sealedTokenHash)fail('MONTHLY_CAPTURE_CLAIM_NOT_SEALED');
 const transition=d.stage==='SETTLEMENT'?transitionInput(rawTransition):null;
 if(d.stage!=='SETTLEMENT'&&rawTransition!==undefined)fail('MONTHLY_CAPTURE_TRANSITION_INVALID');
 await finalMutation(tx,d,transition);
}
export async function sealMonthlyCaptureClaimInTransaction(tx,context,input){
 const d=contextData(tx,context,'LEASE_CLAIM'),execution=normalizeMonthlyCaptureExecution(input);
 if(execution.jobId!==d.job.id||d.sealedTokenHash)fail('MONTHLY_CAPTURE_LEASE_INVALID');
 d.sealedTokenHash=sha(execution.leaseToken);
 const row=await finalMutation(tx,d,null);
 const attempt=Object.freeze({});
 const publicProjection=freeze({...d.base.scope,jobId:d.job.id,month:d.period.issueMonth,lifecycleGeneration:d.base.f.generation,attemptNumber:row.attempt,sourceRevision:d.sourceRevision});
 attempts.set(attempt,{db:d.db,execution,sourceRevision:d.sourceRevision,control:d.control,grantId:d.base.g.id,grantRevision:d.base.g.revision,activationId:d.base.g.activationId,lifecycleGeneration:d.base.f.generation,issueMonth:d.period.issueMonth,attemptNumber:row.attempt,leaseExpiresAt:iso(row.leaseExpiresAt),invalidated:false,public:publicProjection});
 return attempt;
}
export async function finishMonthlyCaptureSourceInTransaction(tx,context){
 const d=contextData(tx,context,'SOURCE'),pub=d.public;
 attemptData(d.db,d.execution,d.attempt);
 const now=await clock(tx,'SOURCE');
 attemptData(d.db,d.execution,d.attempt);
 if(now.transactionStartedAt!==d.initial.transactionStartedAt||now.readAt<pub.checkedAt||now.readAt>=d.expiry||now.readAt>=pub.validUntil)fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');
 controlledAt(now.readAt,d.control);currentPeriod(now.readAt,d.base.g,d.control,d.job);
 return freeze({transactionStartedAt:now.transactionStartedAt,readFinishedAt:now.readAt});
}

export async function authorizeMonthlyCaptureGrantManagementInTransaction(tx,input,rawScope){
 const actor=actorCopy(input),scope=freeze(copy(rawScope,['companyId','storeId']));if(!text(scope.companyId)||!text(scope.storeId))fail('MONTHLY_CAPTURE_INPUT_INVALID');const initial=await clock(tx,'MANAGEMENT');await schema(tx);const hint=await user(tx,actor.id,'SOURCE');await locks(tx);const auth=await authority(tx,hint,scope,'MANAGEMENT',initial.readAt,actor),current=await user(tx,actor.id,'MANAGEMENT');if(JSON.stringify(current)!==JSON.stringify(hint)||current.sessionVersion!==actor.sessionVersion)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');
 const sessions=await tx.$queryRawUnsafe(`SELECT "id","userId","expiresAt","revokedAt" FROM "UserSession" WHERE "id"=$1 FOR SHARE NOWAIT`,actor.sessionId);if(sessions.length!==1||sessions[0].userId!==current.id||sessions[0].revokedAt!==null)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');const expiry=iso(sessions[0].expiresAt),f=await fence(tx,scope,'MANAGEMENT'),final=await clock(tx,'MANAGEMENT');if(final.transactionStartedAt!==initial.transactionStartedAt||final.readAt<initial.readAt)fail('MONTHLY_CAPTURE_TRANSACTION_INVALID');if(expiry<=final.readAt||auth.ends.some(end=>end<final.readAt))fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');return mint(tx,'MANAGEMENT',{public:freeze({...scope,lifecycleGeneration:f.generation,actorId:current.id,sessionVersion:current.sessionVersion,store:auth.store,checkedAt:final.readAt,validUntil:[expiry,...auth.ends].sort()[0]})});
}

// Personal capture-now has its own opaque authority. It never grants a leased
// job, changes the process control, or carries source authority into a writer.
const personalNowContexts=new WeakMap();
export const normalizeMonthlyPersonalCaptureNowActor=input=>actorCopy(input);
export function normalizeMonthlyPersonalCaptureNowInput(raw,complete=false){
 const selected=copy(raw,['storeId','lifecycleGeneration','expectedIssueMonth'],complete?['storeId','lifecycleGeneration','expectedIssueMonth']:['storeId']);
 if(!text(selected.storeId)||selected.lifecycleGeneration!==undefined&&!integer(selected.lifecycleGeneration)||selected.expectedIssueMonth!==undefined&&(typeof selected.expectedIssueMonth!=='string'||selected.expectedIssueMonth.length!==7||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(selected.expectedIssueMonth)))fail('MONTHLY_CAPTURE_INPUT_INVALID');
 return freeze(selected);
}
async function personalNowAdmission(tx,input,raw,stage){
 const actor=actorCopy(input),selected=normalizeMonthlyPersonalCaptureNowInput(raw,stage!=='LOOKUP');
 const initial=await clock(tx,stage==='SOURCE'?'SOURCE':'MANAGEMENT');await schema(tx);
 const hint=await user(tx,actor.id,'SOURCE');if(stage!=='SOURCE')await locks(tx);
 const auth=await authority(tx,hint,{companyId:actor.companyId,storeId:selected.storeId},stage==='SOURCE'?'SOURCE':'MANAGEMENT',initial.readAt,actor);
 const current=await user(tx,actor.id,stage==='SOURCE'?'SOURCE':'MANAGEMENT');
 if(JSON.stringify(current)!==JSON.stringify(hint)||current.sessionVersion!==actor.sessionVersion)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');
 const sessions=await tx.$queryRawUnsafe(`SELECT "id","userId","expiresAt","revokedAt" FROM "UserSession" WHERE "id"=$1${rowLock(stage==='SOURCE'?'SOURCE':'MANAGEMENT')}`,actor.sessionId);
 if(sessions.length!==1||sessions[0].userId!==current.id||sessions[0].revokedAt!==null)fail('MONTHLY_CAPTURE_AUTHORITY_DENIED');
 const scope={companyId:actor.companyId,storeId:selected.storeId},f=await fence(tx,scope,stage==='SOURCE'?'SOURCE':'MANAGEMENT'),period=monthlyCaptureLatestDuePeriod(initial.readAt);
 if(selected.lifecycleGeneration!==undefined&&selected.lifecycleGeneration!==f.generation)fail('MONTHLY_CAPTURE_GENERATION_STALE');
 if(selected.expectedIssueMonth!==undefined&&selected.expectedIssueMonth!==period.issueMonth)fail('MONTHLY_CAPTURE_PERIOD_STALE');
 const context=Object.freeze({}),data={tx,stage,actor,selected,scope:{...scope,lifecycleGeneration:f.generation,issueMonth:period.issueMonth,scheduledFor:period.scheduledFor,checkedAt:initial.readAt},startedAt:initial.transactionStartedAt,validUntil:[iso(sessions[0].expiresAt),...auth.ends].sort()[0]};
 personalNowContexts.set(context,data);await finishMonthlyPersonalCaptureNowInTransaction(tx,context);return context;
}
export const authorizeMonthlyPersonalCaptureNowLookupInTransaction=(tx,actor,input)=>personalNowAdmission(tx,actor,input,'LOOKUP');
export const authorizeMonthlyPersonalCaptureNowSourceInTransaction=(tx,actor,input)=>personalNowAdmission(tx,actor,input,'SOURCE');
export const authorizeMonthlyPersonalCaptureNowWriteInTransaction=(tx,actor,input)=>personalNowAdmission(tx,actor,input,'WRITE');
export function requireMonthlyPersonalCaptureNowContext(tx,context,stage){
 const data=personalNowContexts.get(context);if(!data||data.tx!==tx||data.stage!==stage)fail('MONTHLY_CAPTURE_CONTEXT_INVALID');return freeze({...data.scope});
}
export async function finishMonthlyPersonalCaptureNowInTransaction(tx,context){
 const data=personalNowContexts.get(context);if(!data||data.tx!==tx)fail('MONTHLY_CAPTURE_CONTEXT_INVALID');
 // The final statement uses the real DB clock after every wait/readback. Writer
 // row/table locks retain the admitted session, module and fence until commit.
 const [last]=await tx.$queryRawUnsafe(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt",EXISTS(SELECT 1 FROM "UserSession" s JOIN "User" u ON u."id"=s."userId" WHERE s."id"=$1 AND s."userId"=$2 AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND u."sessionVersion"=$3 AND u."mustChangePassword"=FALSE) AS valid`,data.actor.sessionId,data.actor.id,data.actor.sessionVersion);
 if(last?.valid!==true||!stamp(last.readAt)||last.readAt<data.scope.checkedAt||Date.parse(last.readAt)-Date.parse(data.startedAt)>30000||last.readAt>=data.validUntil)fail('MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED');
 if(monthlyCaptureLatestDuePeriod(last.readAt).issueMonth!==data.scope.issueMonth)fail('MONTHLY_CAPTURE_PERIOD_STALE');
 return freeze({...data.scope,checkedAt:last.readAt});
}
