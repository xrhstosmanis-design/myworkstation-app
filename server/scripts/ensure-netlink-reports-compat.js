import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();

try{
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NetlinkCancellationRequest" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "transactionId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING_NETLINK',
      "reason" TEXT NOT NULL,
      "requestedById" TEXT,
      "requestedByName" TEXT,
      "netlinkReference" TEXT,
      "netlinkResponse" TEXT,
      "resolvedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "NetlinkCancellationRequest_transaction_uq"
    ON "NetlinkCancellationRequest"("transactionId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NetlinkCancellationRequest_company_created_idx"
    ON "NetlinkCancellationRequest"("companyId", "createdAt" DESC)
  `);
  console.log("[startup] Netlink reports and cancellation-request storage ready");
}finally{await prisma.$disconnect()}
