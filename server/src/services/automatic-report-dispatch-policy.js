import {z} from 'zod';
import {createHash} from 'node:crypto';
import {lifecycleContext} from './store-lifecycle-context.js';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';
import {createRecipientManagement,snapshotDispatchInput} from './automatic-report-recipients.js';
import {createAutomaticReportInvitations} from './automatic-report-invitations.js';
import {ADMINISTRATOR_AUTHORITY_PREFIX,administratorRecipientSchema,authorizeAdministratorRecipient,reportRecipientAuthority} from './automatic-report-administrator-authorization.js';
const fail=(status,code,message='Η ενέργεια αναφοράς δεν ολοκληρώθηκε.')=>{throw Object.assign(new Error(message),{status,code})};
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)&&!(x instanceof Date)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):typeof x==='bigint'?x.toString():x);
const hash=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const freq=v=>{if(!Array.isArray(v)||v.length>3||new Set(v).size!==v.length||v.some(x=>!['DAILY','WEEKLY','MONTHLY'].includes(x)))fail(400,'REPORT_FREQUENCIES_INVALID');return [...v].sort()};
const expected=(actual,value)=>{if(!Number.isSafeInteger(value)||value<0||String(actual||0)!==String(value))fail(409,'REPORT_REVISION_CHANGED')};
const next=v=>{const n=BigInt(v||0)+1n;if(n>9007199254740991n)fail(409,'REPORT_REVISION_EXHAUSTED');return n};
const tables=['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'];
export async function dispatchSchemaReady(tx){const rows=await tx.$queryRawUnsafe(`SELECT ${tables.map((name,i)=>`to_regclass(format('%I.%I',current_schema(),'${name}'))::text AS t${i}`).join(',')}`);const count=rows[0]?tables.filter((_x,i)=>!!rows[0]['t'+i]).length:0;if(count!==0&&count!==6)fail(409,'REPORT_DISPATCH_SCHEMA_REQUIRED');return count===6}
const columns={policy:'*,"revision"::text AS "revision","lifecycleGeneration"::text AS "lifecycleGeneration"',grant:'*,"revision"::text AS "revision","lifecycleGeneration"::text AS "lifecycleGeneration"'};
export async function readLockedDispatchAuthorization(tx,{companyId,storeId}){
 const policy=(await tx.$queryRawUnsafe(`SELECT ${columns.policy} FROM "AutomaticReportDispatchPolicy" WHERE "companyId"=$1 AND "storeId"=$2 AND "reportType"='CASH' FOR SHARE NOWAIT`,companyId,storeId))[0]||null;
 const grant=(await tx.$queryRawUnsafe(`SELECT ${columns.grant} FROM "AutomaticReportAutomationGrant" WHERE "companyId"=$1 AND "storeId"=$2 AND "reportType"='CASH' FOR SHARE NOWAIT`,companyId,storeId))[0]||null;
 const recipients=await tx.$queryRaw`SELECT *,"version"::text AS "version" FROM "AutomaticReportRecipient" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "revokedAt" IS NULL ORDER BY "recipientId" FOR SHARE NOWAIT`;
 if(recipients.length>5)fail(409,'REPORT_RECIPIENT_LIMIT');
 const consents=await tx.$queryRaw`SELECT *,"revision"::text AS "revision","recipientVersion"::text AS "recipientVersion","lifecycleGeneration"::text AS "lifecycleGeneration" FROM "AutomaticReportRecipientConsent" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "recipientId" FOR SHARE NOWAIT`;
 return {policy,grant,recipients:recipients.map(recipient=>({recipient,consent:consents.find(c=>c.recipientId===recipient.recipientId)||null}))};
}
export function dispatchPolicyFingerprint({policy,grant,recipient}){return hash({format:'MWS_AUTOMATIC_REPORT_AUTH_V1',policy:{revision:String(policy.revision),dispatchEnabled:policy.dispatchEnabled,allowsProvisional:policy.allowsProvisional,allowedFrequencies:[...policy.allowedFrequencies].sort(),lifecycleGeneration:String(policy.lifecycleGeneration)},grant:{revision:String(grant.revision),active:grant.active,principalId:grant.principalId,principalSessionVersion:grant.principalSessionVersion,allowedFrequencies:[...grant.allowedFrequencies].sort(),lifecycleGeneration:String(grant.lifecycleGeneration),activationEpoch:grant.activationEpoch,activationFingerprint:grant.activationFingerprint,notBefore:new Date(grant.notBefore).toISOString(),createdAt:new Date(grant.createdAt).toISOString(),grantedAt:new Date(grant.grantedAt).toISOString()},recipientId:recipient.recipientId})}
function payloadMetadata({companyId,storeId,payload},generation){
 if(payload?.scope?.companyId!==companyId||payload?.scope?.storeId!==storeId||typeof payload.body!=='string'||payload.contentType!=='application/json; charset=utf-8'||!['DAILY','WEEKLY','MONTHLY'].includes(payload.frequency))fail(400,'REPORT_PAYLOAD_INVALID');
 const bytes=Buffer.from(payload.body,'utf8');if(bytes.length<1||bytes.length>2097152||payload.byteLength!==bytes.length||hash(payload.body)!==payload.payloadFingerprint)fail(400,'REPORT_PAYLOAD_INVALID');
 let body;try{body=JSON.parse(payload.body)}catch{fail(400,'REPORT_PAYLOAD_INVALID')}
 if(body.scope?.companyId!==companyId||body.scope?.storeId!==storeId||body.settingsVersion<1||body.frequency!==payload.frequency||body.sourceFingerprint!==payload.sourceFingerprint||body.period?.from!==payload.period?.from||body.period?.to!==payload.period?.to)fail(400,'REPORT_PAYLOAD_INVALID');
 if(typeof generation!=='string'||!/^(0|[1-9]\d{0,18})$/.test(generation)||BigInt(generation)>9223372036854775807n||!Number.isSafeInteger(body.settingsVersion)||body.financialFinality!=='PROVISIONAL'||body.financialReconciliationComplete!==false||body.employeeLiabilityAdjusted!==false)fail(400,'REPORT_PAYLOAD_INVALID');
 return {bytes,body,generation,payloadId:hash(['MWS_REPORT_PAYLOAD_V1',companyId,storeId,payload.frequency,payload.period.from,payload.period.to,payload.payloadFingerprint])};
}
export async function putImmutablePayload(tx,args){
 const {companyId,storeId,payload,now}=args,{bytes,body,generation,payloadId}=payloadMetadata(args,args.lifecycleGeneration);
 const inserted=await tx.$queryRaw`INSERT INTO "AutomaticReportPayload" ("payloadId","companyId","storeId","frequency","periodFrom","periodTo","settingsVersion","lifecycleGeneration","sourceFingerprint","payloadFingerprint","contentType","bytes","byteLength","createdAt") VALUES (${payloadId},${companyId},${storeId},${payload.frequency},${new Date(payload.period.from)},${new Date(payload.period.to)},${BigInt(body.settingsVersion)},${BigInt(generation)},${payload.sourceFingerprint},${payload.payloadFingerprint},${payload.contentType},${bytes},${bytes.length},${new Date(now)}) ON CONFLICT ("payloadId") DO NOTHING RETURNING "payloadId"`;
 const persisted=await readImmutablePayload(tx,{companyId,storeId,payloadId,lifecycleGeneration:generation,now});if(!persisted||persisted.body!==payload.body||persisted.sourceFingerprint!==payload.sourceFingerprint||persisted.byteLength!==payload.byteLength)fail(409,'REPORT_PAYLOAD_CONFLICT');return {created:inserted.length===1,payloadId,payload:persisted};
}
export async function readImmutablePayload(tx,s){
 const rows=s.payloadId?await tx.$queryRaw`SELECT * FROM "AutomaticReportPayload" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "payloadId"=${s.payloadId} FOR SHARE NOWAIT`:await tx.$queryRaw`SELECT * FROM "AutomaticReportPayload" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "frequency"=${s.frequency} AND "periodFrom"=${new Date(s.periodFrom)} AND "periodTo"=${new Date(s.periodTo)} AND "payloadFingerprint"=${s.payloadFingerprint} FOR SHARE NOWAIT`;
 if(!rows.length)return null;if(rows.length!==1)fail(409,'REPORT_PAYLOAD_CORRUPT');const r=rows[0];if(s.lifecycleGeneration!==undefined&&String(r.lifecycleGeneration)!==s.lifecycleGeneration)fail(409,'REPORT_PAYLOAD_LIFECYCLE_CHANGED');if(r.expiresAt&&(!s.now||new Date(s.now)>=new Date(r.expiresAt)))fail(409,'REPORT_PAYLOAD_EXPIRED');const body=Buffer.from(r.bytes).toString('utf8');let content;try{content=JSON.parse(body)}catch{fail(409,'REPORT_PAYLOAD_CORRUPT')}
 const payload={format:content.format,scope:{companyId:r.companyId,storeId:r.storeId},frequency:r.frequency,period:content.period,sourceFingerprint:r.sourceFingerprint,payloadFingerprint:r.payloadFingerprint,financialFinality:content.financialFinality,financialLimitations:content.financialLimitations,contentType:r.contentType,body,byteLength:r.byteLength};
 const checked=payloadMetadata({...s,payload},String(r.lifecycleGeneration));if(checked.payloadId!==r.payloadId||String(content.settingsVersion)!==String(r.settingsVersion)||new Date(content.period.from).getTime()!==new Date(r.periodFrom).getTime()||new Date(content.period.to).getTime()!==new Date(r.periodTo).getTime())fail(409,'REPORT_PAYLOAD_CORRUPT');return Object.freeze(payload);
}
const publicRecord=r=>{if(!r)return null;const output={};for(const [k,v]of Object.entries(r))if(!k.startsWith('challenge')&&k!=='proofHash'){output[k]=typeof v==='bigint'?Number(v):['revision','version','recipientVersion'].includes(k)?Number(v):v instanceof Date?v.toISOString():v}return output};
export function createAutomaticReportManagement({db,activationProvider,sendVerification,clock=()=>new Date()}){
 if(!db||typeof db.$transaction!=='function'||typeof activationProvider!=='function'||typeof sendVerification!=='function')throw new TypeError('Invalid automatic report management dependencies');
 function transaction(scope,work,write=true){
  scope=snapshotDispatchInput(scope);
  const s={actorId:scope?.actorId,companyId:scope?.companyId,storeId:scope?.storeId};if(Object.values(s).some(x=>typeof x!=='string'||!x.trim()||/[\u0000-\u001f]/.test(x)))fail(400,'REPORT_SCOPE_INVALID');
  const generation=lifecycleContext()[s.storeId],now=new Date(clock());if(!Number.isFinite(now.getTime()))fail(400,'REPORT_CLOCK_INVALID');
  return db.$transaction(async tx=>{
   const actor=await tx.user.findUnique({where:{id:s.actorId},select:{id:true,role:true,sessionVersion:true}});if(actor?.role!=='SUPER_ADMIN')fail(403,'REPORT_SUPER_ADMIN_REQUIRED');
   const ready=await dispatchSchemaReady(tx);
   const state=ready?await lockAutomaticReportBoundary(tx,{companyId:s.companyId,storeId:s.storeId,expectedGeneration:generation}):null;
   const rows=write?await tx.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "id"=${s.storeId} AND "companyId"=${s.companyId} AND "active"=true FOR NO KEY UPDATE NOWAIT`:await tx.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "id"=${s.storeId} AND "companyId"=${s.companyId} AND "active"=true FOR SHARE NOWAIT`;
   if(!rows.length)fail(404,'REPORT_STORE_NOT_FOUND');
   const [lockedActor]=await tx.$queryRaw`SELECT "id","role","sessionVersion" FROM "User" WHERE "id"=${s.actorId} FOR SHARE NOWAIT`;
   if(!lockedActor||lockedActor.role!=='SUPER_ADMIN'||lockedActor.sessionVersion!==actor.sessionVersion)fail(403,'REPORT_SUPER_ADMIN_REQUIRED');
   if(!ready){if(write)fail(409,'REPORT_DISPATCH_SCHEMA_REQUIRED');const a=activationProvider();return {schemaReady:false,policy:null,grant:null,recipients:[],activation:{valid:a?.valid===true,enabled:a?.enabled===true,notBefore:a?.notBefore||null,epoch:a?.epoch||null}}}
   // Parent Store lock protects absent rows; all authorization mutations follow
   // the same policy -> grant -> recipients -> consents order.
   const records=await readLockedDispatchAuthorization(tx,s);
   return work({tx,scope:s,now,actor:lockedActor,generation:state.generation,records,activation:activationProvider()});
  },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000}).catch(error=>{if(error?.code==='55P03'||error?.meta?.code==='55P03')fail(409,'REPORT_DISPATCH_BUSY');throw error});
 }
 const recipientApi=createRecipientManagement({mutate:transaction,sendVerification});
 const invitations=createAutomaticReportInvitations({db,mutate:transaction,readAuthorization:readLockedDispatchAuthorization,schemaReady:dispatchSchemaReady,sendInvitation:sendVerification,clock});
 const api={...recipientApi,issueRecipientInvitation:invitations.issue,
  authorizeAdministratorRecipient:(scope,input)=>transaction(scope,context=>authorizeAdministratorRecipient(context,input)),
  getDispatchManagement:scope=>transaction(scope,async({records,activation,generation})=>({schemaReady:true,policy:publicRecord(records.policy),grant:publicRecord(records.grant),recipients:records.recipients.map(({recipient,consent})=>({recipient:publicRecord(recipient),consent:publicRecord(consent),authorizationBasis:consent?.consentedBy?.startsWith(ADMINISTRATOR_AUTHORITY_PREFIX)?'SUPER_ADMIN':'RECIPIENT',authorization:reportRecipientAuthority(recipient,consent,{generation,principalId:records.grant?.principalId})})),activation:{valid:activation?.valid===true,enabled:activation?.enabled===true,notBefore:activation?.notBefore||null,epoch:activation?.epoch||null}}),false),
  saveDispatchPolicy:(scope,input)=>transaction(scope,async({tx,scope:s,now,generation,records})=>{
   expected(records.policy?.revision,input.expectedRevision);if(typeof input.dispatchEnabled!=='boolean'||typeof input.allowsProvisional!=='boolean')fail(400,'REPORT_POLICY_INVALID');const allowed=freq(input.allowedFrequencies);
   if(input.dispatchEnabled&&(!input.allowsProvisional||!allowed.length||!records.grant?.active||allowed.some(f=>!records.grant.allowedFrequencies.includes(f))||!records.recipients.some(({recipient,consent})=>reportRecipientAuthority(recipient,consent,{generation,principalId:records.grant.principalId})&&allowed.every(f=>consent.allowedFrequencies.includes(f)))))fail(409,'REPORT_POLICY_PREREQUISITES');
   await tx.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy" ("companyId","storeId","revision","dispatchEnabled","allowsProvisional","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${next(records.policy?.revision)},${input.dispatchEnabled},${input.allowsProvisional},${allowed}::text[],${BigInt(generation)},${s.actorId},${now}) ON CONFLICT ("companyId","storeId","reportType") DO UPDATE SET "revision"=EXCLUDED."revision","dispatchEnabled"=EXCLUDED."dispatchEnabled","allowsProvisional"=EXCLUDED."allowsProvisional","allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;return {saved:true,revision:Number(next(records.policy?.revision))};
  }),
  saveAutomationGrant:(scope,input)=>transaction(scope,async({tx,scope:s,now,actor,generation,records,activation})=>{
   expected(records.grant?.revision,input.expectedRevision);if(typeof input.active!=='boolean')fail(400,'REPORT_GRANT_INVALID');const allowed=freq(input.allowedFrequencies);if(input.active&&input.explicitAuthorization!==true)fail(400,'REPORT_EXPLICIT_AUTHORIZATION_REQUIRED');if(input.active&&(!activation?.valid||!allowed.length||now<new Date(activation.issuedAt)))fail(409,'REPORT_ACTIVATION_REQUIRED');
   if(!input.active){if(records.grant)await tx.$executeRaw`UPDATE "AutomaticReportAutomationGrant" SET "active"=false,"revision"="revision"+1,"revokedBy"=${s.actorId},"revokedAt"=${now},"updatedBy"=${s.actorId},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId}`;return {saved:true,active:false}}
   const notBefore=new Date(Math.max(now.getTime(),new Date(activation.notBefore).getTime()));
   await tx.$executeRaw`INSERT INTO "AutomaticReportAutomationGrant" ("companyId","storeId","revision","active","principalId","principalSessionVersion","allowedFrequencies","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${next(records.grant?.revision)},true,${actor.id},${actor.sessionVersion},${allowed}::text[],${BigInt(generation)},${activation.epoch},${activation.activationFingerprint},${notBefore},${now},${s.actorId},${now},${s.actorId},${now}) ON CONFLICT ("companyId","storeId","reportType") DO UPDATE SET "revision"=EXCLUDED."revision","active"=true,"principalId"=EXCLUDED."principalId","principalSessionVersion"=EXCLUDED."principalSessionVersion","allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","activationEpoch"=EXCLUDED."activationEpoch","activationFingerprint"=EXCLUDED."activationFingerprint","notBefore"=EXCLUDED."notBefore","createdAt"=EXCLUDED."createdAt","grantedBy"=EXCLUDED."grantedBy","grantedAt"=EXCLUDED."grantedAt","revokedBy"=NULL,"revokedAt"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;return {saved:true,active:true,notBefore:notBefore.toISOString(),revision:Number(next(records.grant?.revision))};
  })
 };
 const schemas={authorizeAdministratorRecipient:administratorRecipientSchema,saveDispatchPolicy:z.object({expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),dispatchEnabled:z.boolean(),allowsProvisional:z.boolean(),allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).max(3)}).strict(),saveAutomationGrant:z.object({expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),active:z.boolean(),allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).max(3),explicitAuthorization:z.boolean().optional()}).strict()};
 return Object.freeze(Object.fromEntries(Object.entries(api).map(([key,fn])=>[key,(scope,input)=>{
 const checkedScope=z.object({actorId:z.string().min(1).max(200),companyId:z.string().min(1).max(200),storeId:z.string().min(1).max(200)}).strict().parse(snapshotDispatchInput(scope));
 const checkedInput=input===undefined?undefined:snapshotDispatchInput(input);return fn(checkedScope,schemas[key]?schemas[key].parse(checkedInput):checkedInput);
 }])));
}
