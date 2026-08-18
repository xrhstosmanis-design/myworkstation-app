import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass('public."Payment"') AS table_name`);
  const paymentExists = Boolean(rows?.[0]?.table_name);

  if (!paymentExists) {
    console.log('[startup] Payment table not created yet; POS return compatibility deferred to app bootstrap');
  } else {
    await prisma.$executeRawUnsafe('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "terminalRef" TEXT');
    console.log('[startup] POS return Payment compatibility ready');
  }
} finally {
  await prisma.$disconnect();
}
