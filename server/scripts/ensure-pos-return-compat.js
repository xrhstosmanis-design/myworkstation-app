import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalRef" TEXT');
  console.log('[startup] POS return Payment compatibility ready');
} finally {
  await prisma.$disconnect();
}
