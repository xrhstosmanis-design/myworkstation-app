-- Reuse encrypted integration storage and its reviewed ownership/backup layout.
-- Preserve existing MYDATA, VAT_LOOKUP and EFOOD rows, including legacy kind checks.
DO $netlink_connection$
DECLARE current_constraint RECORD;
BEGIN
  CREATE TABLE IF NOT EXISTS "StoreIntegrationCredential" (
    "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL, "providerName" TEXT NOT NULL, "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "credentialsEnc" TEXT NOT NULL, "accountHint" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "updatedBy" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId","kind")
  );
  FOR current_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='"StoreIntegrationCredential"'::regclass AND contype='c'
      AND (SELECT attnum FROM pg_attribute WHERE attrelid='"StoreIntegrationCredential"'::regclass AND attname='kind') = ANY (conkey)
  LOOP
    EXECUTE format('ALTER TABLE "StoreIntegrationCredential" DROP CONSTRAINT %I',current_constraint.conname);
  END LOOP;
  ALTER TABLE "StoreIntegrationCredential" ADD CONSTRAINT "StoreIntegrationCredential_kind_check" CHECK ("kind" IN ('MYDATA','VAT_LOOKUP','EFOOD','NETLINK'));
  CREATE INDEX IF NOT EXISTS "StoreIntegrationCredential_company_store_idx" ON "StoreIntegrationCredential" ("companyId","storeId");
END $netlink_connection$;
