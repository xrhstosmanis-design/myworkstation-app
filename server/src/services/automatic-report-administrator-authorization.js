import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';

// Existing provenance columns are compatibility storage for two DISTINCT
// authorities. A report-superadmin actor is never a mailbox/recipient actor.
// In particular, administrator approval must never set verifiedAt/verifiedBy.
export const ADMINISTRATOR_AUTHORITY_PREFIX='report-superadmin:';
const fail=(code,status=409)=>{throw Object.assign(new Error('Η έγκριση παραλήπτη δεν ολοκληρώθηκε. Ανανέωσε την κατάσταση.'),{code,status})};
const revision=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const administratorRecipientSchema=z.object({
 email:z.string().trim().toLowerCase().email().max(254),recipientId:z.string().min(1).max(200).optional(),
 expectedRecipientVersion:revision,expectedAuthorizationRevision:revision,expectedGrantRevision:revision,expectedPolicyRevision:revision,
 allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).min(1).max(3),explicitAuthorization:z.literal(true)
}).strict();
const iso=value=>{try{const d=new Date(value);return value!=null&&Number.isFinite(d.getTime())?d.toISOString():null}catch{return null}};
const validFrequencies=v=>Array.isArray(v)&&v.length>0&&v.length<=3&&new Set(v).size===v.length&&v.every(f=>['DAILY','WEEKLY','MONTHLY'].includes(f));
const same=(a,b)=>validFrequencies(a)&&validFrequencies(b)&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const validRevision=v=>/^[1-9]\d*$/.test(String(v))&&BigInt(v)<=9007199254740991n;
const expect=(actual,wanted)=>{if(String(actual||0)!==String(wanted))fail('REPORT_REVISION_CHANGED')};
const next=value=>{const n=BigInt(value||0)+1n;if(n>9007199254740991n)fail('REPORT_REVISION_EXHAUSTED');return n};
export function administratorAuthorizationProof(recipient,authorization){
 return createHash('sha256').update(JSON.stringify(['MWS_REPORT_SUPERADMIN_AUTHORIZATION_V1',recipient.companyId,recipient.storeId,recipient.recipientId,recipient.email,String(recipient.version),String(authorization.revision),String(authorization.lifecycleGeneration),authorization.consentedBy,iso(authorization.consentedAt),[...authorization.allowedFrequencies].sort()])).digest('hex');
}
export function reportRecipientAuthority(recipient,authorization,{generation,principalId}={}){
 if(!recipient||recipient.revokedAt||!authorization||authorization.active!==true||authorization.revokedAt||!validRevision(recipient.version)||!validRevision(authorization.revision)||String(authorization.recipientVersion)!==String(recipient.version)||authorization.companyId!==undefined&&authorization.companyId!==recipient.companyId||authorization.storeId!==undefined&&authorization.storeId!==recipient.storeId||!validFrequencies(authorization.allowedFrequencies)||!iso(authorization.consentedAt)||typeof authorization.proofHash!=='string'||!/^[a-f0-9]{64}$/.test(authorization.proofHash)||generation!==undefined&&String(authorization.lifecycleGeneration)!==String(generation))return null;
 const issuer=authorization.consentedBy;
 if(typeof issuer==='string'&&issuer.startsWith(ADMINISTRATOR_AUTHORITY_PREFIX)){
  const actorId=issuer.slice(ADMINISTRATOR_AUTHORITY_PREFIX.length);
  if(!actorId||principalId!==undefined&&actorId!==principalId||!recipient.companyId||!recipient.storeId||administratorAuthorizationProof(recipient,authorization)!==authorization.proofHash)return null;
  return {basis:'SUPER_ADMIN',authorizedBy:actorId,authorizedAt:iso(authorization.consentedAt)};
 }
 if(!iso(recipient.verifiedAt))return null;
 return {basis:'RECIPIENT',authorizedBy:issuer||null,authorizedAt:iso(authorization.consentedAt)};
}

// Caller holds the current SuperAdmin, lifecycle, Store, policy/grant and
// recipient/authorization locks in the existing management transaction.
export async function authorizeAdministratorRecipient({tx,scope:s,actor,records,generation,activation,now},raw){
 const input=administratorRecipientSchema.parse(raw);
 if(actor?.role!=='SUPER_ADMIN'||actor.id!==s.actorId)fail('REPORT_SUPER_ADMIN_REQUIRED',403);
 if(/[,;\r\n]/.test(input.email)||!validFrequencies(input.allowedFrequencies))fail('REPORT_RECIPIENT_INVALID',400);
 const allowed=[...input.allowedFrequencies].sort();
 expect(records.grant?.revision,input.expectedGrantRevision);expect(records.policy?.revision,input.expectedPolicyRevision);
 if(!activation?.valid||!iso(activation.issuedAt)||!iso(activation.notBefore)||now<new Date(activation.issuedAt))fail('REPORT_ACTIVATION_REQUIRED');
 let entry=records.recipients.find(({recipient:r})=>input.recipientId?r.recipientId===input.recipientId:r.email===input.email);
 if(input.recipientId&&!entry)fail('REPORT_RECIPIENT_NOT_FOUND',404);
 if(entry&&entry.recipient.email!==input.email)fail('REPORT_RECIPIENT_CHANGED');
 expect(entry?.recipient.version,input.expectedRecipientVersion);expect(entry?.consent?.revision,input.expectedAuthorizationRevision);
 if(!entry){
  const previous=await tx.$queryRaw`SELECT "recipientId" FROM "AutomaticReportRecipient" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "email"=${input.email} FOR UPDATE`;
  if(previous.length)fail('REPORT_RECIPIENT_REVOKED');
  if(records.recipients.length>=5)fail('REPORT_RECIPIENT_LIMIT');
 }
 const g=records.grant,p=records.policy;
 const retainGrant=g?.active===true&&!g.revokedAt&&g.principalId===actor.id&&String(g.principalSessionVersion)===String(actor.sessionVersion)&&String(g.lifecycleGeneration)===String(generation)&&g.activationEpoch===activation.epoch&&g.activationFingerprint===activation.activationFingerprint&&same(g.allowedFrequencies,allowed)&&iso(g.createdAt)>=iso(activation.issuedAt)&&iso(g.createdAt)<=now.toISOString()&&iso(g.notBefore)>=iso(activation.notBefore);
 const oldAuthority=entry&&reportRecipientAuthority(entry.recipient,entry.consent,{generation,principalId:actor.id});
 const retainAuthority=oldAuthority&&same(entry.consent.allowedFrequencies,allowed)&&oldAuthority.authorizedAt>=iso(activation.issuedAt)&&oldAuthority.authorizedAt<=now.toISOString();
 const retainPolicy=p?.dispatchEnabled===true&&p.allowsProvisional===true&&String(p.lifecycleGeneration)===String(generation)&&same(p.allowedFrequencies,allowed);
 if(retainGrant&&retainAuthority&&retainPolicy)return {saved:true,alreadyAuthorized:true,recipientId:entry.recipient.recipientId,authorizationBasis:oldAuthority.basis,dispatchEnabled:true,externalActivationEnabled:activation.enabled===true};
 if(!entry){
  const recipientId=randomBytes(16).toString('hex');
  await tx.$executeRaw`INSERT INTO "AutomaticReportRecipient" ("recipientId","companyId","storeId","email","createdBy","createdAt","updatedBy","updatedAt") VALUES (${recipientId},${s.companyId},${s.storeId},${input.email},${actor.id},${now},${actor.id},${now})`;
  entry={recipient:{recipientId,companyId:s.companyId,storeId:s.storeId,email:input.email,version:'1',verifiedAt:null},consent:null};
 }
 if(!retainAuthority){
  const r=entry.recipient,c={revision:String(next(entry.consent?.revision)),recipientVersion:String(r.version),lifecycleGeneration:String(generation),allowedFrequencies:allowed,consentedBy:ADMINISTRATOR_AUTHORITY_PREFIX+actor.id,consentedAt:now};
  const proofHash=administratorAuthorizationProof(r,c);
  await tx.$executeRaw`INSERT INTO "AutomaticReportRecipientConsent" ("companyId","storeId","recipientId","revision","recipientVersion","active","allowedFrequencies","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${r.recipientId},${BigInt(c.revision)},${BigInt(r.version)},true,${allowed}::text[],${BigInt(generation)},${c.consentedBy},${now},${proofHash},${actor.id},${now}) ON CONFLICT ("companyId","storeId","recipientId") DO UPDATE SET "revision"=EXCLUDED."revision","recipientVersion"=EXCLUDED."recipientVersion","active"=true,"allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","consentedBy"=EXCLUDED."consentedBy","consentedAt"=EXCLUDED."consentedAt","proofHash"=EXCLUDED."proofHash","revokedBy"=NULL,"revokedAt"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;
  // An old outstanding invitation may not overwrite this newer explicit act.
  await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=NULL,"challengeNonce"=NULL,"challengePurpose"=NULL,"challengeFrequencies"=ARRAY[]::text[],"challengeExpiresAt"=NULL,"updatedBy"=${actor.id},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
 }
 if(!retainGrant){
  const notBefore=new Date(Math.max(now.getTime(),new Date(activation.notBefore).getTime()));
  await tx.$executeRaw`INSERT INTO "AutomaticReportAutomationGrant" ("companyId","storeId","revision","active","principalId","principalSessionVersion","allowedFrequencies","lifecycleGeneration","activationEpoch","activationFingerprint","notBefore","createdAt","grantedBy","grantedAt","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${next(g?.revision)},true,${actor.id},${actor.sessionVersion},${allowed}::text[],${BigInt(generation)},${activation.epoch},${activation.activationFingerprint},${notBefore},${now},${actor.id},${now},${actor.id},${now}) ON CONFLICT ("companyId","storeId","reportType") DO UPDATE SET "revision"=EXCLUDED."revision","active"=true,"principalId"=EXCLUDED."principalId","principalSessionVersion"=EXCLUDED."principalSessionVersion","allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","activationEpoch"=EXCLUDED."activationEpoch","activationFingerprint"=EXCLUDED."activationFingerprint","notBefore"=EXCLUDED."notBefore","createdAt"=EXCLUDED."createdAt","grantedBy"=EXCLUDED."grantedBy","grantedAt"=EXCLUDED."grantedAt","revokedBy"=NULL,"revokedAt"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;
 }
 if(!retainPolicy)await tx.$executeRaw`INSERT INTO "AutomaticReportDispatchPolicy" ("companyId","storeId","revision","dispatchEnabled","allowsProvisional","allowedFrequencies","lifecycleGeneration","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${next(p?.revision)},true,true,${allowed}::text[],${BigInt(generation)},${actor.id},${now}) ON CONFLICT ("companyId","storeId","reportType") DO UPDATE SET "revision"=EXCLUDED."revision","dispatchEnabled"=true,"allowsProvisional"=true,"allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;
 return {saved:true,recipientId:entry.recipient.recipientId,authorizationBasis:retainAuthority?oldAuthority.basis:'SUPER_ADMIN',dispatchEnabled:true,externalActivationEnabled:activation.enabled===true};
}
