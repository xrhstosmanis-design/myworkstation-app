import {prisma} from "./prisma.js";

let readyPromise;

export async function ensurePosPricingSchema(){
  if(!readyPromise){
    readyPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CustomerWholesalePrice" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "wholesalePrice" NUMERIC(14,4) NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("companyId","customerId","productId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerWholesalePrice_customer_idx" ON "CustomerWholesalePrice"("customerId","active")`);

      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotion" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "promotionType" TEXT NOT NULL,
        "originalPrice" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "offerPrice" NUMERIC(14,4),
        "discountPercent" NUMERIC(8,4) NOT NULL DEFAULT 0,
        "saleQuantity" NUMERIC(14,4) NOT NULL DEFAULT 1,
        "bonusQuantity" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "customerPoints" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "validFrom" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "validUntil" TIMESTAMPTZ,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotion_company_type_idx" ON "PriceCatalogPromotion"("companyId","promotionType","active","validFrom")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotion_product_idx" ON "PriceCatalogPromotion"("productId")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotionStore" (
        "promotionId" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY("promotionId","storeId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotionStore_company_store_idx" ON "PriceCatalogPromotionStore"("companyId","storeId","promotionId")`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "memberCard" TEXT`);
    })().catch(error=>{readyPromise=undefined;throw error});
  }
  return readyPromise;
}
