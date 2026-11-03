import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {walletError} from './ai-owner-wallet-contract.js';
import {stableWalletJson} from './ai-wallet-customer-pricing.js';
import {lockPostpaidStore,lockPostpaidActor,postpaidGeneration} from './ai-wallet-postpaid-recipients.js';

const selection=z.object({storeId:z.string().trim().min(1).max(200),entryIds:z.array(z.string().uuid()).min(1).max(50)}).strict();
export const commercialWaiverSchema=selection.extend({version:z.number().int().nonnegative().max(2147483646),generation:z.string().regex(/^(0|[1-9]\d{0,18})$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid(),reason:z.string().trim().min(5).max(300),customerWaiverConfirmed:z.literal(true)}).strict();
const options={maxWait:5000,timeout:15000};
const fail=()=>{throw walletError('AI_WALLET_WAIVER_CHANGED',409)};
const hash=value=>createHash('sha256').update(stableWalletJson(JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v)))).digest('hex');
function selected(raw){const input=selection.parse(raw);if(new Set(input.entryIds).size!==input.entryIds.length)throw walletError('AI_WALLET_INVALID_INPUT',400);return {...input,entryIds:[...input.entryIds].sort()}}
export function publicCommercialWaiver(value){
 if(value?.type!=='COMMERCIAL_WAIVER'||value.providerCostStatus!=='UNKNOWN'||!/^\d{1,13}$/.test(value.releasedMicros||''))return null;
 return {type:'COMMERCIAL_WAIVER',providerCostStatus:'UNKNOWN',releasedMicros:value.releasedMicros};
}
export function createCommercialWaiver({db,ensure,lock}){
 async function boundary(tx,companyId,input,actorId,session){
  // Always use the same lifecycle/store -> actor -> wallet lock order as
  // existing financial administration. Browser generation is never upgraded.
  const event=postpaidGeneration(input.storeId);
  if(input.generation!==undefined&&event!==undefined&&event!==input.generation)fail();
  const context=await lockPostpaidStore(tx,{companyId,storeId:input.storeId,...(input.generation!==undefined?{generation:input.generation}:{})});
  await lockPostpaidActor(tx,actorId,session);
  return context;
 }
 async function snapshot(tx,companyId,input){
  const entries=[],evidence=[];let total=0n;
  // Sorted identities give deterministic locks and bind the original tariff,
  // usage and diagnostic evidence, not just a possibly coincidental amount.
  for(const id of input.entryIds){
   const [entry]=await tx.$queryRaw`SELECT * FROM "AiOwnerWalletEntry" WHERE "id"=${id} AND "companyId"=${companyId} AND "storeId"=${input.storeId} FOR UPDATE`;
   if(!entry||entry.kind!=='USAGE'||entry.status!=='REVIEW'||BigInt(entry.chargedMicros)!==0n||BigInt(entry.reservedMicros)<=0n||entry.resolutionReference!==null)fail();
   const audits=await tx.$queryRaw`SELECT "id","event","detail","createdAt" FROM "AiOwnerWalletAudit" WHERE "companyId"=${companyId} AND "detail"->>'id'=${id} ORDER BY "id"`;
   entries.push(entry);evidence.push({entry,audits});total+=BigInt(entry.reservedMicros);
  }
  return {entries,total,fingerprint:hash({companyId,storeId:input.storeId,evidence})};
 }
 async function previewCommercialWaiver(companyId,raw,actorId,session){
  const input=selected(raw);await ensure();return db.$transaction(async tx=>{
   const context=await boundary(tx,companyId,input,actorId,session);
   const [row]=await tx.$queryRaw`SELECT * FROM "AiOwnerWallet" WHERE "companyId"=${companyId} FOR UPDATE`;
   if(!row)fail();const s=await snapshot(tx,companyId,input);
   if(s.total>BigInt(row.reservedMicros))fail();
   return {companyId,storeId:input.storeId,generation:String(context.generation),version:row.version,entryIds:input.entryIds,fingerprint:s.fingerprint,releasedMicros:String(s.total),providerCostStatus:'UNKNOWN'};
  },options);
 }
 async function waiveCommercialReviews(companyId,raw,actorId,session){
  const parsed=commercialWaiverSchema.parse(raw),input={...parsed,...selected({storeId:parsed.storeId,entryIds:parsed.entryIds})};
  const identity={storeId:input.storeId,generation:input.generation,entryIds:input.entryIds,fingerprint:input.fingerprint,reason:input.reason};
  await ensure();return db.$transaction(async tx=>{
   await boundary(tx,companyId,input,actorId,session);const row=await lock(tx,companyId);
   const prior=await tx.$queryRaw`SELECT "actorId","detail" FROM "AiOwnerWalletAudit" WHERE "companyId"=${companyId} AND "event"='COMMERCIAL_WAIVER' AND "detail"->>'requestId'=${input.requestId}`;
   if(prior.length){
    if(prior.length!==1||prior[0].actorId!==actorId||stableWalletJson(prior[0].detail.identity)!==stableWalletJson(identity))fail();
    return {requestId:input.requestId,releasedMicros:prior[0].detail.releasedMicros,replayed:true};
   }
   if(row.version!==input.version)fail();const s=await snapshot(tx,companyId,input);
   if(s.fingerprint!==input.fingerprint||s.total>BigInt(row.reservedMicros))fail();
   for(const entry of s.entries){
    const waiver={type:'COMMERCIAL_WAIVER',providerCostStatus:'UNKNOWN',releasedMicros:String(entry.reservedMicros),requestId:input.requestId,reason:input.reason,previousActorId:entry.actorId};
    // Zero is the CUSTOMER charge, never a claim that the supplier cost was
    // zero. Preserve any original usage and all original tariff/hold evidence.
    const usage={...(entry.usage||{}),commercialWaiver:waiver};
    await tx.$executeRaw`UPDATE "AiOwnerWalletEntry" SET "status"='SETTLED',"chargedMicros"=0,"usage"=${JSON.stringify(usage)}::jsonb,"actorId"=${actorId},"resolutionReference"=${'WAIVER/'+input.requestId},"settledAt"=NOW() WHERE "id"=${entry.id} AND "companyId"=${companyId} AND "storeId"=${input.storeId} AND "status"='REVIEW'`;
   }
   await tx.$executeRaw`UPDATE "AiOwnerWallet" SET "reservedMicros"="reservedMicros"-${s.total},"version"="version"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId}`;
   await tx.$executeRaw`INSERT INTO "AiOwnerWalletAudit" ("id","companyId","actorId","event","detail") VALUES (${randomUUID()},${companyId},${actorId},'COMMERCIAL_WAIVER',${JSON.stringify({requestId:input.requestId,identity,releasedMicros:String(s.total),customerChargeMicros:'0',providerCostStatus:'UNKNOWN',version:row.version+1})}::jsonb)`;
   return {requestId:input.requestId,releasedMicros:String(s.total),replayed:false};
  },options);
 }
 return {previewCommercialWaiver,waiveCommercialReviews};
}
