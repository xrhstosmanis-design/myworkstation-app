WITH targets AS (
  SELECT id, name FROM "Store"
  WHERE id IN ('cmtpopbgo000trhb5ng9ytiru','cmv2qanca000psigeizep8o9m')
)
SELECT now() AS captured_at, s.id, s.name,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg((to_jsonb(t)-'attachmentData')::text,'' ORDER BY t.id),''))) FROM "StoreTransaction" t WHERE t."storeId"=s.id) AS transactions,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "CashShiftSession" t WHERE t."storeId"=s.id) AS shifts,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "StoreProduct" t WHERE t."storeId"=s.id) AS stock,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "StockMovement" t WHERE t."storeId"=s.id) AS movements,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "PurchaseDocument" t WHERE t."storeId"=s.id) AS documents,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "PurchaseOrder" t WHERE t."storeId"=s.id) AS orders,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "PurchaseOrderLine" t JOIN "PurchaseOrder" p ON p.id=t."orderId" WHERE p."storeId"=s.id) AS order_lines,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg((to_jsonb(t)-'resultJson')::text||COALESCE(md5(t."resultJson"::text),''),'' ORDER BY t.id),''))) FROM "AiReaderJob" t WHERE t."storeId"=s.id) AS jobs,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg((to_jsonb(t)-'contentData')::text,'' ORDER BY t.id),''))) FROM "DocumentAttachment" t WHERE t."storeId"=s.id) AS attachments,
 (SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY t.id),''))) FROM "DocumentInbox" t WHERE t."storeId"=s.id) AS inbox,
 (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'terminal',t."terminalPos",'operator',t."openedByName",'openedAt',t."openedAt",'openingDrawer',t."openingDrawer",'cashSales',t."cashSales",'cardSales',t."cardSales",'expenses',t.expenses,'transactionCount',(SELECT count(*) FROM "StoreTransaction" x WHERE x."sessionId"=t.id)) ORDER BY t.id),'[]'::jsonb) FROM "CashShiftSession" t WHERE t."storeId"=s.id AND t.status='OPEN') AS active_shifts
FROM targets s ORDER BY s.id;

