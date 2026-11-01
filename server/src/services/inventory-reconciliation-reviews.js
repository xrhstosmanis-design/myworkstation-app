import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {readInventoryReconciliationBase} from './inventory-reconciliation-source.js';
import {readInventoryReviewState} from './inventory-reconciliation-review-source.js';
import {normalizeReviewRequest,projectInventoryReviews,reviewEntity,reviewError,reviewHash,reviewId,reviewKey,reviewLimit,reviewRequestHash} from './inventory-reconciliation-review-contract.js';

export async function requireInventoryReviewActor(tx,actor,scope){
  if(!actor?.id||!actor.sessionId||!Number.isInteger(actor.sessionVersion)||actor.staffAccess||
    actor.tokenType&&actor.tokenType!=='BACKOFFICE_USER'||!['OWNER','SUPER_ADMIN'].includes(actor.role)||actor.companyId!==scope.companyId||
    actor.storeId&&actor.storeId!==scope.storeId)throw reviewError('INVENTORY_REVIEW_DENIED','Απαιτείται ενεργή προσωπική σύνδεση ιδιοκτήτη ή Super Admin.',403);
  const [current]=await tx.$queryRaw`SELECT u."id",u."fullName",u."role"::text AS role,u."companyId",s."expiresAt"
    FROM "User" u JOIN "UserSession" s ON s."userId"=u."id"
    WHERE u."id"=${actor.id} AND s."id"=${actor.sessionId} AND u."sessionVersion"=${actor.sessionVersion}
      AND u."mustChangePassword"=FALSE AND s."revokedAt" IS NULL AND s."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') FOR SHARE OF u,s`;
  if(!current||!['OWNER','SUPER_ADMIN'].includes(current.role))throw reviewError('INVENTORY_REVIEW_SESSION_REVOKED','Η σύνδεση ή το δικαίωμα ελέγχου δεν είναι πλέον ενεργό.',403);
  if(current.role==='SUPER_ADMIN'){
    if(actor.supportContext&&(actor.supportContext.companyId!==scope.companyId||actor.supportContext.storeId&&actor.supportContext.storeId!==scope.storeId))throw reviewError('INVENTORY_REVIEW_SCOPE_DENIED',undefined,403);
  }else{
    if(actor.isSuperAdmin||actor.platformRole==='SUPER_ADMIN'||actor.supportContext)throw reviewError('INVENTORY_REVIEW_SCOPE_DENIED',undefined,403);
    if(current.companyId!==scope.companyId){
      if(actor.ownerCompanyId!==scope.companyId)throw reviewError('INVENTORY_REVIEW_SCOPE_DENIED',undefined,403);
      const rights=await tx.$queryRaw`SELECT "ownerId" FROM "OwnerCompanyAccess" WHERE "ownerId"=${actor.id} AND "companyId"=${scope.companyId} FOR SHARE`;
      if(!rights.length)throw reviewError('INVENTORY_REVIEW_SCOPE_DENIED',undefined,403);
    }
    await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${scope.companyId} FOR SHARE`;
    await tx.$queryRaw`SELECT "moduleKey" FROM "CompanyModule" WHERE "companyId"=${scope.companyId} AND "moduleKey" IN ('INVENTORY','LOSS_DETECTION') FOR SHARE`;
    const overrides=await tx.$queryRaw`SELECT "companyId","moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${scope.storeId} AND "moduleKey" IN ('INVENTORY','LOSS_DETECTION') FOR SHARE`;
    if(overrides.some(x=>x.companyId!==scope.companyId))throw reviewError('INVENTORY_REVIEW_SCOPE_DENIED',undefined,403);
    const license=await companyModuleState(scope.companyId,{db:tx});
    if(!license?.licenseAllowed)throw reviewError('INVENTORY_REVIEW_MODULE_DENIED','Η άδεια της εταιρείας δεν είναι ενεργή.',403);
    for(const key of ['INVENTORY','LOSS_DETECTION']){
      const row=overrides.find(x=>x.moduleKey===key);
      if(!effectiveModuleEnabled(license.activeModules.includes(key),row?{...row,configured:true}:{configured:false}))throw reviewError('INVENTORY_REVIEW_MODULE_DENIED','Η Αποθήκη ή ο Έλεγχος Απωλειών δεν είναι ενεργός.',403);
    }
  }
  return current;
}

function validateReviewAction(base,state,action){
  const rows=new Map(base.rows.map(x=>[x.productId,x]));
  if(action.kind==='LINK'){
    if(action.productIds.some(id=>!rows.has(id)))throw reviewError('INVENTORY_REVIEW_PRODUCT_SCOPE');
    if(state.active.some(r=>r.request.action.kind==='LINK'&&reviewHash(r.request.action.productIds)===reviewHash(action.productIds)&&r.request.action.canonicalProductId===action.canonicalProductId))throw reviewError('INVENTORY_REVIEW_ALREADY_LINKED');
  }else if(action.kind==='CORRECTION'){
    if(!rows.has(action.productId)||rows.get(action.productId).difference===null)throw reviewError('INVENTORY_REVIEW_UNCOMPUTABLE','Η αρχική διαφορά δεν υπολογίζεται. Διόρθωσε πρώτα τα ελλιπή στοιχεία.');
    if(state.active.some(r=>r.request.action.kind==='CORRECTION'&&r.request.action.productId===action.productId&&r.request.action.quantity===action.quantity&&r.request.action.evidence===action.evidence))throw reviewError('INVENTORY_REVIEW_DUPLICATE_CORRECTION');
    const physical=rows.get(action.productId).movements.filter(x=>x.included&&x.classification==='POSTED_MOVEMENT');
    if(physical.some(x=>x.id===action.evidence||x.sourceId===action.evidence))throw reviewError('INVENTORY_REVIEW_MOVEMENT_ALREADY_INCLUDED','Η κίνηση έχει ήδη υπολογιστεί. Η διόρθωση πρέπει να τεκμηριώνει αλλαγή μέτρησης, όχι δεύτερη παραλαβή ή πώληση.');
  }else if(!state.active.some(r=>r.id===action.actionId))throw reviewError('INVENTORY_REVIEW_REVOKE_INVALID');
}

export async function applyInventoryReview(db,actor,current,input){
  const request=normalizeReviewRequest(input),scope={companyId:current.companyId,storeId:current.storeId,generation:request.generation,previousId:request.previousStocktakeId,currentId:current.id};
  const id=reviewId(actor?.id,request.requestId),requestHash=reviewRequestHash(scope,actor?.id,request);
  return db.$transaction(async tx=>{
    // ReadCommitted is deliberate: a writer waiting for this lock must see the
    // preceding writer's newly inserted head, not a pre-wait MVCC snapshot.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='5s'");
    const stores=await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId"
      WHERE s."id"=${scope.storeId} AND s."companyId"=${scope.companyId} AND s."active"=TRUE AND c."active"=TRUE FOR UPDATE OF s`;
    if(!stores.length)throw reviewError('INVENTORY_REVIEW_NOT_FOUND',undefined,404);
    let live=await requireInventoryReviewActor(tx,actor,scope);
    await assertLifecycleMutation(tx,scope,request.generation);
    const state=await readInventoryReviewState(tx,scope);
    if(!state.available)throw reviewError('INVENTORY_REVIEW_UNAVAILABLE','Δεν είναι διαθέσιμο το ασφαλές ιστορικό ελέγχου.',503);
    const existing=(await tx.$queryRaw`SELECT "id","companyId","storeId","entityType","entityId","afterJson" FROM "WorkforceAuditLog" WHERE "id"=${id}`)[0];
    if(existing){
      if(existing.companyId!==scope.companyId||existing.storeId!==scope.storeId||existing.entityType!==reviewEntity||existing.entityId!==reviewKey(scope)||existing.afterJson?.requestHash!==requestHash||!state.records.some(r=>r.id===id))throw reviewError('INVENTORY_REVIEW_REPLAY_CHANGED');
      return {ok:true,replayed:true,requestId:request.requestId,receiptId:id,head:existing.afterJson.head};
    }
    if(state.head!==request.head)throw reviewError('INVENTORY_REVIEW_STALE_HEAD');
    if(state.records.length>=reviewLimit)throw reviewError('INVENTORY_REVIEW_LIMIT');
    const base=await readInventoryReconciliationBase(tx,current,request.previousStocktakeId);
    const projected=projectInventoryReviews(base,state);
    if(base.generation!==request.generation||projected.fingerprint!==request.expectedFingerprint)throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');
    validateReviewAction(base,state,request.action);
    // Original count rows/events are immutable after finalization. Re-read the
    // posting/document projection before insertion to refuse a changed source.
    const finalBase=await readInventoryReconciliationBase(tx,current,request.previousStocktakeId);
    if(finalBase.fingerprint!==base.fingerprint)throw reviewError('INVENTORY_REVIEW_SOURCE_CHANGED');
    live=await requireInventoryReviewActor(tx,actor,scope);
    const [{now}]=await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const createdAt=new Date(now).toISOString();
    const detail={version:1,generation:scope.generation,previousId:scope.previousId,currentId:scope.currentId,
      actorId:live.id,actorName:live.fullName,sequence:state.records.length+1,basisFingerprint:base.fingerprint,createdAt,request,requestHash,
      head:reviewHash([state.head,id,requestHash,base.fingerprint,createdAt])};
    await tx.$executeRaw`INSERT INTO "WorkforceAuditLog"("id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt")
      VALUES(${id},${scope.companyId},${scope.storeId},${live.id},'INVENTORY_REVIEWED',${reviewEntity},${reviewKey(scope)},${JSON.stringify(detail)}::jsonb,${new Date(createdAt)})`;
    await requireInventoryReviewActor(tx,actor,scope);
    return {ok:true,replayed:false,requestId:request.requestId,receiptId:id,head:detail.head};
  },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000}).catch(error=>{
    if(['P2002','23505'].includes(error?.code)||error?.meta?.code==='23505')throw reviewError('INVENTORY_REVIEW_REPLAY_CHANGED');
    if(['P2028','P2034','55P03','57014'].includes(error?.code)||['55P03','57014'].includes(error?.meta?.code))throw reviewError('INVENTORY_REVIEW_BUSY','Ο έλεγχος είναι απασχολημένος. Επαλήθευσε την καταχώριση πριν από επανάληψη.');
    throw error;
  });
}
