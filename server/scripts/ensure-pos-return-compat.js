import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='Payment' LIMIT 1`);
  const paymentExists = rows.length > 0;

  if (!paymentExists) {
    console.log('[startup] Payment table not created yet; POS return compatibility deferred to app bootstrap');
  } else {
    await prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalRef" TEXT');
    console.log('[startup] POS return Payment compatibility ready');
  }
} finally {
  await prisma.$disconnect();
}
