import {prisma} from "./prisma.js";

const statements=[
`CREATE TABLE IF NOT EXISTS "OnlineOrderingConfig" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "surchargeType" TEXT NOT NULL DEFAULT 'FIXED',
  "surchargeValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "deliveryFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cashEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cardOnDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoPrintOnAccept" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderingConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineOrderingConfig_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrderingConfig_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrderingConfig_store_key" ON "OnlineOrderingConfig"("storeId")`,
`CREATE INDEX IF NOT EXISTS "OnlineOrderingConfig_company_idx" ON "OnlineOrderingConfig"("companyId")`,
`CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  "id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"orderNumber" TEXT NOT NULL,"channel" TEXT NOT NULL DEFAULT 'ONLINE',"fulfillmentType" TEXT NOT NULL DEFAULT 'DELIVERY',"status" TEXT NOT NULL DEFAULT 'NEW',"paymentMethod" TEXT NOT NULL,"paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',"customerName" TEXT NOT NULL,"customerPhone" TEXT NOT NULL,"building" TEXT,"floor" TEXT,"department" TEXT,"room" TEXT,"deliveryNotes" TEXT,"subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,"deliveryFee" DECIMAL(14,4) NOT NULL DEFAULT 0,"total" DECIMAL(14,4) NOT NULL DEFAULT 0,"idempotencyKey" TEXT NOT NULL,"assignedEmployeeId" TEXT,"saleId" TEXT,"commercialPostedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"acceptedAt" TIMESTAMP(3),"readyAt" TIMESTAMP(3),"deliveredAt" TIMESTAMP(3),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id"),CONSTRAINT "OnlineOrder_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "OnlineOrder_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "OnlineOrder_employee_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "saleId" TEXT`,`ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "commercialPostedAt" TIMESTAMP(3)`,`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_sale_key" ON "OnlineOrder"("saleId") WHERE "saleId" IS NOT NULL`,`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_store_number_key" ON "OnlineOrder"("storeId","orderNumber")`,`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_store_idempotency_key" ON "OnlineOrder"("storeId","idempotencyKey")`,`CREATE INDEX IF NOT EXISTS "OnlineOrder_store_status_idx" ON "OnlineOrder"("storeId","status","createdAt")`,
`CREATE TABLE IF NOT EXISTS "OnlineOrderLine" (
  "id" TEXT NOT NULL,"orderId" TEXT NOT NULL,"productId" TEXT NOT NULL,"productName" TEXT NOT NULL,"quantity" DECIMAL(14,4) NOT NULL,"storeUnitPrice" DECIMAL(14,4) NOT NULL,"onlineSurcharge" DECIMAL(14,4) NOT NULL DEFAULT 0,"onlineUnitPrice" DECIMAL(14,4) NOT NULL,"lineTotal" DECIMAL(14,4) NOT NULL,"modifiersJson" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderLine_pkey" PRIMARY KEY ("id"),CONSTRAINT "OnlineOrderLine_order_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "OnlineOrderLine_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`,`ALTER TABLE "OnlineOrderLine" ALTER COLUMN "onlineSurcharge" SET DEFAULT 0`,`CREATE INDEX IF NOT EXISTS "OnlineOrderLine_order_idx" ON "OnlineOrderLine"("orderId")`,`CREATE INDEX IF NOT EXISTS "OnlineOrderLine_product_idx" ON "OnlineOrderLine"("productId")`,
`CREATE TABLE IF NOT EXISTS "OnlineOrderStatusEvent" (
  "id" TEXT NOT NULL,"orderId" TEXT NOT NULL,"fromStatus" TEXT,"toStatus" TEXT NOT NULL,"userId" TEXT,"employeeId" TEXT,"note" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderStatusEvent_pkey" PRIMARY KEY ("id"),CONSTRAINT "OnlineOrderStatusEvent_order_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "OnlineOrderStatusEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,CONSTRAINT "OnlineOrderStatusEvent_employee_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,`CREATE INDEX IF NOT EXISTS "OnlineOrderStatusEvent_order_idx" ON "OnlineOrderStatusEvent"("orderId","createdAt")`
];

export const onlineUnitPrice=(storePrice,config={})=>{const base=Number(storePrice||0),type=String(config.surchargeType||"FIXED").toUpperCase(),value=Math.max(0,Number(config.surchargeValue||0));const surcharge=type==="PERCENT"?base*(value/100):value;return Math.round((base+surcharge)*100)/100};
export const onlineSurchargeAmount=(storePrice,config={})=>Math.round((onlineUnitPrice(storePrice,config)-Number(storePrice||0))*100)/100;
export async function getOnlineOrderingConfig(storeId){const rows=await prisma.$queryRaw`SELECT * FROM "OnlineOrderingConfig" WHERE "storeId"=${storeId} LIMIT 1`;return rows[0]||null}

async function ensureKatPilotDefaults(){
  const stores=await prisma.$queryRaw`
    SELECT s."id",s."companyId"
    FROM "Store" s
    JOIN "Company" c ON c."id"=s."companyId"
    WHERE s."active"=TRUE
      AND c."active"=TRUE
      AND LOWER(s."name")=LOWER('Κυλικείο ΚΑΤ')
      AND (
        EXISTS (SELECT 1 FROM "OnlineOrderingConfig" oc WHERE oc."storeId"=s."id")
        OR EXISTS (SELECT 1 FROM "OnlineOrder" oo WHERE oo."storeId"=s."id")
        OR EXISTS (SELECT 1 FROM "User" u WHERE u."companyId"=c."id" AND LOWER(u."email")=LOWER('nikirazatou@hotmail.gr'))
      )
    ORDER BY
      CASE WHEN EXISTS (SELECT 1 FROM "OnlineOrder" oo WHERE oo."storeId"=s."id") THEN 0
           WHEN EXISTS (SELECT 1 FROM "OnlineOrderingConfig" oc WHERE oc."storeId"=s."id") THEN 1
           ELSE 2 END,
      s."createdAt" ASC
    LIMIT 1`;
  const store=stores[0];if(!store){console.warn("KAT online ordering bootstrap: production KAT store not found; module not auto-enabled.");return}
  await prisma.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey","active","notes","createdAt","updatedAt") VALUES (${`online-ordering-${store.companyId}`},${store.companyId},'ONLINE_ORDERING',TRUE,'KAT pilot online ordering',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("companyId","moduleKey") DO UPDATE SET "active"=TRUE,"notes"='KAT pilot online ordering',"updatedAt"=CURRENT_TIMESTAMP`;
  await prisma.$executeRaw`INSERT INTO "OnlineOrderingConfig" ("id","companyId","storeId","enabled","surchargeType","surchargeValue","deliveryFee","pickupEnabled","deliveryEnabled","cashEnabled","cardOnDeliveryEnabled","autoPrintOnAccept") VALUES (${`online-config-${store.id}`},${store.companyId},${store.id},TRUE,'FIXED',0.10,1.00,TRUE,TRUE,TRUE,TRUE,TRUE) ON CONFLICT ("storeId") DO UPDATE SET "enabled"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`;
}
export async function ensureKatOnlineOrderingSchema(){for(const statement of statements)await prisma.$executeRawUnsafe(statement);await ensureKatPilotDefaults();console.log("Online ordering schema/config bootstrap completed.")}
