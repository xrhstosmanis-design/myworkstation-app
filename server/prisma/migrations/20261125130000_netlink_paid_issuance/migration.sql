-- Additive encrypted Netlink paid issuance, including mixed-goods baskets.
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "issuanceIntentEnc" TEXT;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "checkoutId" TEXT;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedTotal" NUMERIC(14,2);
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "issuanceResultEnc" TEXT;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedAt" TIMESTAMPTZ;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedBy" TEXT;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "providerDispatchedAt" TIMESTAMPTZ;
ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "fiscalEvidence" JSONB;
CREATE INDEX IF NOT EXISTS "NetlinkTransaction_paid_checkout_idx" ON "NetlinkTransaction" ("companyId","storeId","checkoutId") WHERE "issuanceIntentEnc" IS NOT NULL;
