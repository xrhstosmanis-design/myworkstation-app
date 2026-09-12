import {prisma} from "./prisma.js";

let schemaPromise;

export async function ensureEfoodIntegrationSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EfoodWebhookEvent" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"integrationId" TEXT NOT NULL,
      "mode" TEXT NOT NULL DEFAULT 'LIVE_WEBHOOK',"externalEventId" TEXT,"externalOrderId" TEXT NOT NULL,
      "externalStatus" TEXT NOT NULL,"providerStoreId" TEXT,"externalPartnerConfigId" TEXT,
      "idempotencyKey" TEXT NOT NULL,"payloadHash" TEXT NOT NULL,"payloadEnc" TEXT NOT NULL,
      "authenticated" BOOLEAN NOT NULL DEFAULT FALSE,"supported" BOOLEAN NOT NULL DEFAULT FALSE,
      "processingStatus" TEXT NOT NULL DEFAULT 'VALIDATED_ONLY',"lastError" TEXT,
      "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"processedAt" TIMESTAMPTZ,
      "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 days'),
      CONSTRAINT "EfoodWebhookEvent_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodWebhookEvent_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodWebhookEvent_integration_fkey" FOREIGN KEY ("integrationId") REFERENCES "StoreIntegrationCredential"("id") ON DELETE CASCADE,
      UNIQUE ("integrationId","idempotencyKey"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EfoodWebhookEvent_store_received_idx" ON "EfoodWebhookEvent" ("storeId","receivedAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EfoodWebhookEvent_order_idx" ON "EfoodWebhookEvent" ("integrationId","externalOrderId","externalStatus")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EfoodProductMapping" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"integrationId" TEXT NOT NULL,
      "externalProductId" TEXT NOT NULL,"externalSku" TEXT,"providerName" TEXT,"productId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'UNMATCHED',"notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EfoodProductMapping_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodProductMapping_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodProductMapping_integration_fkey" FOREIGN KEY ("integrationId") REFERENCES "StoreIntegrationCredential"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodProductMapping_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL,
      UNIQUE ("integrationId","externalProductId"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EfoodProductMapping_store_status_idx" ON "EfoodProductMapping" ("storeId","status")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EfoodIntegrationPreview" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"integrationId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"requestJson" JSONB NOT NULL,
      "externalCall" BOOLEAN NOT NULL DEFAULT FALSE,"status" TEXT NOT NULL DEFAULT 'LOCAL_VALIDATED',
      "createdByUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EfoodIntegrationPreview_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodIntegrationPreview_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
      CONSTRAINT "EfoodIntegrationPreview_integration_fkey" FOREIGN KEY ("integrationId") REFERENCES "StoreIntegrationCredential"("id") ON DELETE CASCADE)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EfoodIntegrationPreview_store_created_idx" ON "EfoodIntegrationPreview" ("storeId","createdAt" DESC)`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}
