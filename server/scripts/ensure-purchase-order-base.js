import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "invoiceNumber" TEXT,
    "description" TEXT,
    "sourceType" TEXT,
    "sourceDocumentId" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "finalizedAt" TIMESTAMPTZ,
    "invoicedAt" TIMESTAMPTZ
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_company_date_idx" ON "PurchaseOrder" ("companyId","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_store_idx" ON "PurchaseOrder" ("storeId","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplier_idx" ON "PurchaseOrder" ("supplierId","createdAt" DESC)`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
    "id" TEXT PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "supplierCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" NUMERIC(14,4) NOT NULL DEFAULT 1,
    "unitCost" NUMERIC(14,6) NOT NULL DEFAULT 0,
    "discount1" NUMERIC(8,4) NOT NULL DEFAULT 0,
    "discount2" NUMERIC(8,4) NOT NULL DEFAULT 0,
    "discount3" NUMERIC(8,4) NOT NULL DEFAULT 0,
    "exciseTotal" NUMERIC(14,6) NOT NULL DEFAULT 0,
    "vatRate" NUMERIC(8,4) NOT NULL DEFAULT 24,
    "gift" BOOLEAN NOT NULL DEFAULT false,
    "initialUnitCost" NUMERIC(14,6) NOT NULL DEFAULT 0,
    "markupPercent" NUMERIC(12,6) NOT NULL DEFAULT 0,
    "proposedSalePrice" NUMERIC(14,4) NOT NULL DEFAULT 0,
    "netAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
    "vatAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
    "grossAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_order_idx" ON "PurchaseOrderLine" ("orderId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_product_idx" ON "PurchaseOrderLine" ("productId")`);
  console.log('[startup] PurchaseOrder base tables ready');
} finally {
  await prisma.$disconnect();
}
