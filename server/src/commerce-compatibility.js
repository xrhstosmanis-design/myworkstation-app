import {prisma} from "./prisma.js";

export async function ensureCommerceCompatibility(){
  // Barcodes are unique inside a customer's catalog through the parent Product company.
  // A global unique barcode would incorrectly block two different customers from using the same retail EAN/UPC.
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "ProductBarcode_barcode_key"`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBarcode_barcode_idx" ON "ProductBarcode"("barcode")`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "salePrice" NUMERIC(14,4)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SaleLine" ADD COLUMN IF NOT EXISTS "scannedBarcode" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SaleLine_scannedBarcode_idx" ON "SaleLine"("scannedBarcode") WHERE "scannedBarcode" IS NOT NULL`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductBarcodePriceRequest" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcodeId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "oldPrice" NUMERIC(14,4),
    "requestedPrice" NUMERIC(14,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedByName" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ("status" IN ('PENDING','APPROVED','REJECTED'))
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBarcodePriceRequest_store_status_idx" ON "ProductBarcodePriceRequest"("storeId","status","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OnlineRadioStation" (
    "id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"streamUrl" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT TRUE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,"createdBy" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOnlineRadioConfig" (
    "storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT FALSE,"allowedStationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updatedBy" TEXT,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosOnlineRadioState" (
    "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"terminalPos" TEXT NOT NULL,"stationId" TEXT,"volume" NUMERIC(5,4) NOT NULL DEFAULT 0.70,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("companyId","storeId","terminalPos")
  )`);
  console.log("Commerce compatibility checks completed.");
}
