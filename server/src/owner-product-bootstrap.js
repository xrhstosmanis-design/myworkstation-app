import {prisma} from "./prisma.js";

const statements=[
`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatVerified" BOOLEAN NOT NULL DEFAULT false`,

`CREATE TABLE IF NOT EXISTS "ProductPriceHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "storeId" TEXT,
  "oldPrice" DECIMAL(14,4),
  "newPrice" DECIMAL(14,4),
  "changeType" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductPriceHistory_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductPriceHistory_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductPriceHistory_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductPriceHistory_user_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "ProductPriceHistory_product_idx" ON "ProductPriceHistory"("productId","createdAt")`,
`CREATE INDEX IF NOT EXISTS "ProductPriceHistory_store_idx" ON "ProductPriceHistory"("storeId","createdAt")`,

`CREATE TABLE IF NOT EXISTS "Promotion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "promotionType" TEXT NOT NULL,
  "percentOff" DECIMAL(6,3),
  "buyQuantity" DECIMAL(14,4),
  "freeQuantity" DECIMAL(14,4),
  "fixedPrice" DECIMAL(14,4),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Promotion_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Promotion_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Promotion_user_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "Promotion_company_dates_idx" ON "Promotion"("companyId","startsAt","endsAt")`,
`CREATE INDEX IF NOT EXISTS "Promotion_product_idx" ON "Promotion"("productId","active")`,

`CREATE TABLE IF NOT EXISTS "PromotionStore" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionStore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionStore_promotion_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromotionStore_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "PromotionStore_promotion_store_key" ON "PromotionStore"("promotionId","storeId")`,

`CREATE TABLE IF NOT EXISTS "Stocktake" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "finalizedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Stocktake_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Stocktake_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Stocktake_created_user_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Stocktake_final_user_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "Stocktake_store_status_idx" ON "Stocktake"("storeId","status","startedAt")`,

`CREATE TABLE IF NOT EXISTS "StocktakeLine" (
  "id" TEXT NOT NULL,
  "stocktakeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "expectedQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "countedQuantity" DECIMAL(14,4),
  "unitCost" DECIMAL(14,4),
  "countedByUserId" TEXT,
  "countedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StocktakeLine_stocktake_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StocktakeLine_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StocktakeLine_user_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "StocktakeLine_stocktake_product_key" ON "StocktakeLine"("stocktakeId","productId")`,
`CREATE INDEX IF NOT EXISTS "StocktakeLine_product_idx" ON "StocktakeLine"("productId")`
,
`CREATE TABLE IF NOT EXISTS "InventoryZone" (
  "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventoryZone_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "InventoryZone_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "InventoryZone_store_code_key" ON "InventoryZone"("storeId","code")`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "inventoryVersion" INTEGER NOT NULL DEFAULT 2`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "liveDuringTrading" BOOLEAN NOT NULL DEFAULT false`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "recountPolicy" TEXT NOT NULL DEFAULT 'DIFFERENCES'`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "snapshotJson" JSONB`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "scopeType" TEXT NOT NULL DEFAULT 'FULL'`,
`ALTER TABLE "Stocktake" ADD COLUMN IF NOT EXISTS "scopeJson" JSONB`,
`ALTER TABLE "StocktakeLine" ADD COLUMN IF NOT EXISTS "zoneId" TEXT`,
`ALTER TABLE "StocktakeLine" ADD COLUMN IF NOT EXISTS "countVersion" INTEGER NOT NULL DEFAULT 0`,
`ALTER TABLE "StocktakeLine" ADD COLUMN IF NOT EXISTS "recountRequired" BOOLEAN NOT NULL DEFAULT false`,
`ALTER TABLE "StocktakeLine" ADD COLUMN IF NOT EXISTS "countSource" TEXT`,
`CREATE INDEX IF NOT EXISTS "StocktakeLine_zone_idx" ON "StocktakeLine"("stocktakeId","zoneId")`,
`CREATE TABLE IF NOT EXISTS "InventoryParticipant" (
  "id" TEXT PRIMARY KEY,"stocktakeId" TEXT NOT NULL,"zoneId" TEXT,"userId" TEXT,"displayName" TEXT NOT NULL,"role" TEXT NOT NULL DEFAULT 'COUNTER',"active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "InventoryParticipant_stocktake_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "InventoryParticipant_stocktake_idx" ON "InventoryParticipant"("stocktakeId","active")`,
`CREATE TABLE IF NOT EXISTS "InventoryAccessGrant" (
  "id" TEXT PRIMARY KEY,"stocktakeId" TEXT NOT NULL,"zoneId" TEXT,"tokenHash" TEXT NOT NULL,"pinHash" TEXT NOT NULL,"displayName" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,"maxUses" INTEGER NOT NULL DEFAULT 1,"usedCount" INTEGER NOT NULL DEFAULT 0,"revokedAt" TIMESTAMPTZ,"createdByUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventoryAccessGrant_stocktake_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAccessGrant_token_key" ON "InventoryAccessGrant"("tokenHash")`,
`CREATE TABLE IF NOT EXISTS "InventoryCountEvent" (
  "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"stocktakeId" TEXT NOT NULL,"lineId" TEXT NOT NULL,"zoneId" TEXT,
  "eventType" TEXT NOT NULL,"previousQuantity" NUMERIC(14,4),"countedQuantity" NUMERIC(14,4) NOT NULL,"expectedQuantity" NUMERIC(14,4) NOT NULL,
  "actorId" TEXT,"actorName" TEXT NOT NULL,"deviceId" TEXT,"source" TEXT NOT NULL,"clientEventId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InventoryCountEvent_stocktake_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE,
  CONSTRAINT "InventoryCountEvent_line_fkey" FOREIGN KEY ("lineId") REFERENCES "StocktakeLine"("id") ON DELETE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountEvent_client_key" ON "InventoryCountEvent"("stocktakeId","clientEventId") WHERE "clientEventId" IS NOT NULL`,
`CREATE INDEX IF NOT EXISTS "InventoryCountEvent_stocktake_created_idx" ON "InventoryCountEvent"("stocktakeId","createdAt")`
];

export async function ensureOwnerProductSchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("Owner product management schema bootstrap completed.");
}
