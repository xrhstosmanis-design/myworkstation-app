import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const triggers = await prisma.$queryRawUnsafe(`
    SELECT t.tgname AS "triggerName", p.proname AS "functionName"
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relname='StoreOperatorAudit'
      AND NOT t.tgisinternal
      AND (
        LOWER(t.tgname) LIKE '%preparation%stock%'
        OR LOWER(p.proname) LIKE '%preparation%stock%'
        OR LOWER(pg_get_functiondef(p.oid)) LIKE '%preparationstockconsumption%'
      )
  `);

  for (const row of triggers) {
    if (row.triggerName === 'mws_consume_preparation_stock_after_pos_sale') continue;
    const safeName = String(row.triggerName).replaceAll('"','""');
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${safeName}" ON "StoreOperatorAudit"`);
    console.log(`[startup] removed legacy preparation stock trigger ${row.triggerName} -> ${row.functionName}`);
  }

  // Force the current route bootstrap to recreate the canonical trigger/function on first use.
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "mws_consume_preparation_stock_after_pos_sale" ON "StoreOperatorAudit"`);
  console.log('[startup] preparation stock triggers cleaned; canonical trigger will be recreated by store-preparation bootstrap');
} finally {
  await prisma.$disconnect();
}
