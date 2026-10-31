-- Read-only, synthetic MYWORKSTATION LAB controls. No business write.
WITH c AS (SELECT "companyId" AS id FROM "Store" WHERE id='cmuk8gxui000ppabfykdxwb1y')
SELECT NOW() AS observed_at,
(SELECT to_jsonb(p) FROM "Product" p WHERE p.id='b1466a68-c47b-47cc-9139-69e6f9f7f978') AS product,
(SELECT jsonb_agg(to_jsonb(s) ORDER BY s."storeId") FROM "StoreProduct" s WHERE s."productId"='b1466a68-c47b-47cc-9139-69e6f9f7f978') AS stocks,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(p)::text,'' ORDER BY p.id))) FROM "Product" p WHERE p."companyId"=(SELECT id FROM c) AND p.id<>'b1466a68-c47b-47cc-9139-69e6f9f7f978') AS other_products,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(s)::text,'' ORDER BY s.id))) FROM "CashShiftSession" s WHERE s."companyId"=(SELECT id FROM c)) AS shifts,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(s)::text,'' ORDER BY s.id)),'total',sum(s.amount)) FROM "StoreTransaction" s WHERE s."companyId"=(SELECT id FROM c)) AS ledger,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(s)::text,'' ORDER BY s.id)),'total',sum(s.total)) FROM "Sale" s WHERE s."companyId"=(SELECT id FROM c)) AS sales,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(p)::text,'' ORDER BY p.id)),'total',sum(p.amount)) FROM "Payment" p JOIN "Sale" s ON s.id=p."saleId" WHERE s."companyId"=(SELECT id FROM c)) AS payments,
(SELECT jsonb_build_object('count',count(*),'hash',md5(string_agg(to_jsonb(m)::text,'' ORDER BY m.id)),'latest',max(m."createdAt")) FROM "StockMovement" m WHERE m."productId"='b1466a68-c47b-47cc-9139-69e6f9f7f978') AS movements,
(SELECT count(*) FROM "ProductPriceHistory" p WHERE p."companyId"=(SELECT id FROM c)) AS price_history,
(SELECT count(*) FROM "StoreOperatorAudit" a WHERE a."storeId"='cmuk8gxui000ppabfykdxwb1y' AND a."eventType"='INVENTORY_BULK_CARD') AS audit_count;
