// Applied by the existing reviewed Netlink startup preparation, never by a POS read.
export const netlinkPaidIssuanceSql=[
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "issuanceIntentEnc" TEXT',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "checkoutId" TEXT',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedTotal" NUMERIC(14,2)',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "issuanceResultEnc" TEXT',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedAt" TIMESTAMPTZ',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "cashReceivedBy" TEXT',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "providerDispatchedAt" TIMESTAMPTZ',
 'ALTER TABLE "NetlinkTransaction" ADD COLUMN IF NOT EXISTS "fiscalEvidence" JSONB',
 'CREATE INDEX IF NOT EXISTS "NetlinkTransaction_paid_checkout_idx" ON "NetlinkTransaction" ("companyId","storeId","checkoutId") WHERE "issuanceIntentEnc" IS NOT NULL'
];
export async function ensureNetlinkPaidIssuanceSchema(db){
 const exists=(await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'NetlinkTransaction'))::text AS name`)[0]?.name;
 if(!exists)return {ready:false};
 for(const sql of netlinkPaidIssuanceSql)await db.$executeRawUnsafe(sql);return {ready:true}}
