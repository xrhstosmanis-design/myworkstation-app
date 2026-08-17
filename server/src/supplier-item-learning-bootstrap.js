import {prisma} from "./prisma.js";

const statements=[
`ALTER TABLE "PurchaseDocumentLine" ADD COLUMN IF NOT EXISTS "supplierItemCode" TEXT`,
`ALTER TABLE "PurchaseDocumentLine" ADD COLUMN IF NOT EXISTS "supplierBarcode" TEXT`,
`CREATE INDEX IF NOT EXISTS "PurchaseDocumentLine_supplierItemCode_idx" ON "PurchaseDocumentLine"("supplierItemCode")`,
`CREATE TABLE IF NOT EXISTS "SupplierProductMapping" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplierItemCode" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "supplierBarcode" TEXT,
  "lastDescription" TEXT,
  "unitsPerPackage" DECIMAL(14,4),
  "lastUnitCost" DECIMAL(14,4),
  "usageCount" INTEGER NOT NULL DEFAULT 1,
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierProductMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierProductMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierProductMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierProductMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierProductMapping_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProductMapping_company_supplier_code_key" ON "SupplierProductMapping"("companyId","supplierId","supplierItemCode")`,
`CREATE INDEX IF NOT EXISTS "SupplierProductMapping_supplier_idx" ON "SupplierProductMapping"("supplierId")`,
`CREATE INDEX IF NOT EXISTS "SupplierProductMapping_product_idx" ON "SupplierProductMapping"("productId")`,
`CREATE INDEX IF NOT EXISTS "SupplierProductMapping_barcode_idx" ON "SupplierProductMapping"("supplierBarcode")`
];

export async function ensureSupplierItemLearningSchema(){
  for(const statement of statements) await prisma.$executeRawUnsafe(statement);
  console.log("Supplier item learning schema bootstrap completed.");
}
