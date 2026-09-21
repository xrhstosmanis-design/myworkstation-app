ALTER TABLE "InvoiceSupplierReadingProfile"
  ADD COLUMN IF NOT EXISTS "commercialFamily" TEXT,
  ADD COLUMN IF NOT EXISTS "distributorName" TEXT;

CREATE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_family_idx"
  ON "InvoiceSupplierReadingProfile" ("commercialFamily");
