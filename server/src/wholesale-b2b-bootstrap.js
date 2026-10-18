import {prisma} from "./prisma.js";

let schemaReady;

export async function ensureWholesaleSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    const statements=[
      `CREATE TABLE IF NOT EXISTS "WholesaleCustomer" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"code" TEXT,"name" TEXT NOT NULL,"taxId" TEXT,"email" TEXT,"phone" TEXT,"address" TEXT,"city" TEXT,"contactName" TEXT,"creditLimit" NUMERIC(14,2) NOT NULL DEFAULT 0,"paymentTermsDays" INTEGER NOT NULL DEFAULT 0,"active" BOOLEAN NOT NULL DEFAULT true,"notes" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "WholesaleCustomer_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleCustomer_company_code_key" ON "WholesaleCustomer"("companyId","code") WHERE "code" IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleCustomer_company_tax_key" ON "WholesaleCustomer"("companyId","taxId") WHERE "taxId" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "WholesaleCustomer_company_name_idx" ON "WholesaleCustomer"("companyId","active","name")`,
      `CREATE TABLE IF NOT EXISTS "WholesalePriceList" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"discountPercent" NUMERIC(6,3) NOT NULL DEFAULT 0,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "WholesalePriceList_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesalePriceList_company_code_key" ON "WholesalePriceList"("companyId","code")`,
      `CREATE TABLE IF NOT EXISTS "WholesalePriceListProduct" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"priceListId" TEXT NOT NULL,"productId" TEXT NOT NULL,"unitPrice" NUMERIC(14,4),"discountPercent" NUMERIC(6,3),"minimumQuantity" NUMERIC(14,4) NOT NULL DEFAULT 1,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "WholesalePriceListProduct_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,CONSTRAINT "WholesalePriceListProduct_list_fkey" FOREIGN KEY ("priceListId") REFERENCES "WholesalePriceList"("id") ON DELETE CASCADE,CONSTRAINT "WholesalePriceListProduct_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "WholesalePriceListProduct_unique" ON "WholesalePriceListProduct"("priceListId","productId","minimumQuantity")`,
      `CREATE INDEX IF NOT EXISTS "WholesalePriceListProduct_company_product_idx" ON "WholesalePriceListProduct"("companyId","productId")`,
      `CREATE TABLE IF NOT EXISTS "WholesaleCustomerPriceList" ("customerId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"priceListId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "WholesaleCustomerPriceList_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,CONSTRAINT "WholesaleCustomerPriceList_customer_fkey" FOREIGN KEY ("customerId") REFERENCES "WholesaleCustomer"("id") ON DELETE CASCADE,CONSTRAINT "WholesaleCustomerPriceList_list_fkey" FOREIGN KEY ("priceListId") REFERENCES "WholesalePriceList"("id") ON DELETE CASCADE)`
    ];
    statements.push(
      `ALTER TABLE "WholesalePriceListProduct" ADD COLUMN IF NOT EXISTS "priceBasis" TEXT CHECK ("priceBasis" IN ('NET','GROSS'))`,
      `ALTER TABLE "WholesalePriceListProduct" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`,
      `CREATE TABLE IF NOT EXISTS "WholesalePriceAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,"actorId" TEXT NOT NULL,"priceListId" TEXT NOT NULL,"productId" TEXT NOT NULL,"minimumQuantity" NUMERIC(14,4) NOT NULL,"oldJson" JSONB,"newJson" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "WholesalePriceAudit_company_list_idx" ON "WholesalePriceAudit"("companyId","priceListId","createdAt")`,
      `CREATE TABLE IF NOT EXISTS "WholesaleOrderRequest" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,"storeId" TEXT NOT NULL REFERENCES "Store"("id"),"customerId" TEXT NOT NULL REFERENCES "WholesaleCustomer"("id"),"actorId" TEXT NOT NULL,"channel" TEXT NOT NULL CHECK ("channel"='BACKOFFICE'),"clientOrderId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"quoteId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK ("status"='SUBMITTED'),"revision" INTEGER NOT NULL DEFAULT 1,"snapshot" JSONB NOT NULL,"notes" TEXT,"netTotal" NUMERIC(18,2) NOT NULL,"vatTotal" NUMERIC(18,2) NOT NULL,"grossTotal" NUMERIC(18,2) NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CONSTRAINT "WholesaleOrderRequest_company_actor_client_key" UNIQUE ("companyId","actorId","clientOrderId"))`,
      `CREATE INDEX IF NOT EXISTS "WholesaleOrderRequest_company_store_created_idx" ON "WholesaleOrderRequest"("companyId","storeId","createdAt","id")`,
      `CREATE TABLE IF NOT EXISTS "WholesaleOrderEvent" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,"orderId" TEXT NOT NULL REFERENCES "WholesaleOrderRequest"("id") ON DELETE CASCADE,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS "WholesaleOrderEvent_company_order_idx" ON "WholesaleOrderEvent"("companyId","orderId","createdAt")`
    );
    for(const sql of statements)await prisma.$executeRawUnsafe(sql);
  })().catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}
