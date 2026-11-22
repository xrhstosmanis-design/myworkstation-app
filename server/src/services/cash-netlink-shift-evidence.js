import {exactCents} from './cash-reconciliation-contract.js';

// This is a recorded Netlink subtotal, not evidence of provider settlement.
export async function readCashNetlinkShiftEvidence(db,scope,sessionIds){
  const result=new Map();
  if(!sessionIds.length)return result;
  const [schema]=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'NetlinkTransaction'))::text AS "netlinkTable"`;
  if(!schema?.netlinkTable)return result;
  const rows=await db.$queryRaw`
    WITH selected_sales AS (
      SELECT DISTINCT substring(t."description" FROM '^POS πώληση ([A-Za-z0-9-]+) ·') AS "saleId"
      FROM "StoreTransaction" t
      WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId}
        AND t."sessionId"=ANY(${sessionIds}::text[]) AND t."reversedAt" IS NULL
        AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS','SALE_CREDIT')
    ), linked AS (
      SELECT n."id",n."amount",n."status",s."status" AS "saleStatus",MIN(t."sessionId") AS "sessionId"
      FROM selected_sales candidate
      JOIN "NetlinkTransaction" n ON n."saleId"=candidate."saleId"
        AND n."companyId"=${scope.companyId} AND n."storeId"=${scope.storeId} AND n."flow"='RECEIPT_THEN_EXECUTE'
      JOIN "Sale" s ON s."id"=n."saleId" AND s."companyId"=n."companyId" AND s."storeId"=n."storeId" AND s."source"='POS'
      JOIN "StoreTransaction" t ON t."companyId"=n."companyId" AND t."storeId"=n."storeId"
        AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS','SALE_CREDIT') AND t."reversedAt" IS NULL
        AND left(t."description",char_length('POS πώληση '||s."id"||' ·'))='POS πώληση '||s."id"||' ·'
      GROUP BY n."id",n."amount",n."status",s."status"
      HAVING COUNT(DISTINCT t."sessionId")=1 AND MIN(t."sessionId")=ANY(${sessionIds}::text[])
    )
    SELECT "sessionId",COUNT(*) FILTER (WHERE "status"='COMPLETED' AND "saleStatus"='COMPLETED' AND "amount">0)::int AS "completedCount",
      COUNT(*) FILTER (WHERE ("status"='COMPLETED' AND "saleStatus"='COMPLETED' AND "amount">0) IS NOT TRUE)::int AS "reviewCount",
      SUM("amount") FILTER (WHERE "status"='COMPLETED' AND "saleStatus"='COMPLETED' AND "amount">0)::text AS "amount"
    FROM linked GROUP BY "sessionId"`;
  for(const row of rows){
    result.set(row.sessionId,{completedCount:row.completedCount,reviewCount:row.reviewCount,amountCents:exactCents(row.amount)});
  }
  return result;
}
