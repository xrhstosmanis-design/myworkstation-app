// Read-only customer charges, never provider quotes or unsettled reservations.
// One SQL snapshot covers the full ledger, independently of recent-entry limits.
export async function readWalletUsageSummary(db,companyId,storeId=null,asOf=new Date()){
  const rows=await db.$queryRaw`
    WITH boundary AS (
      SELECT ${asOf}::timestamptz AS "asOf",
        date_trunc('month',${asOf}::timestamptz AT TIME ZONE 'Europe/Athens') AT TIME ZONE 'Europe/Athens' AS "monthStart",
        (${asOf}::timestamptz AT TIME ZONE 'Europe/Athens')::date AS "today"
    ), settled AS (
      SELECT CASE WHEN e."feature" IN ('INVOICE_OPENAI','INVOICE_AZURE','INVOICE_AI') THEN 'INVOICES'
        WHEN e."feature"='OWNER_ASSISTANT' THEN 'QUESTIONS' ELSE 'OTHER' END AS category,
        e."chargedMicros",e."settledAt",(e."settledAt" AT TIME ZONE 'Europe/Athens')::date AS day
      FROM "AiOwnerWalletEntry" e CROSS JOIN boundary b
      WHERE e."companyId"=${companyId} AND (${storeId}::text IS NULL OR e."storeId"=${storeId})
        AND e."kind"='USAGE' AND e."status"='SETTLED' AND e."settledAt"<=b."asOf"
    ), categories AS (
      SELECT category,SUM("chargedMicros")::text AS "allTimeMicros",
        COALESCE(SUM("chargedMicros") FILTER (WHERE "settledAt">=b."monthStart"),0)::text AS "monthMicros",
        COALESCE(SUM("chargedMicros") FILTER (WHERE day=b.today),0)::text AS "todayMicros"
      FROM settled CROSS JOIN boundary b GROUP BY category
    ), daily AS (
      SELECT day::text AS date,category,SUM("chargedMicros")::text AS "chargedMicros"
      FROM settled CROSS JOIN boundary b WHERE "settledAt">=b."monthStart" GROUP BY day,category
    )
    SELECT b."asOf",b.today::text AS "localDate",(b."monthStart" AT TIME ZONE 'Europe/Athens')::date::text AS "monthStartDate",
      (SELECT COALESCE(SUM("chargedMicros"),0)::text FROM settled) AS "allTimeMicros",
      (SELECT COALESCE(SUM("chargedMicros"),0)::text FROM settled WHERE "settledAt">=b."monthStart") AS "monthMicros",
      (SELECT COALESCE(SUM("chargedMicros"),0)::text FROM settled WHERE day=b.today) AS "todayMicros",
      COALESCE((SELECT jsonb_agg(c ORDER BY c.category) FROM categories c),'[]'::jsonb) AS categories,
      COALESCE((SELECT jsonb_agg(d ORDER BY d.date DESC,d.category) FROM daily d),'[]'::jsonb) AS daily
    FROM boundary b`;
  return {...rows[0],timeZone:'Europe/Athens'};
}
