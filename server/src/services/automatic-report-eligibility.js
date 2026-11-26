import {readSettledMonthlySnapshotForReport} from './monthly-inventory-snapshot-repository.js';
import {buildMonthlyInventorySummaryPayload} from './monthly-inventory-summary-email.js';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';
import {automaticReportEventLifecycleReady,monthlyInventorySummaryLifecycleReady} from './automatic-report-event-schema.js';
import {readInventoryResultEvent,buildAutomaticInventoryPayload} from './inventory-result-email.js';
import {readPromotionResultEvent,buildAutomaticPromotionPayload} from './promotion-result-email.js';
import {readDailyTurnover,readShiftTurnover} from './daily-turnover-report.js';
import {buildAutomaticSupplierPayload,completedSupplierReportMonth} from './supplier-comparison-email.js';
import {invoiceAuditEmailPeriod} from './invoice-audit-email-period.js';
import {createHash} from 'node:crypto';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';
import {automaticReportConfigurationSchema} from './automatic-report-settings.js';
import {cashPreviewPeriod,completedReportPeriod,reportScheduleAllows} from './automatic-report-policy.js';
import {readAutomaticCashPreviewInTransaction} from './automatic-report-source.js';
import {buildAutomaticCashPayload,buildDailyCashMorningNotice} from './automatic-report-cash-payload.js';
import {activationAllows} from './automatic-report-activation.js';
import {reportRecipientAuthority} from './automatic-report-administrator-authorization.js';

const hold=()=>{throw Object.assign(new Error('Automatic report eligibility is on hold.'),{code:'REPORT_DISPATCH_HOLD',status:409})};
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const iso=value=>{const v=value instanceof Date?value.toISOString():value;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)hold();return v};
const active=(row,now)=>!!row&&row.active===true&&(!row.startsAt||iso(row.startsAt)<=now)&&(!row.endsAt||iso(row.endsAt)>=now);
const safe=value=>{if(typeof value!=='string'||!/^[1-9]\d*$/.test(value)||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))hold();return Number(value)};
export function automaticReportScopeInput(raw){
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))hold();
 const d=Object.getOwnPropertyDescriptors(raw),keys=['companyId','storeId','frequency',...(d.frequency?.value==='EVENT'?['eventId']:[]),...(d.stage?['stage','periodFrom','periodTo']:[])];
 if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))hold();
 const result=Object.fromEntries(keys.map(k=>[k,d[k].value]));
 if(!['companyId','storeId'].every(k=>typeof result[k]==='string'&&result[k]===result[k].trim()&&result[k].length>0&&result[k].length<=200&&!/[\u0000-\u001f\u007f]/.test(result[k]))||!['DAILY','WEEKLY','MONTHLY','EVENT'].includes(result.frequency)||result.frequency==='EVENT'&&(typeof result.eventId!=='string'||result.eventId!==result.eventId.trim()||!result.eventId||result.eventId.length>200||/[\u0000-\u001f\u007f]/.test(result.eventId)))hold();
 if(d.stage&&(result.stage!=='FINAL'||result.frequency!=='DAILY'||iso(result.periodFrom)>=iso(result.periodTo)))hold();
 return Object.freeze(result);
}
export function cashGrantPeriodStart(grant,frequency){
 // A later grantedAt with original createdAt records a DAILY-to-MONTHLY
 // extension. Older workers still see the new notBefore and hold safely.
 const notBefore=iso(grant.notBefore);
 if(frequency==='DAILY'&&grant.allowedFrequencies.length===2&&
    grant.allowedFrequencies.includes('DAILY')&&grant.allowedFrequencies.includes('MONTHLY')&&
    grant.grantedAt&&iso(grant.createdAt)<iso(grant.grantedAt)&&iso(grant.grantedAt)<=notBefore)return iso(grant.createdAt);
 return notBefore;
}
export function includesScheduledMonthlyTurnover({frequency,storeId},env){
 return frequency==='MONTHLY'&&(
  storeId===env.MONTHLY_TURNOVER_REPORT_STORE_ID||
  storeId===env.MONTHLY_TURNOVER_SCHEDULED_LAB_STORE_ID
 );
}
export function createAutomaticReportEligibilityReader({activationProvider,persistence,reportType='CASH',env=process.env}){
 if(typeof activationProvider!=='function'||!persistence)throw new TypeError('Trusted dispatch dependencies required');
 if(!['CASH','SUPPLIER_COMPARISON','PROMOTION_RESULT','INVENTORY_RESULT','MONTHLY_INVENTORY_SUMMARY'].includes(reportType))throw new TypeError('Unsupported report type');
 const supplier=reportType==='SUPPLIER_COMPARISON',promotion=reportType==='PROMOTION_RESULT',inventory=reportType==='INVENTORY_RESULT';
 const monthlyInventory=reportType==='MONTHLY_INVENTORY_SUMMARY';
 const eventReport=promotion||inventory;
 const nonCash=supplier||monthlyInventory||eventReport;
 const moduleKey=nonCash?'INVENTORY':'CASH_CONTROL';
 async function context(tx,raw,now,{inspectPapers=false}={}){
  const scope=automaticReportScopeInput(raw);now=iso(now);
  const final=scope.stage==='FINAL';
  const twoPhase=env.CASH_TWO_PHASE_DAILY_EMAIL==='true';
  if(final&&(nonCash||!twoPhase))hold();
  if(eventReport&&!automaticReportEventLifecycleReady(env)||monthlyInventory&&!monthlyInventorySummaryLifecycleReady(env))hold();
  if((supplier||monthlyInventory)&&scope.frequency!=='MONTHLY'||eventReport&&scope.frequency!=='EVENT'||!eventReport&&scope.frequency==='EVENT')hold();
  const control=activationProvider();if(!control?.valid||!control.enabled)hold();
  const lifecycle=await lockAutomaticReportBoundary(tx,scope);
  const [company]=await tx.$queryRaw`SELECT "id","active","licenseStatus","subscriptionEndsAt" FROM "Company" WHERE "id"=${scope.companyId} FOR SHARE NOWAIT`;
  const [store]=await tx.$queryRaw`SELECT "id","companyId","name","active" FROM "Store" WHERE "id"=${scope.storeId} AND "companyId"=${scope.companyId} FOR SHARE NOWAIT`;
  if(!company?.active||!store?.active||['EXPIRED','SUSPENDED'].includes(company.licenseStatus)||company.subscriptionEndsAt&&iso(company.subscriptionEndsAt)<now)hold();
  // This probe locates the principal only. The locked authoritative grant must
  // still match; a probe never authorizes a send or acquires a grant lock early.
  const [hint]=await tx.$queryRaw`SELECT "principalId" FROM "AutomaticReportAutomationGrant" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "reportType"=${reportType}`;
  if(!hint?.principalId)hold();
  const [principal]=await tx.$queryRaw`SELECT "id","role","sessionVersion" FROM "User" WHERE "id"=${hint.principalId} FOR SHARE NOWAIT`;
  // SHARE, unlike parent SHARE versus FK KEY SHARE, excludes configuration
  // INSERTs even when the selected override/rule row does not exist yet.
  await tx.$executeRaw`LOCK TABLE "CompanyModule", "StorePaidModule", "CashControlStoreRule" IN SHARE MODE NOWAIT`;
  const modules=await tx.$queryRaw`SELECT "active","startsAt","endsAt" FROM "CompanyModule" WHERE "companyId"=${scope.companyId} AND "moduleKey"=${moduleKey}`;
  const overrides=await tx.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "moduleKey"=${moduleKey}`;
  if(!(overrides.length?active(overrides[0],now):active(modules[0],now)))hold();
  const [settings]=await tx.$queryRaw`SELECT "configurationJson","version" FROM "AutomaticReportSettings" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR SHARE NOWAIT`;
  if(!nonCash&&(!settings||!Number.isSafeInteger(settings.version)||settings.version<1))hold();
  const configuration=settings?automaticReportConfigurationSchema.parse(settings.configurationJson):null;
  if(final?configuration.deliverySchedules?.cashDaily?.enabled===false:!reportScheduleAllows(new Date(now),reportType,scope.frequency,configuration))hold();
  const authorization=await persistence.readLockedDispatchAuthorization(tx,{companyId:scope.companyId,storeId:scope.storeId,now,activation:control,...(nonCash?{reportType}:{})});
  const {policy,grant,recipients}=authorization||{};
  if(!policy||!grant||!Array.isArray(recipients)||!recipients.length||recipients.length>5||policy.dispatchEnabled!==true||policy.allowsProvisional!==true||grant.active!==true||grant.revokedAt||principal?.role!=='SUPER_ADMIN'||principal.id!==grant.principalId||String(principal.sessionVersion)!==String(grant.principalSessionVersion)||policy.lifecycleGeneration!==lifecycle.generation||grant.lifecycleGeneration!==lifecycle.generation||!policy.allowedFrequencies?.includes(scope.frequency)||!grant.allowedFrequencies?.includes(scope.frequency))hold();
  safe(policy.revision);safe(grant.revision);
  const month=supplier||monthlyInventory?completedSupplierReportMonth(new Date(now)):null;
  const monthBoundary=value=>new Date(Date.parse(invoiceAuditEmailPeriod(value).nominalScheduledAt)+60000);
  function inventoryMonthPeriod(month){
   const schedule=monthlyInventorySnapshotPeriod(month);
   if(Date.parse(now)<Date.parse(schedule.scheduledFor))hold();
   const previous=completedSupplierReportMonth(Date.parse(month+'-15T12:00:00Z'));
   return {from:monthBoundary(previous),to:monthBoundary(month)};
  }
  const event=inventory?await readInventoryResultEvent(tx,{...scope,now}):promotion?await readPromotionResultEvent(tx,{...scope,now}):null;
  const period=eventReport?{from:new Date(event.from),to:new Date(event.to)}:monthlyInventory
   ? inventoryMonthPeriod(month)
   :supplier
   ? {from:monthBoundary(completedSupplierReportMonth(Date.parse(month+'-15T12:00:00Z'))),to:monthBoundary(month)}
   : final?cashPreviewPeriod(scope.periodFrom.slice(0,10),'DAILY',configuration)
   : completedReportPeriod(new Date(now),scope.frequency,configuration);
  const from=period.from.toISOString(),to=period.to.toISOString();
  let morningRecipients;
  if(final){
   if(from!==scope.periodFrom||to!==scope.periodTo||to>now)hold();
   const mornings=await tx.$queryRaw`SELECT "record"->'input'->>'recipient' AS recipient
    FROM "AutomaticReportDeliverySlot"
    WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='ACCEPTED'
     AND "record"->'input'->>'reportType'='CASH' AND "record"->'input'->>'frequency'='DAILY'
     AND "record"->'input'->>'stage' IS NULL AND "record"->'input'->>'periodFrom'=${from}
     AND "record"->'input'->>'periodTo'=${to}
     AND "record"->'input'->'snapshot'->>'lifecycleGeneration'=${lifecycle.generation}`;
   morningRecipients=new Set(mornings.map(row=>row.recipient));
   if(!morningRecipients.size)hold();
  }
  const dailyCash=!nonCash&&scope.frequency==='DAILY';
  const periodAfterAuthorization=authorizedAt=>dailyCash?authorizedAt<to:authorizedAt<=from;
  if(!activationAllows(control,{activationEpoch:grant.activationEpoch,activationFingerprint:grant.activationFingerprint,createdAt:iso(grant.createdAt),periodFrom:from,now})||
     !periodAfterAuthorization(nonCash?iso(grant.notBefore):cashGrantPeriodStart(grant,scope.frequency)))hold();
  const settingsVersion=nonCash?safe(policy.revision):settings.version;
  const automaticPapers=!nonCash&&scope.frequency==='DAILY'&&configuration.automaticPaperReading===true
   ? {actorId:principal.id,generation:lifecycle.generation,from,to,now,...(final?{stage:'FINAL'}:{})}:null;
  if(final&&automaticPapers&&inspectPapers&&recipients.some(({recipient,consent})=>{
   const authority=reportRecipientAuthority(recipient,consent,{generation:lifecycle.generation,principalId:principal.id});
   return authority&&typeof recipient.email==='string'&&morningRecipients.has(recipient.email.trim().toLowerCase())&&
    consent.allowedFrequencies.includes('DAILY')&&authority.authorizedAt>=control.issuedAt&&authority.authorizedAt<=now&&
    (authority.basis==='SUPER_ADMIN'?periodAfterAuthorization(authority.authorizedAt):from>=authority.authorizedAt&&iso(recipient.verifiedAt)<=now);
  }))return {automaticPapers};
  let payload;
  if(monthlyInventory){
   const receipt=await readSettledMonthlySnapshotForReport(tx,{...scope,lifecycleGeneration:lifecycle.generation,issueMonth:month});
   if(!receipt)hold();
   payload=buildMonthlyInventorySummaryPayload(receipt,{...scope,storeName:store.name,issueMonth:month,period:{from,to},settingsVersion});
  }
  else if(inventory)payload=await buildAutomaticInventoryPayload(tx,{...scope,storeName:store.name,period:{from,to},settingsVersion,now});
  else if(promotion)payload=await buildAutomaticPromotionPayload(tx,{...scope,storeName:store.name,period:{from,to},settingsVersion,now});
  else if(supplier)payload=await buildAutomaticSupplierPayload(tx,{...scope,storeName:store.name,month,period:{from,to},settingsVersion});
  else{
   const preview=await readAutomaticCashPreviewInTransaction(tx,{actorId:principal.id,companyId:scope.companyId,storeId:scope.storeId,day:period.fromDay,frequency:scope.frequency,configuration,settingsVersion:settings.version,now:new Date(now),requireFinal:final});
   if(configuration.reviewedReconciliation===true&&preview.reviewedCash?.generation!==lifecycle.generation)hold();
   if (includesScheduledMonthlyTurnover(scope,env)) {
     const turnoverScope = {
       companyId: scope.companyId,
       storeId: scope.storeId,
       from: preview.period.fromDay,
       to: preview.period.toDay,
     };
     preview.dailyTurnover = await readDailyTurnover(tx,turnoverScope,new Date(now));
     if (preview.dailyTurnover.status !== 'AVAILABLE') hold();
     preview.shiftTurnover = await readShiftTurnover(tx,turnoverScope,new Date(now));
     if (preview.shiftTurnover.status !== 'AVAILABLE' ||
         preview.shiftTurnover.shifts.reduce((total,shift)=>total+shift.cash+shift.card,0) !== preview.dailyTurnover.totalCents) hold();
   }
   const args={preview,companyId:scope.companyId,storeId:scope.storeId,settingsVersion:settings.version};
   const needsNotice=twoPhase&&!final&&scope.frequency==='DAILY'&&(preview.sourceReadiness==='HOLD'||preview.complete===false||preview.reviewedCash?.status==='HOLD');
   payload=needsNotice?buildDailyCashMorningNotice(args):buildAutomaticCashPayload(args);
  }
  if(payload.period.from!==from||payload.period.to!==to||(payload.financialFinality==='FINAL')!==final)hold();
  // Re-read activation after source work as well as independently at every start.
  if(canonical(activationProvider())!==canonical(control))hold();
  const eligible=[],authorities={};
  for(const {recipient,consent} of recipients){
   const authority=reportRecipientAuthority(recipient,consent,{generation:lifecycle.generation,principalId:principal.id});
   if(!authority||!consent.allowedFrequencies.includes(scope.frequency)||authority.authorizedAt<control.issuedAt||authority.authorizedAt>now||(authority.basis==='SUPER_ADMIN'?!periodAfterAuthorization(authority.authorizedAt):from<authority.authorizedAt)||authority.basis==='RECIPIENT'&&iso(recipient.verifiedAt)>now)continue;
   if(final&&!morningRecipients.has(recipient.email.trim().toLowerCase()))continue;
   const recipientVersion=safe(recipient.version),consentRevision=safe(consent.revision);
   if(typeof recipient.email!=='string'||!recipient.recipientId)hold();
   const policyFingerprint=persistence.dispatchPolicyFingerprint?persistence.dispatchPolicyFingerprint({policy,grant,recipient}):createHash('sha256').update(canonical({format:'MWS_DISPATCH_AUTHORIZATION_V1',policy,grant,recipientId:recipient.recipientId})).digest('hex');
   const input={companyId:scope.companyId,storeId:scope.storeId,reportType,...(eventReport?{eventId:scope.eventId}:{}),...(final?{stage:'FINAL'}:{}),frequency:scope.frequency,periodFrom:from,periodTo:to,recipient:recipient.email,snapshot:{settingsVersion,recipientVersion,consentRevision,lifecycleGeneration:lifecycle.generation,sourceFingerprint:payload.sourceFingerprint,payloadFingerprint:payload.payloadFingerprint,policyFingerprint,principalId:principal.id,financialFinality:payload.financialFinality,financialReconciliationComplete:final}};
   eligible.push(input);
   authorities[recipient.email]={basis:authority.basis,mailboxVerified:!!recipient.verifiedAt};
  }
  if(!eligible.length)hold();
  return {scope,now,payload,inputs:eligible,activation:control,authorities,automaticPapers:twoPhase&&scope.frequency==='DAILY'&&!final?null:automaticPapers};
 }
 const reader=async({tx,companyId,storeId,input,now})=>{
  const current=await context(tx,{companyId,storeId,frequency:input.frequency,...(input.eventId?{eventId:input.eventId}:{}),...(input.stage==='FINAL'?{stage:'FINAL',periodFrom:input.periodFrom,periodTo:input.periodTo}:{})},now);
  const candidate=current.inputs.find(v=>v.recipient===input.recipient);
  if(!candidate||canonical(candidate)!==canonical(input))hold();
  const stored=await persistence.readImmutablePayload(tx,{companyId,storeId,frequency:input.frequency,periodFrom:input.periodFrom,periodTo:input.periodTo,payloadFingerprint:input.snapshot.payloadFingerprint,lifecycleGeneration:input.snapshot.lifecycleGeneration,now});
  const payload=stored?.payload??stored;
  if(!payload||canonical(payload)!==canonical(current.payload))hold();
  const authority=current.authorities[candidate.recipient],administrator=authority.basis==='SUPER_ADMIN';
  return {...candidate,checkedAt:now,companyActive:true,storeActive:true,licenseActive:true,moduleActive:true,principalAuthorized:true,recipientVerified:administrator?authority.mailboxVerified:true,consentActive:!administrator,...(administrator?{recipientAuthorizationBasis:'SUPER_ADMIN',administratorAuthorizationActive:true}:{}),dispatchEnabled:true,sourceReady:true,...(input.stage==='FINAL'?{policyAllowsFinal:true}:{policyAllowsProvisional:true}),maintenanceBlocked:false};
 };
 return Object.assign(reader,{readContext:context});
}
