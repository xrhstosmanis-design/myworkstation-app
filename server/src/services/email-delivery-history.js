const historyLimit = 50;

export async function readEmailDeliveryHistory(tx, {companyId, storeId}, reportSchemaReady) {
  const reports = reportSchemaReady ? await tx.$queryRaw`
    SELECT "slotId" AS "id", 'CASH' AS "type", "status",
      "record"->'input'->>'frequency' AS "frequency",
      COALESCE("record"->>'completedAt', "record"->>'createdAt') AS "at",
      "record"->>'messageId' AS "messageId", NULL::text AS "failure"
    FROM "AutomaticReportDeliverySlot"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId}
    ORDER BY "at" DESC NULLS LAST, "slotId" DESC LIMIT ${historyLimit}` : [];

  const [schema] = await tx.$queryRaw`
    SELECT to_regclass('"InvoiceStockExclusionEmail"') IS NOT NULL AS "ready"`;
  const invoices = schema?.ready ? await tx.$queryRaw`
    SELECT jsonb_build_array(e."orderId", e."reopenVersion")::text AS "id",
      'INVOICE_STOCK_EXCLUSION' AS "type",
      CASE WHEN e."sentAt" IS NOT NULL THEN 'ACCEPTED'
           WHEN e."attempts" > 0 THEN 'RETRY_PENDING' ELSE 'PENDING' END AS "status",
      COALESCE(e."sentAt", (e."payload"->>'postedAt')::timestamptz) AS "at",
      to_jsonb(e)->>'messageId' AS "messageId", to_jsonb(e)->>'lastFailure' AS "failure",
      LEFT(e."payload"->>'invoiceNumber', 200) AS "invoiceNumber"
    FROM "InvoiceStockExclusionEmail" e
    WHERE e."companyId"=${companyId} AND e."storeId"=${storeId}
    ORDER BY "at" DESC NULLS LAST, e."orderId" DESC, e."reopenVersion" DESC LIMIT ${historyLimit}` : [];

  return [...reports, ...invoices]
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, historyLimit);
}
