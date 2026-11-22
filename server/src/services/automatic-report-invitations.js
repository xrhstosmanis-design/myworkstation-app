import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {snapshotDispatchInput,positiveReceipt} from './automatic-report-recipients.js';
import {lockAutomaticReportBoundary} from './automatic-report-lock-boundary.js';

const fail=(status=400,code='REPORT_INVITATION_INVALID')=>{throw Object.assign(new Error('Η πρόσκληση δεν είναι διαθέσιμη. Ζήτησε νέα πρόσκληση από τον υπεύθυνο.'),{status,code})};
const id=z.string().min(1).max(200).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const generation=z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v=>BigInt(v)<=9223372036854775807n);
const proofSchema=z.object({companyId:id,storeId:id,recipientId:id,version,generation,nonce:z.string().regex(/^[a-f0-9]{32}$/),issuedAt:z.string().datetime(),token:z.string().regex(/^[a-f0-9]{32}$/)}).strict();
const issueSchema=z.object({email:z.string().trim().toLowerCase().email().max(254).refine(v=>!/[\r\n,;]/.test(v)),recipientId:id.optional(),expectedVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),allowedFrequencies:z.array(z.enum(['DAILY','WEEKLY','MONTHLY'])).min(1).max(3).refine(v=>new Set(v).size===v.length)}).strict();
export const defaultInvitationOrigin='https://myworkstation-app.onrender.com';
export function trustedInvitationOrigin(value=defaultInvitationOrigin){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new TypeError('Invalid trusted invitation origin');return u.origin;
}
export function parseInvitation(value){
 try{if(typeof value==='string'){if(value.length>4000)fail();value=JSON.parse(value.startsWith('%')?decodeURIComponent(value):value)}return proofSchema.parse(snapshotDispatchInput(value))}catch{fail()}
}
export function invitationUrl(value,origin=defaultInvitationOrigin){return `${trustedInvitationOrigin(origin)}/api/report-invitations#${encodeURIComponent(JSON.stringify(parseInvitation(value)))}`}
export function invitationHash(r,token){return createHash('sha256').update(JSON.stringify(['MWS_REPORT_INVITATION_V1',r.companyId,r.storeId,r.recipientId,String(r.version),String(r.challengeLifecycleGeneration),r.challengeNonce,r.challengePurpose,[...r.challengeFrequencies].sort(),String(r.challengeConsentRevision??0),token])).digest('hex')}
const sorted=v=>[...v].sort();
const currentConsent=(r,c,g,f)=>!!r.verifiedAt&&!r.revokedAt&&c?.active&&String(c.recipientVersion)===String(r.version)&&String(c.lifecycleGeneration)===String(g)&&f.every(x=>c.allowedFrequencies.includes(x));
const sameHash=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const nextRevision=v=>{const n=BigInt(v||0)+1n;if(n>9007199254740991n)fail(409,'REPORT_REVISION_EXHAUSTED');return n};

// Public callers never acquire an administrator identity. The only authority is
// the exact unexpired mailbox proof, with the same global lock order as writers.
export function createAutomaticReportInvitations({db,mutate,readAuthorization,schemaReady,sendInvitation,clock=()=>new Date(),origin=defaultInvitationOrigin}){
 origin=trustedInvitationOrigin(origin);
 async function issue(scope,value){
  const input=issueSchema.parse(snapshotDispatchInput(value));
  const pending=await mutate(scope,async({tx,scope:s,now,generation,records})=>{
   let pair=records.recipients.find(x=>input.recipientId?x.recipient.recipientId===input.recipientId:x.recipient.email===input.email);
   if(input.recipientId&&!pair)fail(404,'REPORT_RECIPIENT_NOT_FOUND');
   let r=pair?.recipient,c=pair?.consent;
   if(r){if(r.email!==input.email||String(r.version)!==String(input.expectedVersion))fail(409,'REPORT_REVISION_CHANGED')}
   else{
    if(input.expectedVersion!==0)fail(409,'REPORT_REVISION_CHANGED');
    if(records.recipients.length>=5)fail(409,'REPORT_RECIPIENT_LIMIT');
    // Revoked identities must use the existing explicit re-add workflow; never
    // silently resurrect old verification, consent or delivery authority.
    const old=await tx.$queryRaw`SELECT "recipientId" FROM "AutomaticReportRecipient" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "email"=${input.email} FOR UPDATE`;
    if(old.length)fail(409,'REPORT_RECIPIENT_REVOKED');
    r={companyId:s.companyId,storeId:s.storeId,recipientId:randomBytes(16).toString('hex'),email:input.email,version:'1'};
    await tx.$executeRaw`INSERT INTO "AutomaticReportRecipient" ("recipientId","companyId","storeId","email","createdBy","createdAt","updatedBy","updatedAt") VALUES (${r.recipientId},${s.companyId},${s.storeId},${r.email},${s.actorId},${now},${s.actorId},${now})`;
   }
   const freqs=sorted(input.allowedFrequencies);
   if(currentConsent(r,c,generation,freqs))return {alreadyConfirmed:true,recipientId:r.recipientId};
   if(r.challengeIssuedAt&&now-new Date(r.challengeIssuedAt)<60000)fail(409,'REPORT_CHALLENGE_COOLDOWN');
   const token=randomBytes(16).toString('hex'),nonce=randomBytes(16).toString('hex'),expiresAt=new Date(now.getTime()+600000);
   // CONSENT is the existing physical enum. The distinct hash domain prevents
   // legacy verification/consent endpoints from consuming this combined proof.
   const challenge={...r,challengeNonce:nonce,challengePurpose:'CONSENT',challengeFrequencies:freqs,challengeConsentRevision:String(c?.revision||0),challengeLifecycleGeneration:String(generation)};
   const hash=invitationHash(challenge,token);
   await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=${hash},"challengeNonce"=${nonce},"challengeRecipientVersion"=${BigInt(r.version)},"challengeLifecycleGeneration"=${BigInt(generation)},"challengeExpiresAt"=${expiresAt},"challengeIssuedAt"=${now},"challengeAttempts"=0,"challengePurpose"='CONSENT',"challengeFrequencies"=${freqs}::text[],"challengeConsentRevision"=${BigInt(c?.revision||0)},"updatedBy"=${s.actorId},"updatedAt"=${now} WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "recipientId"=${r.recipientId}`;
   return {to:r.email,scope:s,proof:{companyId:s.companyId,storeId:s.storeId,recipientId:r.recipientId,version:Number(r.version),generation:String(generation),nonce,issuedAt:now.toISOString(),token},freqs,expiresAt:expiresAt.toISOString()};
  });
  if(pending.alreadyConfirmed)return {saved:true,alreadyConfirmed:true,recipientId:pending.recipientId};
  let receipt;
  try{receipt=await sendInvitation({companyId:pending.scope.companyId,storeId:pending.scope.storeId,to:pending.to,subject:'Πρόσκληση αναφορών MyWorkStation',text:`Επιβεβαίωσε ότι θέλεις να λαμβάνεις προσωρινές αναφορές για το συγκεκριμένο κατάστημα. Δεν αποτελούν πλήρη οικονομική συμφωνία ή χρέωση εργαζομένου. Περίοδοι: ${pending.freqs.map(f=>({DAILY:'Ημερήσια',WEEKLY:'Εβδομαδιαία',MONTHLY:'Μηνιαία'})[f]).join(', ')}.\nΆνοιξε τον σύνδεσμο και πάτησε ρητά Επιβεβαίωση:\n${invitationUrl(pending.proof,origin)}\nΙσχύει για 10 λεπτά. Αν δεν ζήτησες αναφορές, αγνόησέ το.`})}catch{fail(503,'REPORT_VERIFICATION_SEND_UNCONFIRMED')}
  if(!positiveReceipt(receipt,pending.to))fail(503,'REPORT_VERIFICATION_SEND_UNCONFIRMED');
  return {saved:true,invitationIssued:true,expiresAt:pending.expiresAt};
 }
 async function withProof(value,confirm){
  const proof=parseInvitation(value);
  const result=await db.$transaction(async tx=>{
   if(!await schemaReady(tx))fail();
   const scope={companyId:proof.companyId,storeId:proof.storeId};
   const state=await lockAutomaticReportBoundary(tx,{...scope,expectedGeneration:proof.generation});
   const [store]=await tx.$queryRaw`SELECT "id","name" FROM "Store" WHERE "id"=${scope.storeId} AND "companyId"=${scope.companyId} AND "active"=true FOR NO KEY UPDATE NOWAIT`;
   if(!store)fail();
   const records=await readAuthorization(tx,scope),pair=records.recipients.find(x=>x.recipient.recipientId===proof.recipientId),r=pair?.recipient,c=pair?.consent;
   const now=new Date(clock());if(!Number.isFinite(now.getTime()))fail();
   const sameChallenge=r&&!r.revokedAt&&String(r.version)===String(proof.version)&&String(r.challengeRecipientVersion)===String(r.version)&&String(r.challengeLifecycleGeneration)===state.generation&&r.challengePurpose==='CONSENT'&&r.challengeNonce===proof.nonce&&r.challengeIssuedAt&&new Date(r.challengeIssuedAt).toISOString()===proof.issuedAt&&String(r.challengeConsentRevision??0)===String(c?.revision||0)&&r.challengeHash&&r.challengeExpiresAt&&now<new Date(r.challengeExpiresAt);
   const valid=sameChallenge&&Array.isArray(r.challengeFrequencies)&&r.challengeFrequencies.length>0&&r.challengeFrequencies.every(x=>['DAILY','WEEKLY','MONTHLY'].includes(x))&&r.challengeAttempts<5&&sameHash(r.challengeHash,invitationHash(r,proof.token));
   // An old/replaced/revoked link cannot spend attempts on a newer challenge.
   if(!valid){if(confirm&&sameChallenge)await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeAttempts"=LEAST("challengeAttempts"+1,5) WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "recipientId"=${proof.recipientId}`;return {invalid:true}}
   if(!confirm)return {storeName:store.name,email:r.email,allowedFrequencies:sorted(r.challengeFrequencies),expiresAt:new Date(r.challengeExpiresAt).toISOString()};
   const actor=`report-recipient:${r.recipientId}`,rev=nextRevision(c?.revision);
   await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "verifiedAt"=COALESCE("verifiedAt",${now}),"verifiedBy"=CASE WHEN "verifiedAt" IS NULL THEN ${actor} ELSE "verifiedBy" END,"updatedBy"=${actor},"updatedAt"=${now} WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "recipientId"=${r.recipientId}`;
   await tx.$executeRaw`INSERT INTO "AutomaticReportRecipientConsent" ("companyId","storeId","recipientId","revision","recipientVersion","active","allowedFrequencies","lifecycleGeneration","consentedBy","consentedAt","proofHash","updatedBy","updatedAt") VALUES (${scope.companyId},${scope.storeId},${r.recipientId},${rev},${BigInt(r.version)},true,${r.challengeFrequencies}::text[],${BigInt(state.generation)},${actor},${now},${r.challengeHash},${actor},${now}) ON CONFLICT ("companyId","storeId","recipientId") DO UPDATE SET "revision"=EXCLUDED."revision","recipientVersion"=EXCLUDED."recipientVersion","active"=true,"allowedFrequencies"=EXCLUDED."allowedFrequencies","lifecycleGeneration"=EXCLUDED."lifecycleGeneration","consentedBy"=EXCLUDED."consentedBy","consentedAt"=EXCLUDED."consentedAt","proofHash"=EXCLUDED."proofHash","revokedBy"=NULL,"revokedAt"=NULL,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=EXCLUDED."updatedAt"`;
   await tx.$executeRaw`UPDATE "AutomaticReportRecipient" SET "challengeHash"=NULL,"challengeNonce"=NULL,"challengePurpose"=NULL,"challengeFrequencies"=ARRAY[]::text[],"challengeExpiresAt"=NULL,"updatedBy"=${actor},"updatedAt"=${now} WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "recipientId"=${r.recipientId}`;
   return {confirmed:true};
  },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000}).catch(error=>{if(['55P03','42P01'].includes(error?.code)||['55P03','42P01'].includes(error?.meta?.code))fail(409,'REPORT_DISPATCH_BUSY');throw error});
  if(result.invalid)fail();return result;
 }
 return Object.freeze({issue,inspect:value=>withProof(value,false),confirm:value=>{const checked=z.object({invitation:z.unknown(),explicitConsent:z.literal(true)}).strict().parse(snapshotDispatchInput(value));return withProof(checked.invitation,true)}});
}
