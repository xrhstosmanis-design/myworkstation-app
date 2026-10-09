-- Additive only. Apply through the established migration process, never a Work production seed.
CREATE TABLE "CustomerDemo" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "schemaVersion" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerDemo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerDemo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerDemo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerDemo_companyId_key" ON "CustomerDemo"("companyId");
CREATE UNIQUE INDEX "CustomerDemo_storeId_key" ON "CustomerDemo"("storeId");
CREATE UNIQUE INDEX "CustomerDemo_createdBy_requestKey_key" ON "CustomerDemo"("createdBy","requestKey");
CREATE INDEX "CustomerDemo_status_expiresAt_idx" ON "CustomerDemo"("status","expiresAt");
