-- Persist the central invoice supplier profile before startup seeds run.
-- IF NOT EXISTS keeps this adoptable by installations that previously used
-- the legacy runtime schema bootstrap.

CREATE TABLE IF NOT EXISTS "InvoiceSupplierReadingProfile" (
  "supplierKey" TEXT PRIMARY KEY,
  "supplierTaxId" TEXT,
  "supplierName" TEXT,
  "normalizedName" TEXT,
  "ruleKey" TEXT,
  "profileVersion" INTEGER NOT NULL DEFAULT 1,
  "profile" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_taxId_uq"
  ON "InvoiceSupplierReadingProfile" ("supplierTaxId")
  WHERE "supplierTaxId" IS NOT NULL AND "supplierTaxId" <> '';

CREATE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_name_idx"
  ON "InvoiceSupplierReadingProfile" ("normalizedName");
