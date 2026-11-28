export function resetOwnerStock(db,{company,storeId,ids,all,negativeOnly=false,batchId,userId}) {
 return db.$transaction(async tx=>{
    const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "companyId"=${company} AND "id"=${storeId} AND "active"=true FOR KEY SHARE`;
    if(!stores.length)throw Object.assign(new Error("Δεν βρέθηκε ενεργό κατάστημα."),{status:404});
    if(!all){
      const rows=await tx.$queryRaw`
        SELECT sp."productId" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId"
        WHERE sp."storeId"=${storeId} AND p."companyId"=${company} AND sp."productId"=ANY(${ids}::text[])
        ORDER BY sp."productId" FOR UPDATE OF sp`;
      if(rows.length!==ids.length)throw Object.assign(new Error("Κάποια επιλεγμένα προϊόντα δεν ανήκουν στο συγκεκριμένο κατάστημα."),{status:409});
    }
    const result=await tx.$queryRaw`
      WITH targets AS MATERIALIZED (
        SELECT sp."productId",sp."currentStock" AS previous,p."costPrice"
        FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId"
        WHERE sp."storeId"=${storeId} AND p."companyId"=${company}
          AND sp."currentStock"<>0 AND (NOT ${negativeOnly} OR sp."currentStock"<0)
          AND (${all} OR sp."productId"=ANY(${ids}::text[]))
        ORDER BY sp."productId" FOR UPDATE OF sp
      ), changed AS (
        UPDATE "StoreProduct" sp SET "currentStock"=0,"updatedAt"=CURRENT_TIMESTAMP
        FROM targets t WHERE sp."storeId"=${storeId} AND sp."productId"=t."productId"
        RETURNING sp."productId",t.previous,t."costPrice"
      ), logged AS (
        INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId")
        SELECT gen_random_uuid()::text,${storeId},c."productId",'MANUAL_ADJUSTMENT',-c.previous,COALESCE(c."costPrice",0),
               'PRODUCT_CARD',${batchId},'Ομαδικός μηδενισμός αποθήκης',${userId}
        FROM changed c RETURNING "id"
      ) SELECT count(*)::int AS changed FROM logged`;
    return result[0].changed;
  }, {timeout:30000});
}
