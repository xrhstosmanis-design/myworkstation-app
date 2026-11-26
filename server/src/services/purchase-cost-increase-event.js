import {randomUUID} from "node:crypto";

export async function recordPurchaseCostIncrease(tx,{companyId,storeId,actorId,productId,productName,previousCost,supplierId=null,documentId=null,source}){
  if(previousCost==null)return;
  await tx.$executeRaw`
    INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
    SELECT ${randomUUID()},p."companyId",s."id",${actorId},'PURCHASE_COST_INCREASED',
      jsonb_build_object('productId',p."id",'productName',${productName}::text,
        'previousCost',${String(previousCost)}::numeric,'newCost',p."costPrice",
        'supplierId',${supplierId}::text,'documentId',${documentId}::text,'source',${source}::text,
        'description',concat('Αύξηση τιμής αγοράς · ',${productName}::text,' · ',${String(previousCost)}::numeric,' € → ',p."costPrice",' €'))
    FROM "Product" p JOIN "Store" s ON s."companyId"=p."companyId"
    WHERE p."companyId"=${companyId} AND p."id"=${productId} AND s."id"=${storeId}
      AND ${String(previousCost)}::numeric>0 AND p."costPrice">${String(previousCost)}::numeric`;
}
