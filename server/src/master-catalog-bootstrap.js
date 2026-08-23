import {prisma} from "./prisma.js";

const statements=[
  ["master-product-table", `CREATE TABLE IF NOT EXISTS "MasterProduct" (
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
  )`],
  ["master-product-source-code", `CREATE UNIQUE INDEX IF NOT EXISTS "MasterProduct_sourceCode_key" ON "MasterProduct" ("sourceCode")`],
  ["master-product-name", `CREATE INDEX IF NOT EXISTS "MasterProduct_name_idx" ON "MasterProduct" ("name")`],
  ["master-product-category", `CREATE INDEX IF NOT EXISTS "MasterProduct_category_idx" ON "MasterProduct" ("categoryName")`],
  ["master-product-subcategory", `CREATE INDEX IF NOT EXISTS "MasterProduct_subcategory_idx" ON "MasterProduct" ("subcategoryName")`],
  ["master-product-brand", `CREATE INDEX IF NOT EXISTS "MasterProduct_brand_idx" ON "MasterProduct" ("brandName")`],
  ["master-barcode-table", `CREATE TABLE IF NOT EXISTS "MasterProductBarcode" (
    "id" TEXT NOT NULL,
    "masterProductId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "scanEnabled" BOOLEAN NOT NULL DEFAULT true,
    "duplicateBarcode" BOOLEAN NOT NULL DEFAULT false,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MasterProductBarcode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MasterProductBarcode_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`],
  ["master-barcode-unique", `CREATE UNIQUE INDEX IF NOT EXISTS "MasterProductBarcode_product_barcode_key" ON "MasterProductBarcode" ("masterProductId", "barcode")`],
  ["master-barcode-index", `CREATE INDEX IF NOT EXISTS "MasterProductBarcode_barcode_idx" ON "MasterProductBarcode" ("barcode")`],
  ["master-barcode-scan", `CREATE INDEX IF NOT EXISTS "MasterProductBarcode_scan_idx" ON "MasterProductBarcode" ("barcode", "scanEnabled")`],
  ["master-import-table", `CREATE TABLE IF NOT EXISTS "MasterCatalogImport" (
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
    CONSTRAINT "MasterCatalogImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`],
  ["master-import-version", `CREATE UNIQUE INDEX IF NOT EXISTS "MasterCatalogImport_version_key" ON "MasterCatalogImport" ("importVersion")`],
  ["master-import-started", `CREATE INDEX IF NOT EXISTS "MasterCatalogImport_startedAt_idx" ON "MasterCatalogImport" ("startedAt")`],
  ["product-master-column", `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "masterProductId" TEXT`],
  ["product-master-unique", `CREATE UNIQUE INDEX IF NOT EXISTS "Product_company_master_key" ON "Product" ("companyId", "masterProductId") WHERE "masterProductId" IS NOT NULL`],
  ["product-master-index", `CREATE INDEX IF NOT EXISTS "Product_masterProductId_idx" ON "Product" ("masterProductId")`]
];

async function ensureMasterProductForeignKey(){
  const exists=await prisma.$queryRawUnsafe(`SELECT 1 FROM pg_constraint WHERE conname = 'Product_masterProductId_fkey' LIMIT 1`);
  if(Array.isArray(exists)&&exists.length)return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD CONSTRAINT "Product_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE`);
}

export async function ensureMasterCatalogSchema(){
  for(const [label,statement] of statements){
    try{
      await prisma.$executeRawUnsafe(statement);
    }catch(error){
      console.error(`Master Catalog schema failed at ${label}.`,{code:error?.code,meta:error?.meta});
      throw error;
    }
  }
  try{
    await ensureMasterProductForeignKey();
  }catch(error){
    console.error("Master Catalog schema failed at product-master-foreign-key.",{code:error?.code,meta:error?.meta});
    throw error;
  }
  console.log("Platform Master Catalog schema bootstrap completed.");
}
