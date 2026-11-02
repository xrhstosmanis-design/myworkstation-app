import {createHash} from 'node:crypto';
import {z} from 'zod';
import {previewSharedCost,sharedCostExampleCompanies} from '../../../client/src/components/platform/shared-cost-preview.mjs';
import {summarizeSharedCostReview,sharedCostReviewDecisions} from '../../../client/src/components/platform/shared-cost-review.mjs';
import {lockPostpaidActor,lockPostpaidStore} from './ai-wallet-postpaid-recipients.js';

const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reference=z.string().trim().min(5).max(160).regex(/^[\p{L}\p{N}_.:/ -]+$/u);
export const reviewIdentitySchema=z.object({mode:z.enum(['SYNTHETIC','COMMERCIAL']),period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),proposalReference:reference}).strict();
const inputSchema=z.object({period:z.string(),amount:z.string().max(16),reference:z.string().max(240),confirmed:z.literal(true),participants:z.array(z.object({storeId:z.string().min(1).max(160),days:z.string().regex(/^[1-9]\d?$/)}).strict()).min(1).max(100)}).strict();
export const reviewPreviewSchema=reviewIdentitySchema.extend({input:inputSchema}).strict();
export const reviewSaveSchema=reviewPreviewSchema.extend({expectedVersion:z.number().int().min(0).max(1000000),quoteHash:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid(),decisions:z.record(z.enum(sharedCostReviewDecisions)),reviewConfirmed:z.literal(true)}).strict();
const action='SHARED_COST_REVIEW_SAVED';
const targetType=mode=>'SHARED_COST_REVIEW_'+mode;
const proposalId=identity=>hash(['MWS_SHARED_REVIEW_V1',identity.mode,identity.period,identity.proposalReference]);
const eventId=requestId=>'shared-review:'+hash(requestId);
function nativeActor(actor){
 if(!actor?.id||!actor.sessionId||actor.supportContext||!(actor.isSuperAdmin===true||actor.platformRole==='SUPER_ADMIN'))fail('SHARED_REVIEW_ROLE_DENIED',403);
 // Never pass the internal establishedAuthority shortcut to the lock helper.
 return {sessionId:actor.sessionId,sessionVersion:actor.sessionVersion};
}
function publicEvent(row){
 return {id:row.id,savedAt:new Date(row.createdAt).toISOString(),actorId:row.actorUserId,actorName:row.actorName,...row.details.snapshot,posted:false};
}
// Audit references are globally retained, non-owning metadata, never financial entries.
// No schema provisioning, report authorization, wallet or provider calls here.
export function createSharedCostReviews(db){
 const transaction=work=>db.$transaction(work,{maxWait:5000,timeout:30000});
 const authorize=(tx,actor)=>lockPostpaidActor(tx,actor.id,nativeActor(actor));
 async function lockProposal(tx,id){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ 'shared-review:'+id },0))`}
 async function latest(tx,identity){
  const rows=await tx.$queryRaw`SELECT "id","actorUserId","actorName","details","createdAt" FROM "PlatformAudit" WHERE "action"=${action} AND "targetType"=${targetType(identity.mode)} AND "targetId"=${proposalId(identity)} ORDER BY ("details"->'snapshot'->>'version')::integer DESC LIMIT 20`;
  return rows;
 }
 async function calculate(tx,data,actor){
  let catalogue=sharedCostExampleCompanies,generations=[];
  if(data.mode==='COMMERCIAL'){
   catalogue=[];
   // Prevent test/demo enrollment changing between eligibility check and INSERT.
   await tx.$executeRawUnsafe('LOCK TABLE "CustomerDemo" IN SHARE MODE NOWAIT');
   const selected=[...data.input.participants].sort((a,b)=>a.storeId.localeCompare(b.storeId));
   if(new Set(selected.map(r=>r.storeId)).size!==selected.length)fail('SHARED_REVIEW_INVALID',400);
   for(const item of selected){
    const [row]=await tx.$queryRaw`SELECT s."id",s."companyId",c."name" AS "companyName" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${item.storeId} AND s."active"=TRUE AND c."active"=TRUE AND c."id"<>'cmtpopbgk000prhb5qc60zxus' AND NOT EXISTS(SELECT 1 FROM "CustomerDemo" d WHERE d."companyId"=c."id" OR d."storeId"=s."id")`;
    if(!row)fail('SHARED_REVIEW_SCOPE_DENIED',404);
    const locked=await lockPostpaidStore(tx,{companyId:row.companyId,storeId:row.id});
    const [company]=await tx.$queryRaw`SELECT "name" FROM "Company" WHERE "id"=${row.companyId} AND "active"=TRUE FOR SHARE NOWAIT`;
    if(!company)fail('SHARED_REVIEW_SCOPE_DENIED',404);
    let group=catalogue.find(c=>c.id===row.companyId);
    if(!group){group={id:row.companyId,name:company.name,active:true,stores:[]};catalogue.push(group)}
    group.stores.push({id:row.id,name:locked.store.name,active:true});generations.push({storeId:row.id,generation:String(locked.generation)});
   }
  }
  await authorize(tx,actor);
  if(data.input.period!==data.period)fail('SHARED_REVIEW_INVALID',400);
  let result;
  try{result=previewSharedCost(data.input,catalogue)}catch{fail('SHARED_REVIEW_INVALID',400)}
  const cents=BigInt(result.baseCents),input={period:data.period,amount:`${cents/100n}.${String(cents%100n).padStart(2,'0')}`,reference:result.reference,confirmed:true,participants:result.stores.map(s=>({storeId:s.storeId,days:String(s.days)}))};
  return {input,result,generations};
 }
 const fingerprint=(identity,computed,version)=>hash(['MWS_SHARED_REVIEW_QUOTE_V1',identity,computed,version]);
 return {
  async preview(raw,actor){
   nativeActor(actor);const data=reviewPreviewSchema.parse(raw),identity=reviewIdentitySchema.parse({mode:data.mode,period:data.period,proposalReference:data.proposalReference});
   return transaction(async tx=>{
    await lockProposal(tx,proposalId(identity));const computed=await calculate(tx,data,actor),rows=await latest(tx,identity),version=rows[0]?.details.snapshot.version||0;
    return {...identity,proposalId:proposalId(identity),expectedVersion:version,quoteHash:fingerprint(identity,computed,version),...computed,posted:false};
   });
  },
  async save(raw,actor){
   nativeActor(actor);const data=reviewSaveSchema.parse(raw),identity=reviewIdentitySchema.parse({mode:data.mode,period:data.period,proposalReference:data.proposalReference});
   return transaction(async tx=>{
    // Global UUID lock first, then proposal, then sorted lifecycle/store, then actor.
    await lockProposal(tx,eventId(data.requestId));await lockProposal(tx,proposalId(identity));
    const computed=await calculate(tx,data,actor);
    if(fingerprint(identity,computed,data.expectedVersion)!==data.quoteHash)fail('SHARED_REVIEW_CHANGED');
    let review;try{review=summarizeSharedCostReview(computed.result,data.decisions)}catch{fail('SHARED_REVIEW_INVALID',400)}
    const decisions=Object.fromEntries(review.rows.map(r=>[r.companyId,r.decision]));
    const payloadHash=hash([identity,computed,data.expectedVersion,data.quoteHash,decisions,actor.id]);
    const [prior]=await tx.$queryRaw`SELECT "id","action","actorUserId","actorName","details","createdAt" FROM "PlatformAudit" WHERE "id"=${eventId(data.requestId)}`;
    if(prior){if(prior.action!==action||prior.actorUserId!==actor.id||prior.details.payloadHash!==payloadHash)fail('SHARED_REVIEW_REQUEST_CONFLICT');return {...publicEvent(prior),replayed:true}}
    const rows=await latest(tx,identity),version=rows[0]?.details.snapshot.version||0;
    if(version!==data.expectedVersion)fail('SHARED_REVIEW_CHANGED');
    const snapshot={...identity,proposalId:proposalId(identity),version:version+1,...computed,decisions,review:{...review,temporary:false},posted:false};
    const details=JSON.stringify({format:'MWS_SHARED_REVIEW_V1',requestId:data.requestId,payloadHash,snapshot});
    const [name]=await tx.$queryRaw`SELECT "fullName" FROM "User" WHERE "id"=${actor.id}`;
    const [saved]=await tx.$queryRaw`INSERT INTO "PlatformAudit"("id","actorUserId","actorName","action","targetType","targetId","targetName","details") VALUES(${eventId(data.requestId)},${actor.id},${name?.fullName||actor.id},${action},${targetType(data.mode)},${proposalId(identity)},${data.proposalReference},${details}::jsonb) RETURNING "id","actorUserId","actorName","details","createdAt"`;
    return {...publicEvent(saved),replayed:false};
   });
  },
  async history(raw,actor){
   nativeActor(actor);const identity=reviewIdentitySchema.parse(raw);
   return transaction(async tx=>{await authorize(tx,actor);return {identity,proposalId:proposalId(identity),records:(await latest(tx,identity)).map(publicEvent),posted:false}});
  }
 };
}
