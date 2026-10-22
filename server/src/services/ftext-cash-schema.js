// Called only by the normal authenticated cash-setup path, never by a Work SQL
// migration or the communication-only heartbeat. No process-wide schema cache:
// native isolated schemas and transaction rollbacks must remain independent.
export async function ensureFtextCashSchema(db){
 await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FtextCashRequest" (
 "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
 "terminalPos" TEXT NOT NULL,"fiscalDeviceCode" TEXT NOT NULL,"serialNumber" TEXT NOT NULL,
 "clientTransactionId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"settingsHash" TEXT NOT NULL,
 "lifecycleGeneration" TEXT NOT NULL,"sessionId" TEXT NOT NULL,
 "plan" JSONB NOT NULL,"checkoutJson" JSONB NOT NULL,"total" NUMERIC(14,2) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','DISPATCHED','CONFIRMED','REQUIRES_CHECK','SALE_COMMITTED')),
 "claimedByDeviceId" TEXT,"claimedTokenVersion" INTEGER,"dispatchedAt" TIMESTAMPTZ,
 "result" JSONB,"resultHash" TEXT,"saleId" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE("companyId","storeId","clientTransactionId"))`);
 await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FtextCashRequest_register_pending_idx" ON "FtextCashRequest" ("companyId","storeId","fiscalDeviceCode") WHERE "status" <> 'SALE_COMMITTED'`);
}
export async function ftextCashTableExists(db){return Boolean((await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'FtextCashRequest'))::text AS name`)[0]?.name);}
