BEGIN;

ALTER TABLE "AutomaticReportDispatchPolicy"
  DROP CONSTRAINT IF EXISTS "AutomaticReportDispatchPolicy_reportType_check",
  DROP CONSTRAINT IF EXISTS "AutomaticReportDispatchPolicy_allowedFrequencies_check",
  ADD CONSTRAINT "AutomaticReportDispatchPolicy_reportType_check"
    CHECK (
      ("reportType"='CASH' AND "allowedFrequencies" <@ ARRAY['DAILY','WEEKLY','MONTHLY']::text[]) OR
      ("reportType"='SUPPLIER_COMPARISON' AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]) OR
      ("reportType"='PROMOTION_RESULT' AND "allowedFrequencies" <@ ARRAY['EVENT']::text[])
    ),
  ADD CONSTRAINT "AutomaticReportDispatchPolicy_allowedFrequencies_check"
    CHECK (array_position("allowedFrequencies",NULL) IS NULL AND
      cardinality("allowedFrequencies")=
        (CASE WHEN 'DAILY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'WEEKLY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'MONTHLY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'EVENT'=ANY("allowedFrequencies") THEN 1 ELSE 0 END));

ALTER TABLE "AutomaticReportAutomationGrant"
  DROP CONSTRAINT IF EXISTS "AutomaticReportAutomationGrant_reportType_check",
  DROP CONSTRAINT IF EXISTS "AutomaticReportAutomationGrant_allowedFrequencies_check",
  ADD CONSTRAINT "AutomaticReportAutomationGrant_reportType_check"
    CHECK (
      ("reportType"='CASH' AND "allowedFrequencies" <@ ARRAY['DAILY','WEEKLY','MONTHLY']::text[]) OR
      ("reportType"='SUPPLIER_COMPARISON' AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]) OR
      ("reportType"='PROMOTION_RESULT' AND "allowedFrequencies" <@ ARRAY['EVENT']::text[])
    ),
  ADD CONSTRAINT "AutomaticReportAutomationGrant_allowedFrequencies_check"
    CHECK (array_position("allowedFrequencies",NULL) IS NULL AND
      cardinality("allowedFrequencies")=
        (CASE WHEN 'DAILY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'WEEKLY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'MONTHLY'=ANY("allowedFrequencies") THEN 1 ELSE 0 END+
         CASE WHEN 'EVENT'=ANY("allowedFrequencies") THEN 1 ELSE 0 END));

ALTER TABLE "AutomaticReportPayload"
  DROP CONSTRAINT IF EXISTS "AutomaticReportPayload_frequency_check",
  ADD CONSTRAINT "AutomaticReportPayload_frequency_check"
    CHECK ("frequency" IN ('DAILY','WEEKLY','MONTHLY','EVENT'));

CREATE TABLE IF NOT EXISTS "AutomaticReportEventConsent" (
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL CHECK ("reportType"='PROMOTION_RESULT'),
  "recipientId" TEXT NOT NULL,
  "revision" BIGINT NOT NULL DEFAULT 1 CHECK ("revision" BETWEEN 1 AND 9007199254740991),
  "recipientVersion" BIGINT NOT NULL CHECK ("recipientVersion" BETWEEN 1 AND 9007199254740991),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "allowedFrequencies" TEXT[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (cardinality("allowedFrequencies")<=1 AND
      "allowedFrequencies" <@ ARRAY['EVENT']::text[] AND
      array_position("allowedFrequencies",NULL) IS NULL),
  "lifecycleGeneration" BIGINT NOT NULL CHECK ("lifecycleGeneration">=0),
  "consentedBy" TEXT,
  "consentedAt" TIMESTAMPTZ,
  "proofHash" TEXT CHECK ("proofHash"~'^[a-f0-9]{64}$'),
  "revokedBy" TEXT,
  "revokedAt" TIMESTAMPTZ,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("companyId","storeId","reportType","recipientId"),
  FOREIGN KEY ("companyId","storeId","recipientId")
    REFERENCES "AutomaticReportRecipient" ("companyId","storeId","recipientId"),
  CHECK (NOT "active" OR
    ("consentedAt" IS NOT NULL AND "consentedBy" IS NOT NULL AND "proofHash" IS NOT NULL))
);

COMMIT;
