import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
const fail=(status,code,message='Η ενέργεια αναφοράς δεν ολοκληρώθηκε.')=>{throw Object.assign(new Error(message),{status,code})};
export function snapshotDispatchInput(value,depth=0){
 if(depth>8)fail(400,'REPORT_INPUT_INVALID');
 if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))fail(400,'REPORT_INPUT_INVALID');
 const array=Array.isArray(value),out=array?[]:{};for(const key of Reflect.ownKeys(value)){if(array&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||!d.enumerable||!Object.hasOwn(d,'value'))fail(400,'REPORT_INPUT_INVALID');out[key]=snapshotDispatchInput(d.value,depth+1)}return out;
}
const increment=v=>{const n=BigInt(v||0)+1n;if(n>9007199254740991n)fail(409,'REPORT_REVISION_EXHAUSTED');return n};
const frequencies=value=>{if(!Array.isArray(value)||value.length>3||new Set(value).size!==value.length||value.some(x=>!['DAILY','WEEKLY','MONTHLY'].includes(x)))fail(400,'REPORT_FREQUENCIES_INVALID');return [...value].sort()};
const equalSet=(a,b)=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());
export async function invalidateStoreDispatchRecipients(tx,{companyId,storeId,actorId},{beforeEmails,afterEmails,now}){
 if(equalSet(beforeEmails,afterEmails))return false;
 const at=new Date(now);
 // Caller owns lifecycle + Store NO KEY UPDATE and the transaction. Never DDL.
 await tx.$executeRaw`UPDATE "AutomaticReportDispatchPolicy" SET "dispatchEnabled"=false,"revision"="revision"+1,"updatedBy"=${actorId},"updatedAt"=${at} WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;
 await tx.$executeRaw`UPDATE "AutomaticReportAutomationGrant" SET "active"=false,"revision"="revision"+1,"revokedBy"=${actorId},"revokedAt"=${at},"updatedBy"=${actorId},"updatedAt"=${at} WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;
 await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "version"="version"+1,"verifiedAt"=NULL,"verifiedBy"=NULL,"challengeHash"=NULL,"challengeNonce"=NULL,"challengeRecipientVersion"=NULL,"challengeLifecycleGeneration"=NULL,"challengeExpiresAt"=NULL,"challengeAttempts"=0,"challengePurpose"=NULL,"challengeFrequencies"=ARRAY[]::text[],"challengeConsentRevision"=NULL,"updatedBy"=${actorId},"updatedAt"=${at} WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;
 await tx.$executeRaw`UPDATE "AutomaticReportRecipientConsent" SET "active"=false,"revision"="revision"+1,"proofHash"=NULL,"revokedBy"=${actorId},"revokedAt"=${at},"updatedBy"=${actorId},"updatedAt"=${at} WHERE "companyId"=${companyId} AND "storeId"=${storeId}`;
 return true;
}
const tokenHash=(r,token)=>createHash('sha256').update(JSON.stringify(['MWS_REPORT_CHALLENGE_V1',r.companyId,r.storeId,r.recipientId,String(r.version),String(r.challengeLifecycleGeneration),r.challengeNonce,r.challengePurpose,[...r.challengeFrequencies].sort(),String(r.challengeConsentRevision??0),token])).digest('hex');
async function locked(tx,scope,id){
 const [r]=await tx.$queryRaw`SELECT *,"version"::text AS "version","challengeRecipientVersion"::text AS "challengeRecipientVersion","challengeConsentRevision"::text AS "challengeConsentRevision" FROM "AutomaticReportRecipient" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "recipientId"=${id} FOR UPDATE`;
 if(!r||r.revokedAt)fail(404,'REPORT_RECIPIENT_NOT_FOUND');return r;
}
async function consent(tx,s,id){return (await tx.$queryRaw`SELECT *,"revision"::text AS "revision","recipientVersion"::text AS "recipientVersion","lifecycleGeneration"::text AS "lifecycleGeneration" FROM "AutomaticReportRecipientConsent" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${id} FOR UPDATE`)[0]||null}
function expected(actual,value){if(!Number.isSafeInteger(value)||value<0||String(actual||0)!==String(value))fail(409,'REPORT_REVISION_CHANGED')}
export function positiveReceipt(r,to){
 if(!r||typeof r!=='object')return false;
 const descriptors=Object.getOwnPropertyDescriptors(r),allowed=['accepted','rejected','pending','messageId','response','envelope'];
 for(const key of Reflect.ownKeys(descriptors)){if(typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value'))return false}
 const value=k=>descriptors[k]?.value,arr=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='string');
 if(!arr(value('accepted'))||value('accepted').length!==1||value('accepted')[0]!==to||!arr(value('rejected'))||value('rejected').length||value('pending')!==undefined&&(!arr(value('pending'))||value('pending').length)||typeof value('messageId')!=='string'||!value('messageId').trim()||/[\r\n]/.test(value('messageId')))return false;
 if(value('response')!==undefined&&(typeof value('response')!=='string'||!/^2\d\d(?:[ -]|$)/.test(value('response'))||/[\r\n]/.test(value('response'))))return false;
 if(value('envelope')!==undefined){const e=value('envelope');if(!e||typeof e!=='object')return false;const d=Object.getOwnPropertyDescriptors(e);if(Reflect.ownKeys(d).some(k=>!['from','to'].includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value'))||!arr(d.to?.value)||d.to.value.length!==1||d.to.value[0]!==to)return false}
 return true;
}

const versionSchema=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const idSchema=z.string().min(1).max(200);
const recipientSchemas={
 saveRecipient:z.object({email:z.string().max(254),expectedVersion:versionSchema,recipientId:idSchema.optional()}).strict(),
 revokeRecipient:z.object({recipientId:idSchema,expectedVersion:versionSchema}).strict(),
 issueRecipientVerification:z.object({recipientId:idSchema,expectedVersion:versionSchema}).strict(),
 confirmRecipientVerification:z.object({recipientId:idSchema,expectedVersion:versionSchema,token:z.string().max(1000)}).strict(),
 issueRecipientConsent:z.object({recipientId:idSchema,expectedVersion:versionSchema,expectedRevision:versionSchema.optional(),allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).min(1).max(3)}).strict(),
 confirmRecipientConsent:z.object({recipientId:idSchema,expectedVersion:versionSchema,expectedRevision:versionSchema.optional(),token:z.string().max(1000),explicitConsent:z.boolean()}).strict(),
 saveRecipientConsent:z.object({recipientId:idSchema,expectedRecipientVersion:versionSchema,expectedRevision:versionSchema,active:z.boolean(),allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).max(3).optional(),explicitConsent:z.literal(false).optional()}).strict()
};

export function createRecipientManagement({mutate,sendVerification}){
 const saveRecipient=(scope,input)=>mutate(scope,async({tx,scope:s,now})=>{
  const email=z.string().trim().toLowerCase().email().max(254).parse(input.email);if(/[,;\r\n]/.test(email))fail(400,'REPORT_RECIPIENT_INVALID');
  const rows=await tx.$queryRaw`SELECT "recipientId" FROM "AutomaticReportRecipient" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "revokedAt" IS NULL ORDER BY "recipientId" FOR UPDATE`;
  if(!input.recipientId){expected(0,input.expectedVersion);if(rows.length>=5)fail(409,'REPORT_RECIPIENT_LIMIT');
   const [previous]=await tx.$queryRaw`SELECT *,"version"::text AS "version" FROM "AutomaticReportRecipient" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "email"=${email} FOR UPDATE`;
   if(previous){if(!previous.revokedAt)fail(409,'REPORT_RECIPIENT_EXISTS');await invalidateStoreDispatchRecipients(tx,s,{beforeEmails:[],afterEmails:[email],now});await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "revokedAt"=NULL,"revokedBy"=NULL WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${previous.recipientId}`;return {recipientId:previous.recipientId,version:Number(increment(previous.version)),email,verifiedAt:null}}
   const id=randomBytes(16).toString('hex');await tx.$executeRaw`INSERT INTO "AutomaticReportRecipient" ("recipientId","companyId","storeId","email","createdBy","createdAt","updatedBy","updatedAt") VALUES (${id},${s.companyId},${s.storeId},${email},${s.actorId},${now},${s.actorId},${now})`;return {recipientId:id,version:1,email,verifiedAt:null}}
  const r=await locked(tx,s,input.recipientId);expected(r.version,input.expectedVersion);if(r.email===email)return {recipientId:r.recipientId,version:Number(r.version),email,verifiedAt:r.verifiedAt};
  await invalidateStoreDispatchRecipients(tx,s,{beforeEmails:[r.email],afterEmails:[email],now});
  await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "email"=${email} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
  return {recipientId:r.recipientId,version:Number(increment(r.version)),email,verifiedAt:null};
 });
 const revokeRecipient=(scope,input)=>mutate(scope,async({tx,scope:s,now})=>{const r=await locked(tx,s,input.recipientId);expected(r.version,input.expectedVersion);await invalidateStoreDispatchRecipients(tx,s,{beforeEmails:[r.email],afterEmails:[],now});await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "revokedAt"=${now},"revokedBy"=${s.actorId} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;return {revoked:true}});
 async function issue(scope,input,purpose){
  const pending=await mutate(scope,async({tx,scope:s,now,generation})=>{
   const r=await locked(tx,s,input.recipientId);expected(r.version,input.expectedVersion);if(r.challengeIssuedAt&&now-new Date(r.challengeIssuedAt)<60000)fail(409,'REPORT_CHALLENGE_COOLDOWN');
   const c=await consent(tx,s,r.recipientId);if(purpose==='CONSENT'&&input.expectedRevision!==undefined)expected(c?.revision,input.expectedRevision);const freqs=purpose==='CONSENT'?frequencies(input.allowedFrequencies):[];
   if(purpose==='CONSENT'&&(!r.verifiedAt||!freqs.length))fail(409,'REPORT_RECIPIENT_UNVERIFIED');
   const token=randomBytes(16).toString('hex'),nonce=randomBytes(16).toString('hex'),expiresAt=new Date(now.getTime()+600000);
   const challenge={...r,challengeNonce:nonce,challengePurpose:purpose,challengeFrequencies:freqs,challengeConsentRevision:String(c?.revision||0),challengeLifecycleGeneration:String(generation)};
   const hash=tokenHash(challenge,token);
   await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=${hash},"challengeNonce"=${nonce},"challengeRecipientVersion"=${BigInt(r.version)},"challengeLifecycleGeneration"=${BigInt(generation)},"challengeExpiresAt"=${expiresAt},"challengeIssuedAt"=${now},"challengeAttempts"=0,"challengePurpose"=${purpose},"challengeFrequencies"=${freqs}::text[],"challengeConsentRevision"=${BigInt(c?.revision||0)},"updatedBy"=${s.actorId},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
   return {scope:s,to:r.email,token,purpose,freqs,expiresAt:expiresAt.toISOString(),resendAfter:new Date(now.getTime()+60000).toISOString()};
  });
  let receipt;try{receipt=await sendVerification({companyId:pending.scope.companyId,storeId:pending.scope.storeId,to:pending.to,subject:pending.purpose==='VERIFY'?'Επαλήθευση email αναφορών':'Έγκριση προσωρινών αναφορών',text:`${pending.purpose==='VERIFY'?'Επαλήθευση διεύθυνσης email.':'Εγκρίνετε προσωρινές αναφορές, χωρίς πλήρη οικονομική συμφωνία. Συχνότητες: '+pending.freqs.join(', ')}\nΚωδικός: ${pending.token}\nΛήγει σε 10 λεπτά. Μοιραστείτε τον μόνο για τη συγκεκριμένη ενέργεια.`})}catch{fail(503,'REPORT_VERIFICATION_SEND_UNCONFIRMED')}
  if(!positiveReceipt(receipt,pending.to))fail(503,'REPORT_VERIFICATION_SEND_UNCONFIRMED');
  return {issued:true,expiresAt:pending.expiresAt,resendAfter:pending.resendAfter};
 }
 async function confirm(scope,input,purpose){
  const outcome=await mutate(scope,async({tx,scope:s,now,generation})=>{
   const r=await locked(tx,s,input.recipientId);expected(r.version,input.expectedVersion);const c=await consent(tx,s,r.recipientId);
   if(purpose==='CONSENT'&&input.expectedRevision!==undefined)expected(c?.revision,input.expectedRevision);
   const token=typeof input.token==='string'&&/^[a-f0-9]{32}$/.test(input.token)?input.token:'';
   const hash=tokenHash(r,token),valid=String(r.challengeLifecycleGeneration)===String(generation)&&token&&r.challengeHash&&r.challengePurpose===purpose&&r.challengeAttempts<5&&r.challengeExpiresAt&&now<new Date(r.challengeExpiresAt)&&String(r.challengeRecipientVersion)===String(r.version)&&String(r.challengeConsentRevision??0)===String(c?.revision||0)&&timingSafeEqual(Buffer.from(hash),Buffer.from(r.challengeHash));
   if(!valid||(purpose==='CONSENT'&&(!r.verifiedAt||input.explicitConsent!==true))){await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeAttempts"=LEAST("challengeAttempts"+1,5) WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;return {invalid:true}}
   if(purpose==='VERIFY')await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "verifiedAt"=${now},"verifiedBy"=${s.actorId} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
   else{const rev=increment(c?.revision);await tx.$executeRaw`INSERT INTO "AutomaticReportRecipientConsent" ("companyId","storeId","recipientId","revision","recipientVersion","active","allowedFrequencies","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES (${s.companyId},${s.storeId},${r.recipientId},${rev},${BigInt(r.version)},true,${r.challengeFrequencies}::text[],${BigInt(generation)},${s.actorId},${now},${r.challengeHash},${s.actorId},${now}) ON CONFLICT ("companyId","storeId","recipientId") DO UPDATE SET "revision"=EXCLUDED."revision","recipientVersion"=EXCLUDED."recipientVersion","active"=true,"allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","consentedBy"=EXCLUDED."consentedBy","consentedAt"=EXCLUDED."consentedAt","proofHash"=EXCLUDED."proofHash","revokedBy"=NULL,"revokedAt"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`}
   await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=NULL,"challengeNonce"=NULL,"challengePurpose"=NULL,"challengeFrequencies"=ARRAY[]::text[],"challengeExpiresAt"=NULL,"updatedBy"=${s.actorId},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
   return purpose==='VERIFY'?{verified:true,recipientVersion:Number(r.version)}:{consented:true,consentRevision:Number(increment(c?.revision))};
  });if(outcome.invalid)fail(400,'REPORT_CHALLENGE_INVALID');return outcome;
 }
 const saveRecipientConsent=(scope,input)=>mutate(scope,async({tx,scope:s,now})=>{if(input.active!==false)fail(400,'REPORT_CONSENT_CHALLENGE_REQUIRED');const r=await locked(tx,s,input.recipientId),c=await consent(tx,s,r.recipientId);expected(r.version,input.expectedRecipientVersion);expected(c?.revision,input.expectedRevision);if(!c)return {revoked:true};await tx.$executeRaw`UPDATE "AutomaticReportRecipientConsent" SET "active"=false,"revision"="revision"+1,"proofHash"=NULL,"revokedAt"=${now},"revokedBy"=${s.actorId},"updatedBy"=${s.actorId},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;return {revoked:true}});
 const api={saveRecipient,revokeRecipient,issueRecipientVerification:(s,i)=>issue(s,i,'VERIFY'),issueRecipientConsent:(s,i)=>issue(s,i,'CONSENT'),confirmRecipientVerification:(s,i)=>confirm(s,i,'VERIFY'),confirmRecipientConsent:(s,i)=>confirm(s,i,'CONSENT'),saveRecipientConsent};
 return Object.fromEntries(Object.entries(api).map(([key,fn])=>[key,(scope,input)=>fn(snapshotDispatchInput(scope),recipientSchemas[key].parse(snapshotDispatchInput(input)))]));
}
