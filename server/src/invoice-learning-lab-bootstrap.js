import {prisma} from "./prisma.js";

const statements=[
`CREATE TABLE IF NOT EXISTS "InvoiceLearningDocument" (
  "id" TEXT PRIMARY KEY,
  "createdByUserId" TEXT,
  "supplierKey" TEXT,
  "supplierName" TEXT,
  "supplierTaxId" TEXT,
  "invoiceNumber" TEXT,
  "invoiceDate" DATE,
  "filename" TEXT,
  "mimeType" TEXT,
  "ocrConfidence" NUMERIC(6,2),
  "rawText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE INDEX IF NOT EXISTS "InvoiceLearningDocument_supplier_idx" ON "InvoiceLearningDocument"("supplierKey","createdAt" DESC)`,
`CREATE INDEX IF NOT EXISTS "InvoiceLearningDocument_status_idx" ON "InvoiceLearningDocument"("status","createdAt" DESC)`,
`CREATE TABLE IF NOT EXISTS "InvoiceLearningLine" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL REFERENCES "InvoiceLearningDocument"("id") ON DELETE CASCADE,
  "lineNo" INTEGER NOT NULL,
  "rawText" TEXT,
  "supplierItemCode" TEXT,
  "description" TEXT,
  "quantity" NUMERIC(14,4),
  "unit" TEXT,
  "unitsPerPackage" NUMERIC(14,4),
  "unitPrice" NUMERIC(14,6),
  "discount1" NUMERIC(8,4),
  "discount2" NUMERIC(8,4),
  "discount3" NUMERIC(8,4),
  "netUnitCost" NUMERIC(14,6),
  "netValue" NUMERIC(14,4),
  "vatRate" NUMERIC(8,4),
  "masterProductId" TEXT,
  "masterProductName" TEXT,
  "barcode" TEXT,
  "barcodeSource" TEXT,
  "barcodeReference" TEXT,
  "matchConfidence" NUMERIC(6,2),
  "fieldConfidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceLearningLine_doc_line_key" ON "InvoiceLearningLine"("documentId","lineNo")`,
`CREATE INDEX IF NOT EXISTS "InvoiceLearningLine_master_idx" ON "InvoiceLearningLine"("masterProductId")`,
`CREATE TABLE IF NOT EXISTS "SupplierInvoiceLearningProfile" (
  "id" TEXT PRIMARY KEY,
  "supplierKey" TEXT NOT NULL UNIQUE,
  "supplierName" TEXT,
  "supplierTaxId" TEXT,
  "patterns" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confirmedDocuments" INTEGER NOT NULL DEFAULT 0,
  "confirmedLines" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'LEARNING',
  "lastConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS "InvoiceLearningBarcodeCandidate" (
  "id" TEXT PRIMARY KEY,
  "lineId" TEXT NOT NULL REFERENCES "InvoiceLearningLine"("id") ON DELETE CASCADE,
  "barcode" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "reference" TEXT,
  "confidence" NUMERIC(6,2),
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE INDEX IF NOT EXISTS "InvoiceLearningBarcodeCandidate_line_idx" ON "InvoiceLearningBarcodeCandidate"("lineId","createdAt" DESC)`
];

export async function ensureInvoiceLearningLabSchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("Invoice Learning Lab schema bootstrap completed.");
}
