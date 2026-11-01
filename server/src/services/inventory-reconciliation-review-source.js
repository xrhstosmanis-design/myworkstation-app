import {inventoryReviewState,reviewEntity,reviewKey,reviewLimit} from './inventory-reconciliation-review-contract.js';
export async function readInventoryReviewState(tx,scope){
  const [meta]=await tx.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'WorkforceAuditLog'))::text AS relation`;
  if(!meta?.relation)return inventoryReviewState([],scope,{available:false});
  const rows=await tx.$queryRaw`SELECT "id","companyId","storeId","actorUserId","action","entityType","entityId","afterJson","createdAt" FROM "WorkforceAuditLog"
    WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "entityType"=${reviewEntity} AND "entityId"=${reviewKey(scope)} ORDER BY "id" LIMIT ${reviewLimit+1}`;
  return inventoryReviewState(rows,scope);
}
