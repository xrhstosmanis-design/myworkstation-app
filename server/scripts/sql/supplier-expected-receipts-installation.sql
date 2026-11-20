CREATE TABLE "SupplierExpectedReceiptLine" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,"productId" TEXT NOT NULL,
      "invoiceQuantity" NUMERIC(24,6) NOT NULL CHECK ("invoiceQuantity">0),"invoiceUnit" TEXT NOT NULL,"stockUnit" TEXT NOT NULL,
      "stockUnitsPerInvoiceUnit" NUMERIC(24,6) NOT NULL CHECK ("stockUnitsPerInvoiceUnit">0),"expectedStockQuantity" NUMERIC(30,12) NOT NULL CHECK ("expectedStockQuantity">0),
      "cancelledQuantity" NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK ("cancelledQuantity">=0),"version" INTEGER NOT NULL DEFAULT 0,
      "confirmedBy" TEXT NOT NULL,"confirmedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"cancelledBy" TEXT,"cancelledAt" TIMESTAMPTZ,"cancellationReason" TEXT);
CREATE INDEX "SupplierExpectedReceiptLine_scope" ON "SupplierExpectedReceiptLine"("companyId","storeId","productId");
CREATE TABLE "SupplierExpectedReceiptAllocation" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"expectedLineId" TEXT NOT NULL REFERENCES "SupplierExpectedReceiptLine"("id"),
      "orderId" TEXT NOT NULL,"productId" TEXT NOT NULL,"quantity" NUMERIC(30,12) NOT NULL CHECK ("quantity">0),
      "sourceDigest" TEXT NOT NULL,"actorId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX "SupplierExpectedReceiptAllocation_source" ON "SupplierExpectedReceiptAllocation"("companyId","storeId","orderId","productId");
CREATE TABLE "SupplierExpectedReceiptOperation" (
      "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"key" TEXT NOT NULL,"actorId" TEXT NOT NULL,"payloadDigest" TEXT NOT NULL,"result" JSONB NOT NULL,
      PRIMARY KEY("companyId","storeId","key"));
