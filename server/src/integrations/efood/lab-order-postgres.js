import { assertEfoodLabContext, normalizeEfoodWebhook } from './foundation.js';
import { planEfoodLabOrder } from './lab-order.js';

// Separate tables keep synthetic order results out of the POS and stock ledgers.
export async function ensureEfoodLabOrderSchema(db) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('myworkstation.efood-lab-order-schema'))`;
    await tx.$executeRaw`
      CREATE TABLE IF NOT EXISTS "EfoodLabOrderRun" (
        "integrationId" TEXT NOT NULL,
        "runId" UUID NOT NULL,
        "stock" INTEGER NOT NULL CHECK ("stock" >= 0),
        "orderRecord" JSONB,
        PRIMARY KEY ("integrationId", "runId")
      )
    `;
    await tx.$executeRaw`
      CREATE TABLE IF NOT EXISTS "EfoodLabOrderRunEvent" (
        "integrationId" TEXT NOT NULL,
        "runId" UUID NOT NULL,
        "eventKey" TEXT NOT NULL,
        "payloadHash" TEXT NOT NULL,
        "stockDelta" INTEGER NOT NULL,
        PRIMARY KEY ("integrationId", "runId", "eventKey"),
        FOREIGN KEY ("integrationId", "runId")
          REFERENCES "EfoodLabOrderRun" ("integrationId", "runId") ON DELETE CASCADE
      )
    `;
  });
}

export async function applyEfoodLabOrder(db, { context, integrationId, vendorId, runId, payload }) {
  assertEfoodLabContext(context);
  const event = normalizeEfoodWebhook(payload);
  if (context.environment !== 'SANDBOX' || vendorId !== '9344842' || event.providerStoreId !== vendorId) {
    throw Object.assign(new Error('Expected test vendor 9344842'), { status: 409 });
  }
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "EfoodLabOrderRun" ("integrationId", "runId", "stock")
      VALUES (${integrationId}, ${runId}::uuid, 5)
      ON CONFLICT ("integrationId", "runId") DO NOTHING
    `;
    const [run] = await tx.$queryRaw`
      SELECT "stock", "orderRecord" FROM "EfoodLabOrderRun"
      WHERE "integrationId" = ${integrationId} AND "runId" = ${runId}::uuid
      FOR UPDATE
    `;
    const [appliedEvent] = await tx.$queryRaw`
      SELECT "eventKey" AS "idempotencyKey", "payloadHash" FROM "EfoodLabOrderRunEvent"
      WHERE "integrationId" = ${integrationId} AND "runId" = ${runId}::uuid
        AND "eventKey" = ${event.idempotencyKey}
    `;
    const plan = planEfoodLabOrder({
      context, vendorId, payload, order: run.orderRecord, appliedEvent,
      product: { id: 'LAB-SLL45E', externalProductId: 'SLL45E', availableStock: run.stock, unitGrossCents: 250 },
      syntheticPayment: { state: 'PREPAID', grossCents: 250 },
    });
    if (plan.action !== 'NONE') {
      await tx.$executeRaw`
        UPDATE "EfoodLabOrderRun"
        SET "stock" = "stock" + ${plan.stockDelta}::integer,
            "orderRecord" = ${JSON.stringify(plan.order)}::jsonb
        WHERE "integrationId" = ${integrationId} AND "runId" = ${runId}::uuid
      `;
    }
    if (plan.receipt) {
      await tx.$executeRaw`
        INSERT INTO "EfoodLabOrderRunEvent" ("integrationId", "runId", "eventKey", "payloadHash", "stockDelta")
        VALUES (${integrationId}, ${runId}::uuid, ${plan.receipt.idempotencyKey}, ${plan.receipt.payloadHash}, ${plan.stockDelta}::integer)
      `;
    }
    return { action: plan.action, order: plan.order ?? run.orderRecord, stock: run.stock + plan.stockDelta, chargeCents: 0 };
  });
}
