import {prisma} from "./prisma.js";

const statements=[
`CREATE TABLE IF NOT EXISTS "MasterProduct" (
  "id" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryName" TEXT,
  "subcategoryName" TEXT,
  "supplierName" TEXT,
  "brandName" TEXT,
  "defaultRetailPrice" DECIMAL(14,4),
  "defaultCostPrice" DECIMAL(14,4),
  "vatRate" DECIMAL(6,3),
  "vatVerified" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reviewStatus" TEXT,
  "sourceRow" INTEGER,
  "importVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterProduct_pkey" PRIMARY KEY ("id")
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "MasterProduct_sourceCode_key" ON "MasterProduct"("sourceCode")`,
`CREATE INDEX IF NOT EXISTS "MasterProduct_name_idx" ON "MasterProduct"("name")`,
`CREATE INDEX IF NOT EXISTS "MasterProduct_category_idx" ON "MasterProduct"("categoryName")`,
`CREATE INDEX IF NOT EXISTS "MasterProduct_subcategory_idx" ON "MasterProduct"("subcategoryName")`,
`CREATE INDEX IF NOT EXISTS "MasterProduct_brand_idx" ON "MasterProduct"("brandName")`,

`CREATE TABLE IF NOT EXISTS "MasterProductBarcode" (
  "id" TEXT NOT NULL,
  "masterProductId" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "scanEnabled" BOOLEAN NOT NULL DEFAULT true,
  "duplicateBarcode" BOOLEAN NOT NULL DEFAULT false,
  "sourceRow" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasterProductBarcode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MasterProductBarcode_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "MasterProductBarcode_product_barcode_key" ON "MasterProductBarcode"("masterProductId","barcode")`,
`CREATE INDEX IF NOT EXISTS "MasterProductBarcode_barcode_idx" ON "MasterProductBarcode"("barcode")`,
`CREATE INDEX IF NOT EXISTS "MasterProductBarcode_scan_idx" ON "MasterProductBarcode"("barcode","scanEnabled")`,

`CREATE TABLE IF NOT EXISTS "MasterCatalogImport" (
  "id" TEXT NOT NULL,
  "importVersion" TEXT NOT NULL,
  "filename" TEXT,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedProducts" INTEGER NOT NULL DEFAULT 0,
  "duplicateBarcodes" INTEGER NOT NULL DEFAULT 0,
  "missingBarcodes" INTEGER NOT NULL DEFAULT 0,
  "missingRetail" INTEGER NOT NULL DEFAULT 0,
  "placeholderCategories" INTEGER NOT NULL DEFAULT 0,
  "vatUnverified" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PREVIEW',
  "createdByUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "MasterCatalogImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MasterCatalogImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "MasterCatalogImport_version_key" ON "MasterCatalogImport"("importVersion")`,
`CREATE INDEX IF NOT EXISTS "MasterCatalogImport_startedAt_idx" ON "MasterCatalogImport"("startedAt")`,

`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "masterProductId" TEXT`,
`CREATE UNIQUE INDEX IF NOT EXISTS "Product_company_master_key" ON "Product"("companyId","masterProductId") WHERE "masterProductId" IS NOT NULL`,
`CREATE INDEX IF NOT EXISTS "Product_masterProductId_idx" ON "Product"("masterProductId")`
];

async function ensureMasterProductForeignKey(){
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Product_masterProductId_fkey') THEN
      ALTER TABLE "Product" ADD CONSTRAINT "Product_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$;`);
}

export async function ensureMasterCatalogSchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  await ensureMasterProductForeignKey();
  console.log("Platform Master Catalog schema bootstrap completed.");
}
