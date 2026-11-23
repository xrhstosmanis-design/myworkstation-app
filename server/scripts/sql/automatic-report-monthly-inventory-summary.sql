BEGIN;

ALTER TABLE "AutomaticReportDispatchPolicy"
  DROP CONSTRAINT IF EXISTS "AutomaticReportDispatchPolicy_reportType_check",
  ADD CONSTRAINT "AutomaticReportDispatchPolicy_reportType_check"
    CHECK (
      ("reportType"='CASH' AND "allowedFrequencies" <@ ARRAY['DAILY','WEEKLY','MONTHLY']::text[]) OR
      ("reportType" IN ('SUPPLIER_COMPARISON','MONTHLY_INVENTORY_SUMMARY') AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]) OR
      ("reportType" IN ('PROMOTION_RESULT','INVENTORY_RESULT') AND "allowedFrequencies" <@ ARRAY['EVENT']::text[])
    );

ALTER TABLE "AutomaticReportAutomationGrant"
  DROP CONSTRAINT IF EXISTS "AutomaticReportAutomationGrant_reportType_check",
  ADD CONSTRAINT "AutomaticReportAutomationGrant_reportType_check"
    CHECK (
      ("reportType"='CASH' AND "allowedFrequencies" <@ ARRAY['DAILY','WEEKLY','MONTHLY']::text[]) OR
      ("reportType" IN ('SUPPLIER_COMPARISON','MONTHLY_INVENTORY_SUMMARY') AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[]) OR
      ("reportType" IN ('PROMOTION_RESULT','INVENTORY_RESULT') AND "allowedFrequencies" <@ ARRAY['EVENT']::text[])
    );

ALTER TABLE "AutomaticReportEventConsent"
  DROP CONSTRAINT IF EXISTS "AutomaticReportEventConsent_reportType_check",
  DROP CONSTRAINT IF EXISTS "AutomaticReportEventConsent_allowedFrequencies_check",
  ADD CONSTRAINT "AutomaticReportEventConsent_allowedFrequencies_check"
    CHECK (cardinality("allowedFrequencies")<=1 AND array_position("allowedFrequencies",NULL) IS NULL),
  ADD CONSTRAINT "AutomaticReportEventConsent_reportType_check"
    CHECK (
      ("reportType" IN ('PROMOTION_RESULT','INVENTORY_RESULT') AND "allowedFrequencies" <@ ARRAY['EVENT']::text[]) OR
      ("reportType"='MONTHLY_INVENTORY_SUMMARY' AND "allowedFrequencies" <@ ARRAY['MONTHLY']::text[])
    );

COMMIT;

