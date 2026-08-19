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
  "stockCheckEnabled" BOOLEAN NOT NULL DEFAULT false,
  "minimumOrderRetail" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "minimumOrderStaff" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "minimumOrderPermanentStaff" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "staffDiscountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "permanentStaffDiscountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderingConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineOrderingConfig_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrderingConfig_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "stockCheckEnabled" BOOLEAN NOT NULL DEFAULT false`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "minimumOrderRetail" DECIMAL(14,4) NOT NULL DEFAULT 0`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "minimumOrderStaff" DECIMAL(14,4) NOT NULL DEFAULT 0`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "minimumOrderPermanentStaff" DECIMAL(14,4) NOT NULL DEFAULT 0`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "staffDiscountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0`,
`ALTER TABLE "OnlineOrderingConfig" ADD COLUMN IF NOT EXISTS "permanentStaffDiscountPercent" DECIMAL(8,4) NOT NULL DEFAULT 0`,
`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrderingConfig_store_key" ON "OnlineOrderingConfig"("storeId")`,
`CREATE INDEX IF NOT EXISTS "OnlineOrderingConfig_company_idx" ON "OnlineOrderingConfig"("companyId")`,
`CREATE TABLE IF NOT EXISTS "OnlineProductVisibility" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineProductVisibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineProductVisibility_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineProductVisibility_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineProductVisibility_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineProductVisibility_store_product_key" ON "OnlineProductVisibility"("storeId","productId")`,
`CREATE INDEX IF NOT EXISTS "OnlineProductVisibility_store_visible_idx" ON "OnlineProductVisibility"("storeId","visible")`,
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

async function ensureRecipeIngredientsTracked(){
  try{
    await prisma.$executeRawUnsafe(`
      UPDATE "Product" p
      SET "trackStock"=TRUE,"updatedAt"=CURRENT_TIMESTAMP
      WHERE p."active"=TRUE
        AND p."trackStock"=FALSE
        AND EXISTS (
          SELECT 1 FROM "PreparationRecipeLine" r
          WHERE r."ingredientProductId"=p."id" AND r."automatic"=TRUE
        )
    `);
  }catch(error){console.warn("Online ordering recipe stock tracking reconcile skipped:",error?.message||error)}
}

async function reconcileDeliveredOnlineSales(){
  try{
    await prisma.$executeRawUnsafe(`
      WITH delivered AS (
        SELECT o."saleId",o."storeId",o."companyId",
               COALESCE(ev."employeeId",o."assignedEmployeeId") AS "employeeId",
               COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
        FROM "OnlineOrder" o
        LEFT JOIN LATERAL (
          SELECT e."employeeId" FROM "OnlineOrderStatusEvent" e
          WHERE e."orderId"=o."id" AND e."toStatus"='DELIVERED' AND e."employeeId" IS NOT NULL
          ORDER BY e."createdAt" DESC LIMIT 1
        ) ev ON TRUE
        WHERE o."status"='DELIVERED' AND o."saleId" IS NOT NULL
      )
      UPDATE "Sale" s
      SET "operatorEmployeeId"=COALESCE(d."employeeId",s."operatorEmployeeId"),
          "createdAt"=COALESCE(d."postedAt",s."createdAt")
      FROM delivered d
      WHERE s."id"=d."saleId"
    `);
  }catch(error){console.warn("Online ordering sale reconcile skipped:",error?.message||error)}

  try{
    await prisma.$executeRawUnsafe(`
      WITH delivered AS (
        SELECT o."id" AS "orderId",o."saleId",o."storeId",o."companyId",o."orderNumber",o."paymentMethod",o."total",
               COALESCE(ev."employeeId",o."assignedEmployeeId") AS "employeeId",
               COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
        FROM "OnlineOrder" o
        LEFT JOIN LATERAL (
          SELECT e."employeeId" FROM "OnlineOrderStatusEvent" e
          WHERE e."orderId"=o."id" AND e."toStatus"='DELIVERED' AND e."employeeId" IS NOT NULL
          ORDER BY e."createdAt" DESC LIMIT 1
        ) ev ON TRUE
        WHERE o."status"='DELIVERED' AND o."saleId" IS NOT NULL
      ), resolved AS (
        SELECT d.*,cs."id" AS "sessionId",
               COALESCE(c."id",cs."openedBy") AS "operatorId",
               COALESCE(c."displayName",cs."openedByName",'Online') AS "operatorName"
        FROM delivered d
        LEFT JOIN LATERAL (
          SELECT s."id",s."openedBy",s."openedByName"
          FROM "CashShiftSession" s
          WHERE s."companyId"=d."companyId" AND s."storeId"=d."storeId" AND s."status"='OPEN'
          ORDER BY s."openedAt" DESC LIMIT 1
        ) cs ON TRUE
        LEFT JOIN "StoreOperatorCredential" c
          ON c."storeId"=d."storeId" AND c."employeeId"=d."employeeId" AND c."active"=TRUE
      )
      UPDATE "StoreTransaction" t
      SET "sessionId"=COALESCE(r."sessionId",t."sessionId"),
          "type"=CASE WHEN r."paymentMethod"='CASH' THEN 'SALE_CASH' ELSE 'SALE_CARD' END,
          "amount"=r."total",
          "description"='ONLINE ΠΑΡΑΓΓΕΛΙΑ ' || r."orderNumber",
          "actorId"=COALESCE(r."operatorId",t."actorId"),
          "actorName"=COALESCE(r."operatorName",t."actorName"),
          "occurredAt"=COALESCE(r."postedAt",t."occurredAt")
      FROM resolved r
      WHERE t."storeId"=r."storeId"
        AND t."companyId"=r."companyId"
        AND t."description" ILIKE ('%' || r."orderNumber" || '%')
    `);
  }catch(error){console.warn("Online ordering transaction update reconcile skipped:",error?.message||error)}

  try{
    await prisma.$executeRawUnsafe(`
      WITH delivered AS (
        SELECT o."id" AS "orderId",o."saleId",o."storeId",o."companyId",o."orderNumber",o."paymentMethod",o."total",
               COALESCE(ev."employeeId",o."assignedEmployeeId") AS "employeeId",
               COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
        FROM "OnlineOrder" o
        LEFT JOIN LATERAL (
          SELECT e."employeeId" FROM "OnlineOrderStatusEvent" e
          WHERE e."orderId"=o."id" AND e."toStatus"='DELIVERED' AND e."employeeId" IS NOT NULL
          ORDER BY e."createdAt" DESC LIMIT 1
        ) ev ON TRUE
        WHERE o."status"='DELIVERED' AND o."saleId" IS NOT NULL
      ), resolved AS (
        SELECT d.*,cs."id" AS "sessionId",
               COALESCE(c."id",cs."openedBy") AS "operatorId",
               COALESCE(c."displayName",cs."openedByName",'Online') AS "operatorName"
        FROM delivered d
        JOIN LATERAL (
          SELECT s."id",s."openedBy",s."openedByName"
          FROM "CashShiftSession" s
          WHERE s."companyId"=d."companyId" AND s."storeId"=d."storeId" AND s."status"='OPEN'
          ORDER BY s."openedAt" DESC LIMIT 1
        ) cs ON TRUE
        LEFT JOIN "StoreOperatorCredential" c
          ON c."storeId"=d."storeId" AND c."employeeId"=d."employeeId" AND c."active"=TRUE
      )
      INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName","occurredAt","createdAt")
      SELECT 'online-order-' || r."orderId",r."companyId",r."storeId",r."sessionId",
             CASE WHEN r."paymentMethod"='CASH' THEN 'SALE_CASH' ELSE 'SALE_CARD' END,
             r."total",'ONLINE ΠΑΡΑΓΓΕΛΙΑ ' || r."orderNumber",r."operatorId",r."operatorName",r."postedAt",CURRENT_TIMESTAMP
      FROM resolved r
      WHERE r."operatorId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "StoreTransaction" t
          WHERE t."companyId"=r."companyId" AND t."storeId"=r."storeId"
            AND t."description" ILIKE ('%' || r."orderNumber" || '%')
        )
      ON CONFLICT ("id") DO NOTHING
    `);
  }catch(error){console.warn("Online ordering transaction insert reconcile skipped:",error?.message||error)}
}

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
  await prisma.$executeRaw`INSERT INTO "OnlineOrderingConfig" ("id","companyId","storeId","enabled","surchargeType","surchargeValue","deliveryFee","pickupEnabled","deliveryEnabled","cashEnabled","cardOnDeliveryEnabled","autoPrintOnAccept","stockCheckEnabled") VALUES (${`online-config-${store.id}`},${store.companyId},${store.id},TRUE,'FIXED',0.10,1.00,TRUE,TRUE,TRUE,TRUE,TRUE,FALSE) ON CONFLICT ("storeId") DO UPDATE SET "enabled"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`;
  await prisma.$executeRaw`INSERT INTO "OnlineProductVisibility" ("id","companyId","storeId","productId","visible") SELECT md5(${store.id} || ':' || sp."productId"),${store.companyId},${store.id},sp."productId",TRUE FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE ON CONFLICT ("storeId","productId") DO NOTHING`;
}
export async function ensureKatOnlineOrderingSchema(){for(const statement of statements)await prisma.$executeRawUnsafe(statement);await ensureKatPilotDefaults();await ensureRecipeIngredientsTracked();await reconcileDeliveredOnlineSales();console.log("Online ordering schema/config bootstrap completed.")}
