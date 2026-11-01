import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {MAX_WALLET_MICROS,positiveMicros,walletError} from './ai-owner-wallet-contract.js';
import {stableWalletJson} from './ai-wallet-customer-pricing.js';
import {lockPostpaidStore,lockPostpaidActor,readPostpaidRecipients,publicPostpaidRecipients,postpaidGeneration,postpaidHash,postpaidRecipientMarker} from './ai-wallet-postpaid-recipients.js';

const ref=z.string().trim().min(5).max(160).regex(/^[\p{L}\p{N}_.:/ -]+$/u);
const amount=z.string().regex(/^\d{1,13}$/);
const version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
export const postpaidGrantSchema=z.object({version,storeId:z.string().trim().min(1).max(200),generation:z.string().regex(/^(0|[1-9]\d{0,18})$/),amountMicros:amount,reference:ref,reason:z.string().trim().min(5).max(300),sendNotifications:z.boolean(),recipientFingerprint:z.string().regex(/^[a-f0-9]{64}$/).nullable(),unpaidCreditConfirmed:z.literal(true)}).strict();
export const postpaidPaymentSchema=z.object({version,creditEntryId:z.string().uuid(),amountMicros:amount,receiptReference:ref,receiptConfirmed:z.literal(true)}).strict();
const grantMetadata=z.object({type:z.literal('CREDIT_ON_ACCOUNT'),reason:z.string().min(5).max(300),reference:ref,storeId:z.string().min(1).max(200),generation:z.string().regex(/^(0|[1-9]\d{0,18})$/),sendNotifications:z.boolean(),recipientFingerprint:z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict();
const paymentMetadata=z.object({type:z.literal('DEBT_PAYMENT'),creditEntryId:z.string().uuid(),amountMicros:amount,receiptReference:ref}).strict();
const normalized=value=>value.trim().normalize('NFC').toUpperCase();
const fail=()=>{throw walletError('AI_WALLET_POSTPAID_INVALID')};
export function publicPostpaidActivity(value){
 const g=grantMetadata.safeParse(value);if(g.success)return {type:g.data.type,reference:g.data.reference};
 const p=paymentMetadata.safeParse(value);if(p.success)return {type:p.data.type,creditEntryId:p.data.creditEntryId,amountMicros:p.data.amountMicros,receiptReference:p.data.receiptReference};
 return null;
}
// All historical rows contribute to totals. Keep every unpaid grant selectable
// for settlement, plus the newest100 paid grants. Usage never pays the debt.
export function projectPostpaidDebt(rows){
 const grants=new Map(),payments=[];let issued=0n,paid=0n;
 for(const row of rows){
  if(row.kind!=='CREDIT'||row.status!=='CREDITED')fail();
  if(row.feature==='POSTPAID_GRANT'){
   const data=grantMetadata.safeParse(row.postpaid);if(!data.success||grants.has(row.id)||row.storeId!=null)fail();
   const credit=positiveMicros(String(row.creditedMicros));issued+=credit;
   grants.set(row.id,{id:row.id,recipientStoreId:data.data.storeId,reference:data.data.reference,reason:data.data.reason,amountMicros:String(credit),paidMicros:'0',outstandingMicros:String(credit),createdAt:row.createdAt,status:'UNPAID'});
  }else if(row.feature==='POSTPAID_PAYMENT'){
   const data=paymentMetadata.safeParse(row.postpaid);if(!data.success||String(row.creditedMicros)!=='0'||row.storeId!=null)fail();payments.push(data.data);
  }else fail();
 }
 for(const p of payments){const g=grants.get(p.creditEntryId);if(!g)fail();const value=positiveMicros(p.amountMicros),next=BigInt(g.paidMicros)+value;if(next>BigInt(g.amountMicros))fail();g.paidMicros=String(next);g.outstandingMicros=String(BigInt(g.amountMicros)-next);g.status=g.outstandingMicros==='0'?'PAID':'PARTIAL';paid+=value;}
 const outstanding=issued-paid;if(outstanding<0n||outstanding>MAX_WALLET_MICROS)fail();
 const all=[...grants.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||b.id.localeCompare(a.id));
 return {balanceScope:'COMPANY',issuedMicros:String(issued),paidMicros:String(paid),outstandingMicros:String(outstanding),grantCount:all.length,grants:[...all.filter(g=>g.status!=='PAID'),...all.filter(g=>g.status==='PAID').slice(0,100)]};
}
export async function readPostpaidDebt(db,companyId){
 const rows=await db.$queryRaw`SELECT "id","storeId","kind","status","feature","creditedMicros","createdAt","usage"->'postpaid' AS "postpaid" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND "feature" IN ('POSTPAID_GRANT','POSTPAID_PAYMENT') ORDER BY "createdAt","id"`;
 return projectPostpaidDebt(rows);
}
const txOptions={maxWait:5000,timeout:15000};
const busy=error=>{
 if(error?.code==='55P03'||error?.meta?.code==='55P03'||error?.code==='REPORT_DISPATCH_BUSY'||error?.code==='STORE_LIFECYCLE_MAINTENANCE')throw walletError('AI_WALLET_POSTPAID_BUSY');
 if(error?.code==='STORE_LIFECYCLE_STALE_GENERATION')throw walletError('AI_WALLET_CHANGED');
 throw error;
};
export function createPostpaidWallet({db,ensure,lock}){
 async function postpaidRecipients(companyId,storeId,actorId,session){
  const generation=postpaidGeneration(storeId);await ensure();
  return db.$transaction(async tx=>{const scope={companyId,storeId,generation},context=await lockPostpaidStore(tx,scope);await lockPostpaidActor(tx,actorId,session);return publicPostpaidRecipients(context,await readPostpaidRecipients(tx,{...scope,generation:context.generation}));},txOptions).catch(busy);
 }
 async function grantPostpaid(companyId,raw,actorId,session){
  const input=postpaidGrantSchema.parse(raw),value=positiveMicros(input.amountMicros),reference='POSTPAID/'+normalized(input.reference),generation=input.generation;
  const eventGeneration=postpaidGeneration(input.storeId);
  if(eventGeneration!==undefined&&eventGeneration!==generation)throw walletError('AI_WALLET_CHANGED');
  const metadata={type:'CREDIT_ON_ACCOUNT',reason:input.reason,reference:normalized(input.reference),storeId:input.storeId,generation:String(generation),sendNotifications:input.sendNotifications,recipientFingerprint:input.recipientFingerprint};
  if(!input.sendNotifications&&input.recipientFingerprint!==null)throw walletError('AI_WALLET_INVALID_INPUT',400);
  await ensure();return db.$transaction(async tx=>{
   const scope={companyId,storeId:input.storeId,generation};await lockPostpaidStore(tx,scope);await lockPostpaidActor(tx,actorId,session);
   const source=input.sendNotifications?await readPostpaidRecipients(tx,scope):null;
   const row=await lock(tx,companyId);
   const [existing]=await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "kind"='CREDIT' AND "reference"=${reference}`;
   if(existing){if(existing.companyId!==companyId||existing.feature!=='POSTPAID_GRANT'||String(existing.creditedMicros)!==String(value)||stableWalletJson(existing.usage?.postpaid)!==stableWalletJson(metadata))throw walletError('AI_WALLET_RECEIPT_CONFLICT');return {id:existing.id,replayed:true}}
   if(row.version!==input.version)throw walletError('AI_WALLET_CHANGED');
   const debt=await readPostpaidDebt(tx,companyId);
   if(BigInt(row.balanceMicros)+value>MAX_WALLET_MICROS||BigInt(debt.outstandingMicros)+value>MAX_WALLET_MICROS)throw walletError('AI_WALLET_LIMIT',400);
   if(source&&(!source.recipients.length||source.fingerprint!==input.recipientFingerprint))throw walletError('AI_WALLET_POSTPAID_RECIPIENTS_CHANGED');
   const id=randomUUID(),cycleId=randomUUID(),nextBalance=BigInt(row.balanceMicros)+value,outstanding=BigInt(debt.outstandingMicros)+value;
   // Funding stays company-owned exactly like prepaid/trial credits. The
   // recipient store is provenance inside metadata, never ledger ownership.
   await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros","feature","usage","actorId") VALUES (${id},${companyId},'CREDIT',${reference},'CREDITED',${value},'POSTPAID_GRANT',${JSON.stringify({postpaid:metadata})}::jsonb,${actorId})`;
   await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "balanceMicros"="balanceMicros"+${value},"lastCreditMicros"=${value},"cycleId"=${cycleId},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
   await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'POSTPAID_CREDIT_GRANTED',${JSON.stringify({entryId:id,amountMicros:String(value),outstandingMicros:String(outstanding),...metadata})}::jsonb)`;
   for(const recipient of source?.recipients||[]){
    const noticeId=randomUUID(),noticeCycle=postpaidHash(['MWS_AI_POSTPAID_NOTICE_V1',id,recipient.recipientId]);
    const proof={v:1,noticeId,entryId:id,companyId,storeId:input.storeId,generation:String(generation),recipientId:recipient.recipientId,email:recipient.email,recipientFingerprint:source.fingerprint,actorId,actorSessionVersion:session.sessionVersion};
    await tx.$executeRaw`INSERT INTO "AiOwnerWalletNotice" ("id","companyId","kind","cycleId","balanceMicros","amountMicros","ownerId","email","emailStatus") VALUES (${noticeId},${companyId},'CREDIT',${noticeCycle},${nextBalance},${value},${postpaidRecipientMarker+recipient.recipientId},${recipient.email},'PENDING')`;
    await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'POSTPAID_NOTICE_PREPARED',${JSON.stringify(proof)}::jsonb)`;
   }
   return {id,replayed:false,noticesPrepared:source?.recipients.length||0,outstandingMicros:String(outstanding)};
  },txOptions).catch(busy);
 }
 async function payPostpaid(companyId,raw,actorId,session){
  const input=postpaidPaymentSchema.parse(raw),value=positiveMicros(input.amountMicros),reference=normalized(input.receiptReference);
  if(reference.startsWith('TRIAL/')||reference.startsWith('POSTPAID/'))throw walletError('AI_WALLET_RESERVED_REFERENCE',400);
  await ensure();
  const [original]=await db.$queryRaw`SELECT "id" FROM "AiOwnerWalletEntry" WHERE "id"=${input.creditEntryId} AND "companyId"=${companyId} AND "feature"='POSTPAID_GRANT' AND "kind"='CREDIT' AND "status"='CREDITED'`;
  if(!original)throw walletError('AI_WALLET_SCOPE_DENIED',404);
  const metadata={type:'DEBT_PAYMENT',creditEntryId:input.creditEntryId,amountMicros:String(value),receiptReference:reference};
  return db.$transaction(async tx=>{
   // Repayment belongs to the company, including after the originating store
   // closes. A NULL storeId is the existing company-level CREDIT boundary;
   // it never resurrects or mutates a retired store or its balance.
   const [company]=await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${companyId} AND "active"=TRUE FOR SHARE NOWAIT`;
   if(!company)throw walletError('AI_WALLET_SCOPE_DENIED',404);
   await lockPostpaidActor(tx,actorId,session);const row=await lock(tx,companyId);
   const [existing]=await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "kind"='CREDIT' AND "reference"=${reference}`;
   if(existing){if(existing.companyId!==companyId||existing.feature!=='POSTPAID_PAYMENT'||stableWalletJson(existing.usage?.postpaid)!==stableWalletJson(metadata))throw walletError('AI_WALLET_RECEIPT_CONFLICT');return {id:existing.id,replayed:true}}
   if(row.version!==input.version)throw walletError('AI_WALLET_CHANGED');
   // This grant may be older than the displayed100; always read its full debt.
   const entries=await tx.$queryRaw`SELECT "id","storeId","kind","status","feature","creditedMicros","createdAt","usage"->'postpaid' AS "postpaid" FROM "AiOwnerWalletEntry" WHERE "companyId"=${companyId} AND ("id"=${input.creditEntryId} OR ("feature"='POSTPAID_PAYMENT' AND "usage"->'postpaid'->>'creditEntryId'=${input.creditEntryId}))`;
   const debt=projectPostpaidDebt(entries),grant=debt.grants.find(g=>g.id===input.creditEntryId);
   if(!grant||value>BigInt(grant.outstandingMicros))throw walletError('AI_WALLET_POSTPAID_OVERPAYMENT',400);
   const id=randomUUID();
   // A unique CREDIT reference reserves the real receipt globally, but its
   // zero credited amount NEVER funds the AI balance a second time.
   await tx.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","kind","reference","status","creditedMicros","feature","usage","actorId") VALUES (${id},${companyId},'CREDIT',${reference},'CREDITED',0,'POSTPAID_PAYMENT',${JSON.stringify({postpaid:metadata})}::jsonb,${actorId})`;
   await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
   await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'POSTPAID_PAYMENT_RECORDED',${JSON.stringify({entryId:id,...metadata})}::jsonb)`;
   return {id,replayed:false,remainingMicros:String(BigInt(grant.outstandingMicros)-value)};
  },txOptions).catch(busy);
 }
 async function claimPostpaidNotice(noticeId){
  const revoke=async()=>{await db.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='REVOKED' WHERE "id"=${noticeId} AND "emailStatus"='PENDING'`;return {revoked:true}};
  const audits=await db.$queryRaw`SELECT "companyId","actorId","detail" FROM "AiOwnerWalletAudit" WHERE "event"='POSTPAID_NOTICE_PREPARED' AND "detail"->>'noticeId'=${noticeId} AND "companyId"=(SELECT "companyId" FROM "AiOwnerWalletNotice" WHERE "id"=${noticeId})`;
  const audit=audits.length===1?audits[0]:null;
  const p=audit?.detail;
  if(!p||p.v!==1||p.noticeId!==noticeId||!p.storeId||!p.companyId||audit.companyId!==p.companyId||audit.actorId!==p.actorId)return revoke();
  try{return await db.$transaction(async tx=>{
   const scope={companyId:p.companyId,storeId:p.storeId,generation:p.generation};await lockPostpaidStore(tx,scope);await lockPostpaidActor(tx,p.actorId,{sessionVersion:p.actorSessionVersion,establishedAuthority:true});
   const source=await readPostpaidRecipients(tx,scope);const row=await lock(tx,p.companyId);
   const [item]=await tx.$queryRaw`SELECT * FROM "AiOwnerWalletNotice" WHERE "id"=${noticeId} AND "companyId"=${p.companyId} AND "emailStatus"='PENDING' FOR UPDATE SKIP LOCKED`;
   if(!item)return null;
   const recipient=source.recipients.find(r=>r.recipientId===p.recipientId&&r.email===p.email);
   const [entry]=await tx.$queryRaw`SELECT "id","companyId","storeId","kind","status","feature","creditedMicros","createdAt","actorId","usage"->'postpaid' AS "postpaid" FROM "AiOwnerWalletEntry" WHERE "id"=${p.entryId} AND "companyId"=${p.companyId}`;
   if(!recipient||source.fingerprint!==p.recipientFingerprint||item.cycleId!==postpaidHash(['MWS_AI_POSTPAID_NOTICE_V1',p.entryId,p.recipientId])||item.ownerId!==postpaidRecipientMarker+p.recipientId||item.email!==p.email||item.kind!=='CREDIT'||!entry||entry.feature!=='POSTPAID_GRANT'||entry.storeId!==null||entry.actorId!==p.actorId||entry.postpaid?.generation!==p.generation||entry.postpaid?.storeId!==p.storeId||String(entry.creditedMicros)!==String(item.amountMicros)||entry.postpaid?.sendNotifications!==true||entry.postpaid?.recipientFingerprint!==source.fingerprint){await tx.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='REVOKED' WHERE "id"=${noticeId}`;return {revoked:true}}
   const debt=await readPostpaidDebt(tx,p.companyId);
   const payments=await tx.$queryRaw`SELECT "id","storeId","kind","status","feature","creditedMicros","createdAt","usage"->'postpaid' AS "postpaid" FROM "AiOwnerWalletEntry" WHERE "companyId"=${p.companyId} AND "feature"='POSTPAID_PAYMENT' AND "usage"->'postpaid'->>'creditEntryId'=${p.entryId}`;
   const ownDebt=projectPostpaidDebt([entry,...payments]);
   await tx.$executeRaw`UPDATE "AiOwnerWalletNotice" SET "emailStatus"='ATTEMPTING',"attemptedAt"=NOW(),"messageId"=${'attempt-'+randomUUID()} WHERE "id"=${noticeId}`;
   return {...item,postpaid:{amountDueMicros:ownDebt.outstandingMicros,totalDueMicros:debt.outstandingMicros,availableMicros:String(BigInt(row.balanceMicros)-BigInt(row.reservedMicros)),reference:entry.postpaid.reference}};
  },txOptions)}catch(error){
   // Unavailable DB/lock is not evidence of revoked authorization. Preserve
   // PENDING until it can be checked, never retry a committed ATTEMPTING send.
   if(['AI_WALLET_ROLE_DENIED','AI_WALLET_SCOPE_DENIED','AI_WALLET_POSTPAID_INVALID','STORE_LIFECYCLE_STALE_GENERATION','STORE_LIFECYCLE_MAINTENANCE'].includes(error?.code))return revoke();
   throw error;
  }
 }
 return {postpaidRecipients,grantPostpaid,payPostpaid,claimPostpaidNotice};
}
