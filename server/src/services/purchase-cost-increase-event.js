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

export async function recordSupplierDiscountReduction(tx,{companyId,storeId,actorId,supplierId,documentId}){
  if(!supplierId)return;
  await tx.$executeRaw`
    WITH current_products AS (
      SELECT DISTINCT l."productId" FROM "PurchaseOrderLine" l
      WHERE l."orderId"=${documentId} AND l."productId" IS NOT NULL
    ), comparison_orders AS (
      SELECT p."productId",${documentId}::text AS "orderId",true AS current
      FROM current_products p
      UNION ALL
      SELECT p."productId",previous."id",false
      FROM current_products p
      CROSS JOIN LATERAL (
        SELECT d."id" FROM "PurchaseDocument" d
        JOIN "PurchaseOrder" o ON o."id"=d."id" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId"
        WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."supplierId"=${supplierId}
          AND d."id"<>${documentId} AND d."status"='APPROVED' AND d."documentType"='INVOICE'
          AND d."sourceType"='PURCHASE_ORDER' AND o."status" IN ('FINAL','INVOICED')
          AND EXISTS (
            SELECT 1 FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id" AND l."productId"=p."productId"
              AND l."quantity">0 AND l."unitCost">0 AND NOT COALESCE(l."gift",false)
          )
        ORDER BY d."documentDate" DESC,d."createdAt" DESC,d."id" DESC LIMIT 1
      ) previous
    ), rates AS (
      SELECT c."productId",c.current,
        ROUND(100*(1-SUM(l."quantity"*l."unitCost"*(1-l."discount1"/100)*(1-l."discount2"/100)*(1-l."discount3"/100))
          /SUM(l."quantity"*l."unitCost")),4) AS discount
      FROM comparison_orders c JOIN "PurchaseOrderLine" l
        ON l."orderId"=c."orderId" AND l."productId"=c."productId"
      WHERE l."quantity">0 AND l."unitCost">0 AND NOT COALESCE(l."gift",false)
      GROUP BY c."productId",c.current
      HAVING bool_and(l."discount1" IS NOT NULL AND l."discount2" IS NOT NULL AND l."discount3" IS NOT NULL)
    )
    INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
    SELECT gen_random_uuid()::text,${companyId},${storeId},${actorId},'SUPPLIER_DISCOUNT_REDUCED',
      jsonb_build_object('productId',p."id",'productName',p."name",'supplierId',s."id",'supplierName',s."name",
        'documentId',${documentId}::text,'previousDiscount',old.discount,'newDiscount',latest.discount,
        'description',concat('Μείωση έκπτωσης προμηθευτή · ',p."name",' · ',old.discount,'% → ',latest.discount,'%'))
    FROM rates latest JOIN rates old ON old."productId"=latest."productId" AND NOT old.current
    JOIN "Product" p ON p."id"=latest."productId" AND p."companyId"=${companyId}
    JOIN "Supplier" s ON s."id"=${supplierId} AND s."companyId"=${companyId}
    WHERE latest.current AND latest.discount<old.discount`;
}
