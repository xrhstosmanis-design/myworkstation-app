// Internal storage of supplied, format-validated facts only. No route,
// capture coordinator, enrollment, bootstrap, scheduler or automatic caller.
import {randomUUID,createHash} from 'node:crypto';
import {verifyMonthlyInventorySnapshotCandidateText} from './monthly-inventory-snapshot-payload.js';
import {authorizeMonthlyInvoiceAuditInTransaction} from './monthly-invoice-audit.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {validateMonthlyInventorySnapshotSchema} from './monthly-inventory-snapshot-schema.js';

const fail=code=>{throw Object.assign(new Error(code),{code,status:409})};
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const fields=['transactionStartedAt','sourceReadStartedAt','sourceReadFinishedAt'];
const stamp=value=>typeof value==='string'&&value.length===24&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function request(input){
 if(!plain(input)||Reflect.ownKeys(input).some(key=>typeof key!=='string'||!['candidateJsonText',...fields].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value')))fail('MONTHLY_SNAPSHOT_INPUT_INVALID');
 const candidate=verifyMonthlyInventorySnapshotCandidateText(input.candidateJsonText);
 for(const key of fields)if(!stamp(input[key]))fail('MONTHLY_SNAPSHOT_OBSERVATION_INVALID');
 validateInterval(candidate,input);
 return {candidate,candidateJsonText:input.candidateJsonText,...Object.fromEntries(fields.map(key=>[key,input[key]]))};
}
function validateInterval(candidate,input){
 const start=Date.parse(input.transactionStartedAt),read=Date.parse(input.sourceReadStartedAt),finish=Date.parse(input.sourceReadFinishedAt);
 if(!fields.every(key=>stamp(input[key]))||start<Date.parse(candidate.period.scheduledFor)||start>read||read>finish||finish-start>30000||input.sourceReadFinishedAt!==candidate.period.sourceObservedAt)fail('MONTHLY_SNAPSHOT_OBSERVATION_INVALID');
}
const select=`SELECT "id","companyId","storeId","lifecycleGeneration"::text AS "lifecycleGeneration","issueMonth",${['scheduledFor',...fields,'sourceObservedAt'].map(key=>`to_char("${key}" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "${key}"`).join(',')},to_char("storedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "storedAt","observationStatus","delayMs"::text AS "delayMs","sourceRevision","formatVersion","valuationBasis","sourceHash","payloadHash","candidateJsonText","storedBytesSha256","sourceCoverage","capturePrincipal" FROM "MonthlyInventorySnapshot" WHERE "companyId"=$1 AND "storeId"=$2 AND "lifecycleGeneration"=$3::bigint AND "issueMonth"=$4`;
const identity=c=>[c.companyId,c.storeId,c.lifecycleGeneration,c.period.issueMonth];
function verifiedReceipt(row,expectedScope,status){
 if(!row||typeof row.candidateJsonText!=='string')fail('MONTHLY_SNAPSHOT_STORED_INVALID');
 // D1 source instants have exact millisecond precision. Inspect SQL's full
 // microseconds first, so readback cannot hide a changed sub-millisecond fact.
 row={...row};for(const key of ['scheduledFor',...fields,'sourceObservedAt']){
  if(typeof row[key]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}000Z$/.test(row[key]))fail('MONTHLY_SNAPSHOT_STORED_INVALID');
  row[key]=row[key].slice(0,23)+'Z';
 }
 let candidate;try{candidate=verifyMonthlyInventorySnapshotCandidateText(row.candidateJsonText);validateInterval(candidate,row)}catch{fail('MONTHLY_SNAPSHOT_STORED_INVALID')}
 if(identity(candidate).some((value,index)=>value!==expectedScope[index])||row.companyId!==candidate.companyId||row.storeId!==candidate.storeId||row.lifecycleGeneration!==candidate.lifecycleGeneration||row.issueMonth!==candidate.period.issueMonth||row.scheduledFor!==candidate.period.scheduledFor||row.sourceObservedAt!==candidate.period.sourceObservedAt||row.observationStatus!==candidate.period.timing||row.delayMs!==String(candidate.period.delayMs)||row.sourceRevision!==candidate.sourceRevision||row.formatVersion!==candidate.schemaVersion||row.valuationBasis!==candidate.valuationBasis||row.sourceHash!==candidate.sourceHash||row.payloadHash!==candidate.payloadHash||row.storedBytesSha256!==sha(row.candidateJsonText))fail('MONTHLY_SNAPSHOT_STORED_INVALID');
 if(typeof row.id!=='string'||!/^[a-f0-9-]{36}$/.test(row.id)||typeof row.storedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(row.storedAt)||!Number.isFinite(Date.parse(row.storedAt))||Date.parse(row.storedAt)<Date.parse(row.sourceReadFinishedAt))fail('MONTHLY_SNAPSHOT_STORED_INVALID');
 const coverage=row.sourceCoverage,principal=row.capturePrincipal;
 if(!plain(coverage)||Object.keys(coverage).sort().join(',')!=='complete,invoiceCount,pendingOriginalCount,productCount'||Object.entries(candidate.coverage).some(([key,value])=>coverage[key]!==value))fail('MONTHLY_SNAPSHOT_STORED_INVALID');
 if(!plain(principal)||Object.keys(principal).sort().join(',')!=='authorizationBasis,sourceBasis,type,userId'||principal.type!=='BACKOFFICE_USER'||principal.authorizationBasis!=='RECHECKED_IN_FRESH_WRITE_TRANSACTION'||principal.sourceBasis!=='SUPPLIED_FORMAT_VALIDATED_FACTS'||typeof principal.userId!=='string'||!principal.userId||principal.userId.length>160||Buffer.byteLength(principal.userId)>160||/[\u0000-\u001f\u007f]/.test(principal.userId))fail('MONTHLY_SNAPSHOT_STORED_INVALID');
 return Object.freeze({status,receiptBasis:'FORMAT_VALIDATED_STORED_ONLY',sourceAuthenticityVerified:false,id:row.id,companyId:row.companyId,storeId:row.storeId,lifecycleGeneration:row.lifecycleGeneration,issueMonth:row.issueMonth,scheduledFor:row.scheduledFor,transactionStartedAt:row.transactionStartedAt,sourceReadStartedAt:row.sourceReadStartedAt,sourceReadFinishedAt:row.sourceReadFinishedAt,sourceObservedAt:row.sourceObservedAt,storedAt:row.storedAt,sourceHash:row.sourceHash,payloadHash:row.payloadHash,storedBytesSha256:row.storedBytesSha256,candidateJsonText:row.candidateJsonText});
}
async function clock(tx){
 const [row]=await tx.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "writeAt"`);
 if(row?.readOnly!=='off'||row.isolation!=='read committed'||!stamp(row.writeAt))fail('MONTHLY_SNAPSHOT_FRESH_WRITE_REQUIRED');return row.writeAt;
}

export function createMonthlyInventorySnapshotRepository(db){
 return Object.freeze({async store(actor,input){
  const supplied=request(input),{candidate}=supplied,key=identity(candidate);
  if(actor?.companyId!==candidate.companyId)fail('MONTHLY_SNAPSHOT_SCOPE_INVALID');
  return db.$transaction(async tx=>{
   await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
   const writeAt=await clock(tx);
   await authorizeMonthlyInvoiceAuditInTransaction(tx,actor,candidate.storeId,new Date(writeAt));
   const state=await assertLifecycleMutation(tx,{companyId:candidate.companyId,storeId:candidate.storeId},candidate.lifecycleGeneration,{lock:true});
   if(!state.enrolled)fail('MONTHLY_SNAPSHOT_ENROLLMENT_REQUIRED');
   await validateMonthlyInventorySnapshotSchema(tx);
   const existing=(await tx.$queryRawUnsafe(select,...key))[0];
   // A verified old success does not expire, but cannot escape fresh current
   // authorization and exact enrolled generation checks above.
   if(existing)return verifiedReceipt(existing,key,'ALREADY_CAPTURED');
   const beforeInsert=await clock(tx),age=Date.parse(beforeInsert)-Date.parse(supplied.sourceReadFinishedAt);
   if(age<0||age>30000)fail('MONTHLY_SNAPSHOT_SOURCE_STALE');
   const principal={type:'BACKOFFICE_USER',userId:actor.id,authorizationBasis:'RECHECKED_IN_FRESH_WRITE_TRANSACTION',sourceBasis:'SUPPLIED_FORMAT_VALIDATED_FACTS'};
   const inserted=await tx.$queryRawUnsafe(`INSERT INTO "MonthlyInventorySnapshot" ("id","companyId","storeId","lifecycleGeneration","issueMonth","scheduledFor","transactionStartedAt","sourceReadStartedAt","sourceReadFinishedAt","sourceObservedAt","observationStatus","delayMs","sourceRevision","formatVersion","valuationBasis","sourceHash","payloadHash","candidateJsonText","storedBytesSha256","sourceCoverage","capturePrincipal") VALUES ($1,$2,$3,$4::bigint,$5,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12::bigint,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb) ON CONFLICT ("companyId","storeId","lifecycleGeneration","issueMonth") DO NOTHING RETURNING "id"`,randomUUID(),...key,candidate.period.scheduledFor,...fields.map(name=>supplied[name]),candidate.period.sourceObservedAt,candidate.period.timing,String(candidate.period.delayMs),candidate.sourceRevision,candidate.schemaVersion,candidate.valuationBasis,candidate.sourceHash,candidate.payloadHash,supplied.candidateJsonText,sha(supplied.candidateJsonText),JSON.stringify(candidate.coverage),JSON.stringify(principal));
   const stored=(await tx.$queryRawUnsafe(select,...key))[0];
   return verifiedReceipt(stored,key,inserted.length?'STORED':'ALREADY_CAPTURED');
  },{isolationLevel:'ReadCommitted',maxWait:2000,timeout:30000});
 }});
}
