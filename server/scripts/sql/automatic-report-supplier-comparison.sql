BEGIN;

ALTER TABLE "AutomaticReportDispatchPolicy"
  DROP CONSTRAINT IF EXISTS "AutomaticReportDispatchPolicy_reportType_check",
  ADD CONSTRAINT "AutomaticReportDispatchPolicy_reportType_check"
    CHECK ("reportType" = 'CASH' OR
      ("reportType" = 'SUPPLIER_COMPARISON' AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]));

ALTER TABLE "AutomaticReportAutomationGrant"
  DROP CONSTRAINT IF EXISTS "AutomaticReportAutomationGrant_reportType_check",
  ADD CONSTRAINT "AutomaticReportAutomationGrant_reportType_check"
    CHECK ("reportType" = 'CASH' OR
      ("reportType" = 'SUPPLIER_COMPARISON' AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]));

CREATE TABLE IF NOT EXISTS "AutomaticReportSupplierComparisonConsent" (
  LIKE "AutomaticReportRecipientConsent" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES,
  FOREIGN KEY ("companyId","storeId","recipientId")
    REFERENCES "AutomaticReportRecipient" ("companyId","storeId","recipientId"),
  CHECK ("allowedFrequencies" <@ ARRAY['MONTHLY']::text[])
);

COMMIT;
