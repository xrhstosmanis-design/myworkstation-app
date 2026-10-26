import {readLifecycleGeneration,assertLifecycleMutation} from './store-lifecycle-generation.js';
import {CASH_PAPER_ENTITY,paperKey,intentId,completionId,paperError,validatePaperSource,normalizePaper} from './cash-paper-contract.js';

export function paperState(rows,key,scope,checksum){
  const intent=rows.find(r=>r.id===intentId(key)),completion=rows.find(r=>r.id===completionId(key));
  if(!intent&&!completion)return {status:'NOT_READ',sourceKey:key};
  const valid=(row,action)=>row&&row.companyId===scope.companyId&&row.storeId===scope.storeId&&row.entityType===CASH_PAPER_ENTITY&&row.entityId===key&&row.action===action&&row.afterJson?.version===1&&row.afterJson.generation===scope.generation&&row.afterJson.checksum===checksum;
  if(!valid(intent,'CASH_PAPER_REQUESTED'))return {status:'REQUIRES_REVIEW',sourceKey:key,reason:'INVALID_INTENT'};
  if(!completion)return {status:'PENDING',sourceKey:key};
  if(!valid(completion,'CASH_PAPER_COMPLETED'))return {status:'REQUIRES_REVIEW',sourceKey:key,reason:'INVALID_COMPLETION'};
  const detail=completion.afterJson;
  if(detail.status!=='EXTRACTED_UNVERIFIED')return {status:'REQUIRES_REVIEW',sourceKey:key,reason:'READING_UNCERTAIN'};
  try{
    // Re-validate the stored raw fields; stored/model flags never verify a shift.
    const extraction=normalizePaper(detail.raw);
    return {status:'EXTRACTED_UNVERIFIED',sourceKey:key,extraction,readAt:completion.createdAt,actorName:String(detail.actorName||'').slice(0,180)};
  }catch{return {status:'REQUIRES_REVIEW',sourceKey:key,reason:'INVALID_READING'};}
}

export function createCashPaperRepository(db){
  const readRows=(tx,scope,key)=>tx.$queryRaw`SELECT "id","companyId","storeId","entityType","entityId","action","afterJson","createdAt" FROM "WorkforceAuditLog" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${CASH_PAPER_ENTITY} AND "entityId"=${key} ORDER BY "createdAt","id" LIMIT 3`;
  async function generation(scope){const s=await readLifecycleGeneration(db,scope);if(s.maintenance||s.retired)throw paperError('STORE_LIFECYCLE_MAINTENANCE');return s.generation;}
  async function get(scope,checksum){const key=paperKey(scope,checksum);return paperState(await readRows(db,scope,key),key,scope,checksum);}
  async function source(tx,scope,messageId,checksum){
    const rows=await tx.$queryRaw`SELECT "id","companyId","storeId","attachmentName","attachmentMimeType","attachmentSize","attachmentChecksum","attachmentData" FROM "StoreChatMessage" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "id"=${messageId} LIMIT 1`;
    return validatePaperSource(rows[0],scope,checksum);
  }
  async function lock(tx,scope){
    const stores=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${scope.storeId} AND s."companyId"=${scope.companyId} AND s."active"=TRUE AND c."active"=TRUE FOR SHARE OF s`;
    if(!stores.length)throw paperError('CASH_PAPER_NOT_FOUND',404);
    await assertLifecycleMutation(tx,scope,scope.generation);
  }
  async function claim(scope,actor,messageId,checksum){
    const key=paperKey(scope,checksum);
    return db.$transaction(async tx=>{
      await lock(tx,scope);await source(tx,scope,messageId,checksum);
      const prior=await readRows(tx,scope,key);
      if(prior.length)return {claimed:false,state:paperState(prior,key,scope,checksum)};
      const detail={version:1,generation:scope.generation,checksum,messageId,actorName:actor.fullName||'',status:'PENDING'};
      const inserted=await tx.$queryRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${intentId(key)},${scope.companyId},${scope.storeId},${actor.id},'CASH_PAPER_REQUESTED',${CASH_PAPER_ENTITY},${key},${JSON.stringify(detail)}::jsonb,NOW()) ON CONFLICT ("id") DO NOTHING RETURNING "id"`;
      return {claimed:inserted.length===1,state:paperState(await readRows(tx,scope,key),key,scope,checksum)};
    },{maxWait:5000,timeout:15000});
  }
  async function complete(scope,actor,messageId,checksum,result){
    const key=paperKey(scope,checksum);
    return db.$transaction(async tx=>{
      await lock(tx,scope);await source(tx,scope,messageId,checksum);
      const rows=await readRows(tx,scope,key),prior=paperState(rows,key,scope,checksum);
      if(!rows.some(r=>r.id===intentId(key))||prior.status==='REQUIRES_REVIEW')throw paperError('CASH_PAPER_REVIEW_REQUIRED');
      if(prior.status==='EXTRACTED_UNVERIFIED')return prior;
      const detail={version:1,generation:scope.generation,checksum,messageId,actorName:actor.fullName||'',status:result.status,
        ...(result.status==='EXTRACTED_UNVERIFIED'?{raw:result.raw}:{reason:'READING_UNCERTAIN'})};
      if(JSON.stringify(detail).length>26000)throw paperError('CASH_PAPER_INVALID_RESULT',502);
      await tx.$queryRaw`INSERT INTO "WorkforceAuditLog" ("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt") VALUES (${completionId(key)},${scope.companyId},${scope.storeId},${actor.id},'CASH_PAPER_COMPLETED',${CASH_PAPER_ENTITY},${key},${JSON.stringify(detail)}::jsonb,NOW()) ON CONFLICT ("id") DO NOTHING RETURNING "id"`;
      return paperState(await readRows(tx,scope,key),key,scope,checksum);
    },{maxWait:5000,timeout:15000});
  }
  return {generation,get,source:(scope,id,checksum)=>source(db,scope,id,checksum),claim,complete};
}
