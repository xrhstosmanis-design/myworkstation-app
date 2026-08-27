import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "NetlinkTransaction"
      ADD COLUMN IF NOT EXISTS "fiscalDocumentId" TEXT,
      ADD COLUMN IF NOT EXISTS "fiscalNumber" TEXT,
      ADD COLUMN IF NOT EXISTS "fiscalIssuedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NetlinkTransaction_fiscal_document_idx"
      ON "NetlinkTransaction"("fiscalDocumentId")
      WHERE "fiscalDocumentId" IS NOT NULL
  `);
  console.log("[startup] Netlink transaction compatibility ready");
} finally {
  await prisma.$disconnect();
}
