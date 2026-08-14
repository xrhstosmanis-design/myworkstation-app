import {prisma} from "./prisma.js";

let readyPromise;

export async function ensureNetlinkSchema(){
  if(!readyPromise){
    readyPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NetlinkTransaction" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "saleId" TEXT,
        "requestId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "flow" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'CREATED',
        "providerTransactionId" TEXT,
        "providerReference" TEXT,
        "amount" NUMERIC(14,2),
        "commissionRate" NUMERIC(8,6) NOT NULL DEFAULT 0.010000,
        "commissionAmount" NUMERIC(14,2),
        "paymentMethod" TEXT,
        "operatorId" TEXT,
        "operatorName" TEXT,
        "errorCode" TEXT,
        "errorMessage" TEXT,
        "preparedAt" TIMESTAMPTZ,
        "completedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NetlinkTransaction_store_request_uq" ON "NetlinkTransaction"("storeId","requestId")`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NetlinkTransaction_provider_tx_uq" ON "NetlinkTransaction"("providerTransactionId") WHERE "providerTransactionId" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NetlinkTransaction_company_created_idx" ON "NetlinkTransaction"("companyId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NetlinkTransaction_store_created_idx" ON "NetlinkTransaction"("storeId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NetlinkTransaction_sale_idx" ON "NetlinkTransaction"("saleId") WHERE "saleId" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NetlinkStoreConfig" (
        "storeId" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "saleProductId" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "notes" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NetlinkStoreConfig_company_idx" ON "NetlinkStoreConfig"("companyId")`);
    })().catch(error=>{readyPromise=undefined;throw error});
  }
  return readyPromise;
}
