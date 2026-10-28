import {readMonthlyInvoiceAudit} from './monthly-invoice-audit.js';
import {buildInvoiceAuditEmailPayload} from './invoice-audit-email-payload.js';
import {invoiceAuditEmailPeriod} from './invoice-audit-email-period.js';
import {companyModuleState,isCurrentlyActive} from '../middleware/module-access.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';

const roles=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const fail=(message,status=400,code='INVOICE_AUDIT_EMAIL_PREVIEW_INVALID')=>{throw Object.assign(new Error(message),{status,code})};
const safeText=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);
const columns={AutomaticReportRecipient:['recipientId','companyId','storeId','email','version','verifiedAt','revokedAt'],AutomaticReportRecipientConsent:['companyId','storeId','recipientId','recipientVersion','active','allowedFrequencies','lifecycleGeneration','consentedAt','proofHash','revokedAt']};
// Same current personal-role/store authorization as the unchanged C reader,
// repeated in the independent recipient observation, never inferred from it.
async function authorize(tx,actor,storeId,now){
 const current=await tx.user.findUnique({where:{id:actor.id},select:{id:true,role:true,companyId:true}});
 if(!current||!roles.has(current.role))fail('Η τρέχουσα σύνδεση δεν επιτρέπει έλεγχο τιμολογίων.',403,'INVOICE_MONTH_AUDIT_DENIED');
 const companyId=actor.companyId;
 if(current.role==='SUPER_ADMIN'){
  if(actor.supportContext&&(actor.supportContext.companyId!==companyId||actor.supportContext.storeId&&actor.supportContext.storeId!==storeId))fail('Η επιλογή δεν ανήκει στην πρόσβαση υποστήριξης.',403);
 }else{
  if(actor.supportContext||actor.isSuperAdmin||actor.platformRole==='SUPER_ADMIN')fail('Η πρόσβαση υποστήριξης δεν είναι πλέον ενεργή.',403);
  if(current.companyId!==companyId){
   if(current.role!=='OWNER'||actor.ownerCompanyId!==companyId)fail('Δεν έχεις πρόσβαση στην εταιρεία.',403);
   const access=await tx.$queryRawUnsafe(`SELECT 1 FROM "OwnerCompanyAccess" a JOIN "Company" c ON c."id"=a."companyId" WHERE a."ownerId"=$1 AND a."companyId"=$2 AND c."active"=TRUE LIMIT 1`,actor.id,companyId);
   if(!access.length)fail('Η πρόσβαση στην εταιρεία έχει αφαιρεθεί.',403);
  }
 }
 const store=await tx.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,companyId:true,name:true}});
 if(!store)fail('Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.',404);
 if(current.role!=='SUPER_ADMIN'){
  const state=await companyModuleState(companyId,{db:tx,now});
  if(!state?.licenseAllowed)fail('Η άδεια της εταιρείας δεν είναι ενεργή.',403);
  const overrides=await tx.$queryRawUnsafe(`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=$1 AND "storeId"=$2 AND "moduleKey"='INVENTORY' LIMIT 1`,companyId,storeId);
  if(!(overrides[0]?isCurrentlyActive(overrides[0],now):state.activeModules.includes('INVENTORY')))fail('Η Αποθήκη δεν είναι ενεργή στο επιλεγμένο κατάστημα.',403);
 }
 return store;
}

const validDate=(value,now)=>value!==null&&value!==undefined&&Number.isFinite(new Date(value).getTime())&&new Date(value)<=now;
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value)&&!/[\u0000-\u001f\u007f]/.test(value);
const masked=value=>{const [local,domain]=value.split('@'),tail=domain.slice(domain.lastIndexOf('.'));return local[0]+'***@'+domain[0]+'***'+tail};
const unavailable=(observedAt,reason)=>({available:false,observedAt,reason,verifiedCount:null,monthlyConsentEligibleCount:null,identities:[],purposeConsent:'NOT_ASSUMED'});

async function recipientSummary(db,actor,input,clock){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '8000ms'");
  const now=new Date(clock());if(!Number.isFinite(now.getTime()))fail('Μη έγκυρη ώρα παρατήρησης.',502);
  await authorize(tx,actor,input.storeId,now);
  const observedAt=now.toISOString();
  const schema=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,Object.keys(columns));
  if(!Object.entries(columns).every(([table,names])=>names.every(column=>schema.some(r=>r.table===table&&r.column===column))))return unavailable(observedAt,'RECIPIENT_SCHEMA_UNAVAILABLE');
  const lifecycle=await readLifecycleGeneration(tx,{companyId:actor.companyId,storeId:input.storeId});
  if(lifecycle.maintenance||lifecycle.retired)return unavailable(observedAt,'STORE_LIFECYCLE_UNAVAILABLE');
  const rows=await tx.$queryRawUnsafe(`SELECT r."email",r."version"::text AS "version",r."verifiedAt",COUNT(*) OVER()::text AS "sourceCount",c."recipientVersion"::text AS "recipientVersion",c."active",c."allowedFrequencies",c."lifecycleGeneration"::text AS "lifecycleGeneration",c."consentedAt",c."proofHash",c."revokedAt" AS "consentRevokedAt" FROM "AutomaticReportRecipient" r LEFT JOIN "AutomaticReportRecipientConsent" c ON c."companyId"=r."companyId" AND c."storeId"=r."storeId" AND c."recipientId"=r."recipientId" WHERE r."companyId"=$1 AND r."storeId"=$2 AND r."revokedAt" IS NULL ORDER BY r."recipientId" LIMIT 6`,actor.companyId,input.storeId);
  const total=rows.length?Number(rows[0].sourceCount):0;
  if(!Number.isSafeInteger(total)||total!==rows.length||total>5)return unavailable(observedAt,'RECIPIENT_SOURCE_LIMIT');
  const verified=rows.filter(r=>email(r.email)&&validDate(r.verifiedAt,now)&&/^[1-9]\d{0,15}$/.test(r.version)&&Number.isSafeInteger(Number(r.version)));
  const eligible=r=>r.active===true&&!r.consentRevokedAt&&String(r.recipientVersion)===r.version&&String(r.lifecycleGeneration)===lifecycle.generation&&Array.isArray(r.allowedFrequencies)&&r.allowedFrequencies.includes('MONTHLY')&&validDate(r.consentedAt,now)&&new Date(r.consentedAt)>=new Date(r.verifiedAt)&&typeof r.proofHash==='string'&&/^[a-f0-9]{64}$/.test(r.proofHash);
  return {available:true,observedAt,reason:null,verifiedCount:verified.length,monthlyConsentEligibleCount:verified.filter(eligible).length,identities:verified.map(r=>({maskedEmail:masked(r.email),monthlyConsentEligible:eligible(r)})),purposeConsent:'NOT_ASSUMED'};
 },{isolationLevel:'RepeatableRead',maxWait:2000,timeout:15000});
}

export async function readInvoiceAuditEmailPreview(db,actor,input,{clock=()=>new Date(),readAudit=readMonthlyInvoiceAudit}={}){
 if(!actor||!safeText(actor.id)||!safeText(actor.companyId)||actor.tokenType&&actor.tokenType!=='BACKOFFICE_USER'||!roles.has(actor.role)||actor.storeId&&actor.storeId!==input?.storeId)fail('Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.',403);
 if(!input||Object.keys(input).some(k=>!['storeId','month'].includes(k))||!safeText(input.storeId))fail('Επίλεξε συγκεκριμένο κατάστημα και μήνα.');
 invoiceAuditEmailPeriod(input.month);
 const reportNow=new Date(clock());if(!Number.isFinite(reportNow.getTime()))fail('Μη έγκυρη ώρα παρατήρησης.',502);
 const report=await readAudit(db,actor,{storeId:input.storeId,month:input.month},{now:reportNow});
 if(report?.store?.id!==input.storeId||report?.period?.month!==input.month)fail('Η πηγή δεν αντιστοιχεί στην επιλογή.',502);
 const payload=buildInvoiceAuditEmailPayload(report),recipients=await recipientSummary(db,actor,input,clock);
 return {store:{id:report.store.id,name:report.store.name},period:payload.period,reportObservedAt:payload.reportObservedAt,recipientObservedAt:recipients.observedAt,separateSnapshots:true,previewOnly:true,readOnly:true,sendingEnabled:false,purposeConsent:'NOT_ASSUMED',reportType:'INVOICE_AUDIT',payload,recipients};
}
