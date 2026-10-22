WITH stores AS(SELECT id FROM "Store" WHERE id IN ('kat-store','cmtpopbgo000trhb5ng9ytiru','cmv2qanca000psigeizep8o9m')) SELECT now() "observedAt",s.id,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id),'')) FROM "Sale" x WHERE x."storeId"=s.id) sales,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id),'')) FROM "Payment" x JOIN "Sale" a ON a.id=x."saleId" WHERE a."storeId"=s.id) payments,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id),'')) FROM "StoreTransaction" x WHERE x."storeId"=s.id) transactions,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id),'')) FROM "StockMovement" x WHERE x."storeId"=s.id) movements,
(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM "CashShiftSession" x WHERE x."storeId"=s.id) shifts,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x."storeId"),'')) FROM "StorePosLayout" x WHERE x."storeId"=s.id) layout,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(p)::text||to_jsonb(sp)::text),'' ORDER BY p.id),'')) FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p.id WHERE sp."storeId"=s.id AND p.sku<>'LAB-CAFE-20260927') catalogControl
FROM stores s