ALTER TABLE "SupplierProductLink"
  ADD COLUMN IF NOT EXISTS "purchaseMinimumQuantity" NUMERIC(14,4)
  CHECK ("purchaseMinimumQuantity" > 0);
