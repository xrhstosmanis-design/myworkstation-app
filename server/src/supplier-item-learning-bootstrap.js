import {prisma} from "./prisma.js";

const statements=[
`ALTER TABLE "PurchaseDocumentLine" ADD COLUMN IF NOT EXISTS "supplierItemCode" TEXT`,
`ALTER TABLE "PurchaseDocumentLine" ADD COLUMN IF NOT EXISTS "supplierBarcode" TEXT`,
`ALTER TABLE "PurchaseDocumentLine" ADD COLUMN IF NOT EXISTS "purchaseOrderLineId" TEXT`,
`CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseDocumentLine_purchaseOrderLineId_key" ON "PurchaseDocumentLine"("purchaseOrderLineId") WHERE "purchaseOrderLineId" IS NOT NULL`,
`CREATE INDEX IF NOT EXISTS "PurchaseDocumentLine_supplierItemCode_idx" ON "PurchaseDocumentLine"("supplierItemCode")`,
`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "supplierCode" TEXT`,
`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrRawText" TEXT`,
`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "detectedBarcode" TEXT`,
`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`,
`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineType" TEXT NOT NULL DEFAULT 'PRODUCT'`,
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
  "lastDiscount1" DECIMAL(8,4),
  "lastDiscount2" DECIMAL(8,4),
  "lastDiscount3" DECIMAL(8,4),
  "lastExcisePerInvoiceUnit" DECIMAL(14,6),
  "lastMarkupPercent" DECIMAL(12,6),
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
`CREATE INDEX IF NOT EXISTS "SupplierProductMapping_barcode_idx" ON "SupplierProductMapping"("supplierBarcode")`,
`ALTER TABLE "SupplierProductMapping" ADD COLUMN IF NOT EXISTS "lastDiscount1" DECIMAL(8,4)`,
`ALTER TABLE "SupplierProductMapping" ADD COLUMN IF NOT EXISTS "lastDiscount2" DECIMAL(8,4)`,
`ALTER TABLE "SupplierProductMapping" ADD COLUMN IF NOT EXISTS "lastDiscount3" DECIMAL(8,4)`,
`ALTER TABLE "SupplierProductMapping" ADD COLUMN IF NOT EXISTS "lastExcisePerInvoiceUnit" DECIMAL(14,6)`,
`ALTER TABLE "SupplierProductMapping" ADD COLUMN IF NOT EXISTS "lastMarkupPercent" DECIMAL(12,6)`,
`CREATE OR REPLACE FUNCTION mws_preserve_ai_reader_lines() RETURNS trigger AS $$
DECLARE
  v_new_products JSONB;
  v_new_lines JSONB;
  v_old_lines JSONB;
BEGIN
  IF NEW."resultJson" IS NULL OR OLD."resultJson" IS NULL THEN RETURN NEW; END IF;
  v_new_products:=COALESCE(NEW."resultJson"->'productLines','[]'::jsonb);
  v_new_lines:=COALESCE(NEW."resultJson"->'lines','[]'::jsonb);
  v_old_lines:=COALESCE(OLD."resultJson"->'lines','[]'::jsonb);
  IF jsonb_typeof(v_new_products)='array' AND jsonb_typeof(v_new_lines)='array' AND jsonb_typeof(v_old_lines)='array'
     AND jsonb_array_length(v_new_products)=0 AND jsonb_array_length(v_new_lines)=0 AND jsonb_array_length(v_old_lines)>0 THEN
    NEW."resultJson":=jsonb_set(NEW."resultJson",'{lines}',v_old_lines,true);
    IF COALESCE(jsonb_array_length(COALESCE(NEW."resultJson"->'auditLines','[]'::jsonb)),0)=0 THEN
      NEW."resultJson":=jsonb_set(NEW."resultJson",'{auditLines}',v_old_lines,true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
`DROP TRIGGER IF EXISTS trg_mws_preserve_ai_reader_lines ON "AiReaderJob"`,
`CREATE TRIGGER trg_mws_preserve_ai_reader_lines BEFORE UPDATE OF "resultJson" ON "AiReaderJob" FOR EACH ROW EXECUTE FUNCTION mws_preserve_ai_reader_lines()`,
`CREATE OR REPLACE FUNCTION mws_pos_ocr_line_before_write() RETURNS trigger AS $$
DECLARE
  v_company TEXT;
  v_supplier TEXT;
  v_code TEXT;
  v_product TEXT;
BEGIN
  IF UPPER(TRIM(COALESCE(NEW."description",''))) ~ '^ANCHOR[[:space:]]*[0-9]+$'
     OR UPPER(TRIM(COALESCE(NEW."ocrRawText",''))) ~ '^ANCHOR[[:space:]]*[0-9]+$' THEN
    NEW."productId" := NULL;
    NEW."supplierCode" := NULL;
    NEW."detectedBarcode" := NULL;
    NEW."resolutionStatus" := 'INFO';
    NEW."ocrLineType" := 'INFO';
    NEW."quantity" := 0;
    NEW."unitCost" := 0;
    NEW."netAmount" := 0;
    NEW."vatAmount" := 0;
    NEW."grossAmount" := 0;
    RETURN NEW;
  END IF;

  IF COALESCE(TRIM(NEW."supplierCode"),'')='' THEN
    v_code := substring(COALESCE(NEW."ocrRawText",'') from '^\\s*([0-9][0-9A-Za-z._/-]{2,39})(?:\\s|$)');
    IF v_code IS NOT NULL THEN NEW."supplierCode" := v_code; END IF;
  END IF;

  IF NEW."productId" IS NULL AND COALESCE(TRIM(NEW."supplierCode"),'')<>'' THEN
    SELECT o."companyId",o."supplierId" INTO v_company,v_supplier
    FROM "PurchaseOrder" o WHERE o."id"=NEW."orderId" LIMIT 1;
    IF v_company IS NOT NULL AND v_supplier IS NOT NULL THEN
      SELECT m."productId" INTO v_product
      FROM "SupplierProductMapping" m
      WHERE m."companyId"=v_company AND m."supplierId"=v_supplier
        AND UPPER(REGEXP_REPLACE(TRIM(m."supplierItemCode"),'\\s+','','g'))=UPPER(REGEXP_REPLACE(TRIM(NEW."supplierCode"),'\\s+','','g'))
      LIMIT 1;
      IF v_product IS NOT NULL THEN
        NEW."productId" := v_product;
        NEW."resolutionStatus" := 'MATCHED';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
`DROP TRIGGER IF EXISTS trg_mws_pos_ocr_line_before_write ON "PurchaseOrderLine"`,
`CREATE TRIGGER trg_mws_pos_ocr_line_before_write BEFORE INSERT OR UPDATE ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION mws_pos_ocr_line_before_write()`,
`CREATE OR REPLACE FUNCTION mws_sync_pos_ocr_line_to_document() RETURNS trigger AS $$
DECLARE
  v_doc TEXT;
  v_source TEXT;
  v_text TEXT;
  v_pack NUMERIC := 1;
  v_unit TEXT := 'PIECE';
  v_unit_cost NUMERIC := 0;
  v_vat NUMERIC := 0;
BEGIN
  SELECT o."sourceDocumentId",o."sourceType" INTO v_doc,v_source
  FROM "PurchaseOrder" o WHERE o."id"=NEW."orderId" LIMIT 1;
  IF v_doc IS NULL OR v_source IS DISTINCT FROM 'POS_OCR_DRAFT' THEN RETURN NEW; END IF;

  IF NEW."resolutionStatus"='INFO' OR NEW."ocrLineType"='INFO' THEN
    DELETE FROM "PurchaseDocumentLine" WHERE "purchaseOrderLineId"=NEW."id";
    RETURN NEW;
  END IF;

  v_text := UPPER(COALESCE(NEW."description",'')||' '||COALESCE(NEW."ocrRawText",''));
  IF v_text ~ '(MONSTER|RED[[:space:]]*BULL|REDBULL)' THEN v_pack:=24;
  ELSIF v_text ~ '(1[,.]5[[:space:]]*(L|LT)|1500[[:space:]]*ML)' THEN v_pack:=6;
  ELSIF v_text ~ '(330[[:space:]]*ML|0[,.]33[[:space:]]*L|33[[:space:]]*CL)' THEN v_pack:=24;
  ELSIF v_text ~ '(500[[:space:]]*ML|0[,.]5[[:space:]]*L|50[[:space:]]*CL)' THEN v_pack:=24;
  ELSIF v_text ~ '(750[[:space:]]*ML|0[,.]75[[:space:]]*L)' AND v_text ~ '(ΝΕΡΟ|WATER|ΖΑΓΟΡΙ|ΘΕΩΝΗ)' THEN v_pack:=12;
  ELSIF v_text ~ '(ΦΙΑΛ|BOTTLE)' THEN v_pack:=20;
  END IF;
  IF v_pack>1 AND (v_text ~ '(ΚΙΒ|ΚΒ|CASE|BOX|PACK|1X[0-9]+|[0-9]+X[0-9]+)') THEN v_unit:='PACKAGE'; ELSE v_pack:=1; END IF;

  v_vat:=GREATEST(0,COALESCE(NEW."vatRate",0));
  IF COALESCE(NEW."quantity",0)>0 AND COALESCE(NEW."netAmount",0)>0 THEN
    v_unit_cost:=NEW."netAmount"/NEW."quantity";
  ELSE
    v_unit_cost:=GREATEST(0,COALESCE(NEW."unitCost",0));
  END IF;

  INSERT INTO "PurchaseDocumentLine" (
    "id","purchaseDocumentId","purchaseOrderLineId","productId","supplierItemCode","supplierBarcode","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","vatAmount","grossAmount"
  ) VALUES (
    md5(random()::text||clock_timestamp()::text),v_doc,NEW."id",NEW."productId",NULLIF(TRIM(NEW."supplierCode"),''),NULLIF(TRIM(NEW."detectedBarcode"),''),NEW."description",GREATEST(0,COALESCE(NEW."quantity",0)),v_unit,CASE WHEN v_unit='PACKAGE' THEN v_pack ELSE NULL END,v_unit_cost,GREATEST(0,COALESCE(NEW."netAmount",0)),v_vat,GREATEST(0,COALESCE(NEW."vatAmount",0)),GREATEST(0,COALESCE(NEW."grossAmount",0))
  ) ON CONFLICT ("purchaseOrderLineId") WHERE "purchaseOrderLineId" IS NOT NULL DO UPDATE SET
    "productId"=EXCLUDED."productId",
    "supplierItemCode"=COALESCE(EXCLUDED."supplierItemCode","PurchaseDocumentLine"."supplierItemCode"),
    "supplierBarcode"=COALESCE(EXCLUDED."supplierBarcode","PurchaseDocumentLine"."supplierBarcode"),
    "description"=EXCLUDED."description",
    "quantity"=EXCLUDED."quantity",
    "unit"=EXCLUDED."unit",
    "unitsPerPackage"=EXCLUDED."unitsPerPackage",
    "unitCost"=EXCLUDED."unitCost",
    "netAmount"=EXCLUDED."netAmount",
    "vatRate"=EXCLUDED."vatRate",
    "vatAmount"=EXCLUDED."vatAmount",
    "grossAmount"=EXCLUDED."grossAmount";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
`DROP TRIGGER IF EXISTS trg_mws_sync_pos_ocr_line_to_document ON "PurchaseOrderLine"`,
`CREATE TRIGGER trg_mws_sync_pos_ocr_line_to_document AFTER INSERT OR UPDATE ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION mws_sync_pos_ocr_line_to_document()`,
`UPDATE "PurchaseOrderLine" l
 SET "resolutionStatus"='INFO',"ocrLineType"='INFO',"productId"=NULL,"supplierCode"=NULL,"detectedBarcode"=NULL,
     "quantity"=0,"unitCost"=0,"netAmount"=0,"vatAmount"=0,"grossAmount"=0
 FROM "PurchaseOrder" o
 WHERE o."id"=l."orderId" AND o."sourceType"='POS_OCR_DRAFT' AND o."status"='NEW'
   AND (UPPER(TRIM(COALESCE(l."description",''))) ~ '^ANCHOR[[:space:]]*[0-9]+$'
        OR UPPER(TRIM(COALESCE(l."ocrRawText",''))) ~ '^ANCHOR[[:space:]]*[0-9]+$')`
];

export async function ensureSupplierItemLearningSchema(){
  for(const statement of statements) await prisma.$executeRawUnsafe(statement);
  console.log("Supplier item learning + POS OCR approval bridge + AI line preservation + anchor guard bootstrap completed.");
}
