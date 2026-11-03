WITH scopes(store_id) AS (VALUES ('cmtpopbgo000trhb5ng9ytiru'::text),('cmv2qanca000psigeizep8o9m'::text))
SELECT CURRENT_TIMESTAMP AS observed_at,s.store_id,'StoreTransaction'::text AS projection,a.row_count AS projected_rows,a.row_count<=20000 AS complete,CASE WHEN a.row_count<=20000 THEN a.digest ELSE NULL END AS scalar_projection_digest
FROM scopes s
CROSS JOIN LATERAL (
 SELECT COUNT(*)::int AS row_count,md5(COALESCE(string_agg(q.row_hash,'' ORDER BY q.id),'')) AS digest
 FROM (
  SELECT r."id" AS id,md5(jsonb_build_array(r."id",r."type",r."amount",r."paymentMethod",r."sessionId",(r."occurredAt" AT TIME ZONE 'UTC'),(r."reversedAt" AT TIME ZONE 'UTC'),r."expenseCategoryId")::text) AS row_hash
  FROM "StoreTransaction" r WHERE r."storeId"=s.store_id AND r."companyId"='cmtpopbgk000prhb5qc60zxus'
  ORDER BY r."id" LIMIT 20001
 ) q
) a
UNION ALL
SELECT CURRENT_TIMESTAMP AS observed_at,s.store_id,'CashShiftSession'::text AS projection,a.row_count AS projected_rows,a.row_count<=20000 AS complete,CASE WHEN a.row_count<=20000 THEN a.digest ELSE NULL END AS scalar_projection_digest
FROM scopes s
CROSS JOIN LATERAL (
 SELECT COUNT(*)::int AS row_count,md5(COALESCE(string_agg(q.row_hash,'' ORDER BY q.id),'')) AS digest
 FROM (
  SELECT r."id" AS id,md5(jsonb_build_array(r."id",r."terminalPos",r."status",(r."openedAt" AT TIME ZONE 'UTC'),(r."closedAt" AT TIME ZONE 'UTC'),r."openingOperational",r."cashSales",r."cardSales",r."eftposTotal",r."expenses",r."expectedOperational",r."actualOperational",r."variance")::text) AS row_hash
  FROM "CashShiftSession" r WHERE r."storeId"=s.store_id AND r."companyId"='cmtpopbgk000prhb5qc60zxus'
  ORDER BY r."id" LIMIT 20001
 ) q
) a
UNION ALL
SELECT CURRENT_TIMESTAMP AS observed_at,s.store_id,'StockMovement'::text AS projection,a.row_count AS projected_rows,a.row_count<=20000 AS complete,CASE WHEN a.row_count<=20000 THEN a.digest ELSE NULL END AS scalar_projection_digest
FROM scopes s
CROSS JOIN LATERAL (
 SELECT COUNT(*)::int AS row_count,md5(COALESCE(string_agg(q.row_hash,'' ORDER BY q.id),'')) AS digest
 FROM (
  SELECT r."id" AS id,md5(jsonb_build_array(r."id",r."productId",r."movementType",r."quantity",r."unitCost",r."sourceType",r."sourceId",(r."createdAt" AT TIME ZONE 'UTC'))::text) AS row_hash
  FROM "StockMovement" r WHERE r."storeId"=s.store_id AND EXISTS (SELECT 1 FROM "Store" st WHERE st."id"=r."storeId" AND st."companyId"='cmtpopbgk000prhb5qc60zxus')
  ORDER BY r."id" LIMIT 20001
 ) q
) a
UNION ALL
SELECT CURRENT_TIMESTAMP AS observed_at,s.store_id,'StoreProduct'::text AS projection,a.row_count AS projected_rows,a.row_count<=20000 AS complete,CASE WHEN a.row_count<=20000 THEN a.digest ELSE NULL END AS scalar_projection_digest
FROM scopes s
CROSS JOIN LATERAL (
 SELECT COUNT(*)::int AS row_count,md5(COALESCE(string_agg(q.row_hash,'' ORDER BY q.id),'')) AS digest
 FROM (
  SELECT r."id" AS id,md5(jsonb_build_array(r."id",r."productId",r."currentStock",r."salePrice",r."active")::text) AS row_hash
  FROM "StoreProduct" r WHERE r."storeId"=s.store_id AND EXISTS (SELECT 1 FROM "Store" st WHERE st."id"=r."storeId" AND st."companyId"='cmtpopbgk000prhb5qc60zxus')
  ORDER BY r."id" LIMIT 20001
 ) q
) a
ORDER BY store_id,projection;
