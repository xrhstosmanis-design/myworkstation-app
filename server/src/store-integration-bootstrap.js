import {prisma} from "./prisma.js";

let schemaPromise;

export async function ensureStoreIntegrationSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreIntegrationCredential" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "providerName" TEXT NOT NULL,"environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
      "credentialsEnc" TEXT NOT NULL,"accountHint" TEXT,"enabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "metadataJson" JSONB NOT NULL DEFAULT '{}',"webhookKey" TEXT,
      "externalCallsEnabled" BOOLEAN NOT NULL DEFAULT FALSE,"sandboxValidatedAt" TIMESTAMPTZ,
      "updatedBy" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("storeId","kind"))`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StoreIntegrationCredential" ADD COLUMN IF NOT EXISTS "metadataJson" JSONB NOT NULL DEFAULT '{}'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StoreIntegrationCredential" ADD COLUMN IF NOT EXISTS "webhookKey" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StoreIntegrationCredential" ADD COLUMN IF NOT EXISTS "externalCallsEnabled" BOOLEAN NOT NULL DEFAULT FALSE`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StoreIntegrationCredential" ADD COLUMN IF NOT EXISTS "sandboxValidatedAt" TIMESTAMPTZ`);
    await prisma.$executeRawUnsafe(`DO $constraint$
      DECLARE current_name TEXT; current_definition TEXT;
      BEGIN
        SELECT conname,pg_get_constraintdef(oid) INTO current_name,current_definition
        FROM pg_constraint
        WHERE conrelid='"StoreIntegrationCredential"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%"kind"%'
        LIMIT 1;
        IF current_definition IS NULL OR POSITION('EFOOD' IN current_definition)=0 THEN
          IF current_name IS NOT NULL THEN EXECUTE format('ALTER TABLE "StoreIntegrationCredential" DROP CONSTRAINT %I',current_name); END IF;
          ALTER TABLE "StoreIntegrationCredential" ADD CONSTRAINT "StoreIntegrationCredential_kind_check" CHECK ("kind" IN ('MYDATA','VAT_LOOKUP','EFOOD'));
        END IF;
      END $constraint$`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreIntegrationCredential_company_store_idx" ON "StoreIntegrationCredential" ("companyId","storeId")`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StoreIntegrationCredential_webhook_key" ON "StoreIntegrationCredential" ("webhookKey") WHERE "webhookKey" IS NOT NULL`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}
