import {randomUUID} from 'node:crypto';

// Only the existing product-card permission is changed here. Keep the selected
// rows and their before values inside PostgreSQL until the audit is durable.
export async function saveInventoryBulkPermission(tx,user,body,ids,fingerprint){
 await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
 const all=body.allProducts===true;
 const [result]=await tx.$queryRaw`
  WITH selected AS MATERIALIZED (
   SELECT p."id",p."allowPosPriceChange"
   FROM "Product" p
   WHERE p."companyId"=${user.companyId}
    AND EXISTS (SELECT 1 FROM "StoreProduct" sp WHERE sp."productId"=p."id" AND sp."storeId"=${body.storeId})
    AND (${all} OR p."id"=ANY(${ids}::text[]))
   ORDER BY p."id" FOR UPDATE OF p
  ), selection AS (
   SELECT count(*)::int AS n FROM selected
  ), updated AS (
   UPDATE "Product" p SET "allowPosPriceChange"=${body.allowPosPriceChange},"updatedAt"=NOW()
   FROM selected s,selection q
   WHERE p."id"=s."id" AND p."companyId"=${user.companyId}
    AND q.n>0 AND (${all} OR q.n=${ids.length}::int)
    AND p."allowPosPriceChange" IS DISTINCT FROM ${body.allowPosPriceChange}
   RETURNING p."id"
  ), audit AS (
   INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
   SELECT ${randomUUID()},${user.companyId},${body.storeId},${user.id},${user.id},'INVENTORY_BULK_CARD',
    jsonb_build_object('requestId',${body.requestId}::text,'fingerprint',${fingerprint}::text,
     'actorId',${user.id}::text,'allProducts',${all}::boolean,'changed',q.n,
     'updatedCount',(SELECT count(*)::int FROM updated),
     'changes',(SELECT jsonb_agg(jsonb_build_object('productId',s."id",
      'before',jsonb_build_object('id',s."id",'allowPosPriceChange',s."allowPosPriceChange"),
      'after',jsonb_build_object('allowPosPriceChange',${body.allowPosPriceChange}::boolean)) ORDER BY s."id") FROM selected s))
   FROM selection q WHERE q.n>0 AND (${all} OR q.n=${ids.length}::int)
   RETURNING "id"
  ) SELECT q.n AS matched,(SELECT count(*)::int FROM updated) AS updated,(SELECT "id" FROM audit) AS "auditId" FROM selection q`;
 if(!result?.matched)throw Object.assign(new Error('Δεν υπάρχουν είδη στο επιλεγμένο κατάστημα.'),{status:400});
 if(!result.auditId)throw Object.assign(new Error('Κάποιο είδος δεν ανήκει στο επιλεγμένο κατάστημα.'),{status:409});
 return {ok:true,changed:result.matched};
}
