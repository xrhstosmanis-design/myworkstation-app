import {createHash} from 'node:crypto';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';
import {automaticReportConfigurationSchema} from './automatic-report-settings.js';
import {completedReportPeriod} from './automatic-report-policy.js';
import {readAutomaticCashPreviewInTransaction} from './automatic-report-source.js';
import {buildAutomaticCashPayload} from './automatic-report-cash-payload.js';
import {activationAllows} from './automatic-report-activation.js';

const hold=()=>{throw Object.assign(new Error('Automatic report eligibility is on hold.'),{code:'REPORT_DISPATCH_HOLD',status:409})};
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const iso=value=>{const v=value instanceof Date?value.toISOString():value;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)hold();return v};
const active=(row,now)=>!!row&&row.active===true&&(!row.startsAt||iso(row.startsAt)<=now)&&(!row.endsAt||iso(row.endsAt)>=now);
const safe=value=>{if(typeof value!=='string'||!/^[1-9]\d*$/.test(value)||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))hold();return Number(value)};
export function automaticReportScopeInput(raw){
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))hold();
 const d=Object.getOwnPropertyDescriptors(raw),keys=['companyId','storeId','frequency'];
 if(Reflect.ownKeys(d).length!==3||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))hold();
 const result=Object.fromEntries(keys.map(k=>[k,d[k].value]));
 if(!['companyId','storeId'].every(k=>typeof result[k]==='string'&&result[k]===result[k].trim()&&result[k].length>0&&result[k].length<=200&&!/[\u0000-\u001f\u007f]/.test(result[k]))||!['DAILY','WEEKLY','MONTHLY'].includes(result.frequency))hold();
 return Object.freeze(result);
}
export function createAutomaticReportEligibilityReader({activationProvider,persistence}){
 if(typeof activationProvider!=='function'||!persistence)throw new TypeError('Trusted dispatch dependencies required');
 async function context(tx,raw,now){
  const scope=automaticReportScopeInput(raw);now=iso(now);
  const control=activationProvider();if(!control?.valid||!control.enabled)hold();
  const lifecycle=await lockAutomaticReportBoundary(tx,scope);
  const [company]=await tx.$queryRaw`SELECT "id","active","licenseStatus","subscriptionEndsAt" FROM "Company" WHERE "id"=${scope.companyId} FOR SHARE NOWAIT`;
  const [store]=await tx.$queryRaw`SELECT "id","companyId","name","active" FROM "Store" WHERE "id"=${scope.storeId} AND "companyId"=${scope.companyId} FOR SHARE NOWAIT`;
  if(!company?.active||!store?.active||['EXPIRED','SUSPENDED'].includes(company.licenseStatus)||company.subscriptionEndsAt&&iso(company.subscriptionEndsAt)<now)hold();
  // This probe locates the principal only. The locked authoritative grant must
  // still match; a probe never authorizes a send or acquires a grant lock early.
  const [hint]=await tx.$queryRaw`SELECT "principalId" FROM "AutomaticReportAutomationGrant" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "reportType"='CASH'`;
  if(!hint?.principalId)hold();
  const [principal]=await tx.$queryRaw`SELECT "id","role","sessionVersion" FROM "User" WHERE "id"=${hint.principalId} FOR SHARE NOWAIT`;
  // SHARE, unlike parent SHARE versus FK KEY SHARE, excludes configuration
  // INSERTs even when the selected override/rule row does not exist yet.
  await tx.$executeRaw`LOCK TABLE "CompanyModule", "StorePaidModule", "CashControlStoreRule" IN SHARE MODE NOWAIT`;
  const modules=await tx.$queryRaw`SELECT "active","startsAt","endsAt" FROM "CompanyModule" WHERE "companyId"=${scope.companyId} AND "moduleKey"='CASH_CONTROL'`;
  const overrides=await tx.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "moduleKey"='CASH_CONTROL'`;
  if(!(overrides.length?active(overrides[0],now):active(modules[0],now)))hold();
  const [settings]=await tx.$queryRaw`SELECT "configurationJson","version" FROM "AutomaticReportSettings" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR SHARE NOWAIT`;
  if(!settings||!Number.isSafeInteger(settings.version)||settings.version<1)hold();
  const configuration=automaticReportConfigurationSchema.parse(settings.configurationJson);
  const authorization=await persistence.readLockedDispatchAuthorization(tx,{companyId:scope.companyId,storeId:scope.storeId,now,activation:control});
  const {policy,grant,recipients}=authorization||{};
  if(!policy||!grant||!Array.isArray(recipients)||!recipients.length||recipients.length>5||policy.dispatchEnabled!==true||policy.allowsProvisional!==true||grant.active!==true||grant.revokedAt||principal?.role!=='SUPER_ADMIN'||principal.id!==grant.principalId||String(principal.sessionVersion)!==String(grant.principalSessionVersion)||policy.lifecycleGeneration!==lifecycle.generation||grant.lifecycleGeneration!==lifecycle.generation||!policy.allowedFrequencies?.includes(scope.frequency)||!grant.allowedFrequencies?.includes(scope.frequency))hold();
  safe(policy.revision);safe(grant.revision);
  const period=completedReportPeriod(new Date(now),scope.frequency,configuration);
  const from=period.from.toISOString(),to=period.to.toISOString();
  if(!activationAllows(control,{activationEpoch:grant.activationEpoch,activationFingerprint:grant.activationFingerprint,createdAt:iso(grant.createdAt),periodFrom:from,now})||from<iso(grant.notBefore))hold();
  const preview=await readAutomaticCashPreviewInTransaction(tx,{actorId:principal.id,companyId:scope.companyId,storeId:scope.storeId,day:period.fromDay,frequency:scope.frequency,configuration,settingsVersion:settings.version,now:new Date(now)});
  const payload=buildAutomaticCashPayload({preview,companyId:scope.companyId,storeId:scope.storeId,settingsVersion:settings.version});
  if(payload.period.from!==from||payload.period.to!==to)hold();
  // Re-read activation after source work as well as independently at every start.
  if(canonical(activationProvider())!==canonical(control))hold();
  const eligible=[];
  for(const {recipient,consent} of recipients){
   if(!recipient||!consent||!recipient.verifiedAt||recipient.revokedAt||consent.active!==true||consent.revokedAt||String(consent.recipientVersion)!==String(recipient.version)||consent.lifecycleGeneration!==lifecycle.generation||!consent.allowedFrequencies?.includes(scope.frequency)||iso(consent.consentedAt)<control.issuedAt||iso(consent.consentedAt)>now||from<iso(consent.consentedAt)||iso(recipient.verifiedAt)>now||typeof consent.proofHash!=='string'||!/^[a-f0-9]{64}$/.test(consent.proofHash))continue;
   const recipientVersion=safe(recipient.version),consentRevision=safe(consent.revision);
   if(typeof recipient.email!=='string'||!recipient.recipientId)hold();
   const policyFingerprint=persistence.dispatchPolicyFingerprint?persistence.dispatchPolicyFingerprint({policy,grant,recipient}):createHash('sha256').update(canonical({format:'MWS_DISPATCH_AUTHORIZATION_V1',policy,grant,recipientId:recipient.recipientId})).digest('hex');
   const input={companyId:scope.companyId,storeId:scope.storeId,reportType:'CASH',frequency:scope.frequency,periodFrom:from,periodTo:to,recipient:recipient.email,snapshot:{settingsVersion:settings.version,recipientVersion,consentRevision,lifecycleGeneration:lifecycle.generation,sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint,principalId:principal.id,financialFinality:'PROVISIONAL',financialReconciliationComplete:false}};
   eligible.push(input);
  }
  if(!eligible.length)hold();
  return {scope,now,payload,inputs:eligible,activation:control};
 }
 const reader=async({tx,companyId,storeId,input,now})=>{
  const current=await context(tx,{companyId,storeId,frequency:input.frequency},now);
  const candidate=current.inputs.find(v=>v.recipient===input.recipient);
  if(!candidate||canonical(candidate)!==canonical(input))hold();
  const stored=await persistence.readImmutablePayload(tx,{companyId,storeId,frequency:input.frequency,periodFrom:input.periodFrom,periodTo:input.periodTo,payloadFingerprint:input.snapshot.payloadFingerprint,lifecycleGeneration:input.snapshot.lifecycleGeneration,now});
  const payload=stored?.payload??stored;
  if(!payload||canonical(payload)!==canonical(current.payload))hold();
  return {...candidate,checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:true,consentActive:true,dispatchEnabled:true,sourceReady:true,policyAllowsProvisional:true,maintenanceBlocked:false};
 };
 return Object.assign(reader,{readContext:context});
}
