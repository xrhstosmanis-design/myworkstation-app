WITH targets AS (SELECT "id","companyId" FROM "Store" WHERE "id" IN ('kat-store','cmtpopbgo000trhb5ng9ytiru','cmv2qanca000psigeizep8o9m'))
SELECT NOW() AS "observedAt",s."id" AS "storeId",
(SELECT COUNT(*) FROM "StoreProduct" t WHERE t."storeId"=s."id") AS "catalogCount",
(SELECT COUNT(*) FROM "StoreProduct" t WHERE t."storeId"=s."id" AND t."currentStock"<>0) AS "nonzeroStocks",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),'')) FROM "StoreProduct" t WHERE t."storeId"=s."id") AS "storeProductsHash",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),'')) FROM "Product" t WHERE t."companyId"=s."companyId") AS "productsHash",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."productId"),'')) FROM "PreparationProductSettings" t WHERE t."companyId"=s."companyId") AS "preparationHash",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),'')) FROM "ProductSetItem" t WHERE t."companyId"=s."companyId") AS "setsHash",
(SELECT jsonb_build_object('count',COUNT(*),'last',MAX(t."createdAt"),'hash',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),''))) FROM "StockMovement" t WHERE t."storeId"=s."id") AS "movements",
(SELECT jsonb_build_object('count',COUNT(*),'total',COALESCE(SUM(t."total"),0),'hash',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),''))) FROM "Sale" t WHERE t."storeId"=s."id") AS "sales",
(SELECT jsonb_build_object('count',COUNT(*),'hash',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),''))) FROM "Payment" t JOIN "Sale" a ON a."id"=t."saleId" WHERE a."storeId"=s."id") AS "payments",
(SELECT jsonb_build_object('count',COUNT(*),'hash',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),''))) FROM "StoreTransaction" t WHERE t."storeId"=s."id") AS "transactions",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."id"),'')) FROM "CashShiftSession" t WHERE t."storeId"=s."id") AS "shiftHash",
(SELECT jsonb_agg(to_jsonb(t)) FROM "CashShiftSession" t WHERE t."storeId"=s."id" AND t."status"='OPEN') AS "openShifts",
(SELECT to_jsonb(t) FROM "StorePosLayout" t WHERE t."storeId"=s."id") AS "layout",
(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t."storeId"),'')) FROM "StorePosLayout" t WHERE t."storeId"<>s."id") AS "otherLayoutsHash",
(SELECT md5(to_jsonb(t)::text) FROM "PlatformPosDraft" t WHERE t."id"='GLOBAL') AS "globalDraftHash"
FROM targets s ORDER BY s."id"
