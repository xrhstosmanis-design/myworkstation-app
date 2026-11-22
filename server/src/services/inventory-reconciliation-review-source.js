import {inventoryReviewState,reviewError,reviewEntity,reviewKey,reviewLimit} from './inventory-reconciliation-review-contract.js';
export async function readInventoryReviewState(tx,scope){
  const [meta]=await tx.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'WorkforceAuditLog'))::text AS relation`;
  if(!meta?.relation)return inventoryReviewState([],scope,{available:false});
  const rows=await tx.$queryRaw`SELECT "id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt" FROM "WorkforceAuditLog"
    WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${reviewEntity} AND "entityId"=${reviewKey(scope)} ORDER BY "id" LIMIT ${reviewLimit+1}`;
  return inventoryReviewState(rows,scope);
}

export async function readInventoryReusableLinks(tx,scope){
  const currentKey=reviewKey(scope);
  const rows=await tx.$queryRaw`SELECT history."id",history."companyId",history."storeId",history."actorUserId",
    history."action",history."entityType",history."entityId",history."afterJson",history."createdAt"
    FROM "WorkforceAuditLog" history
    WHERE history."companyId"=${scope.companyId} AND history."storeId"=${scope.storeId}
      AND history."entityType"=${reviewEntity} AND history."entityId"<>${currentKey}
      AND EXISTS (SELECT 1 FROM "WorkforceAuditLog" origin
        WHERE origin."entityType"=history."entityType" AND origin."entityId"=history."entityId"
          AND origin."companyId"=history."companyId" AND origin."storeId"=history."storeId"
          AND origin."afterJson"->>'generation'=${scope.generation}
          AND origin."afterJson"#>'{request,action,reuseInStore}'='true'::jsonb)
    ORDER BY history."entityId",history."id" LIMIT ${reviewLimit+1}`;
  if(rows.length>reviewLimit)throw reviewError('INVENTORY_REVIEW_LIMIT');
  const pairs=new Map();
  for(const row of rows){
    if(!pairs.has(row.entityId))pairs.set(row.entityId,[]);
    pairs.get(row.entityId).push(row);
  }
  return [...pairs.values()].flatMap(pair=>{
    const origin=pair[0].afterJson;
    const state=inventoryReviewState(pair,{...scope,previousId:origin?.previousId,currentId:origin?.currentId});
    return state.active.filter(r=>r.request.action.kind==='LINK'&&r.request.action.reuseInStore);
  });
}
