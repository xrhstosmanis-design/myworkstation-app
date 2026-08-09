import {prisma} from "./prisma.js";
let promise;
export async function ensureSupplierControlCompatibility(){
  if(!promise)promise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreTransaction" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,
      "type" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL,"description" TEXT,"supplierId" TEXT,"supplierName" TEXT,
      "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
      "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "attachmentData" TEXT,"attachmentMimeType" TEXT,"attachmentFilename" TEXT,"attachmentChecksum" TEXT,
      "reversedAt" TIMESTAMPTZ,"reversedBy" TEXT,"reversedByName" TEXT,"reversalReason" TEXT)`);
    const alters=[
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "supplierId" TEXT`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "supplierName" TEXT`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentData" TEXT`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentMimeType" TEXT`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT`,
      `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentChecksum" TEXT`
    ];
    for(const sql of alters)await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreTransaction_supplier_idx" ON "StoreTransaction" ("companyId","supplierId","occurredAt" DESC)`);
  })().catch(error=>{promise=undefined;throw error});
  return promise;
}
