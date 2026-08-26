-- Durable proof that a Netlink PIN was requested only after fiscal issuance.
ALTER TABLE "NetlinkTransaction"
  ADD COLUMN IF NOT EXISTS "fiscalDocumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "fiscalIssuedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "NetlinkTransaction_fiscal_document_idx"
  ON "NetlinkTransaction"("fiscalDocumentId")
  WHERE "fiscalDocumentId" IS NOT NULL;
