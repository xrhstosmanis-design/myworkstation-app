import {prisma} from "./prisma.js";

const statements=[
`CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'ONLINE',
  "fulfillmentType" TEXT NOT NULL DEFAULT 'DELIVERY',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "paymentMethod" TEXT NOT NULL,
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "building" TEXT,
  "floor" TEXT,
  "department" TEXT,
  "room" TEXT,
  "deliveryNotes" TEXT,
  "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "deliveryFee" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "assignedEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineOrder_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrder_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrder_employee_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_store_number_key" ON "OnlineOrder"("storeId","orderNumber")`,
`CREATE UNIQUE INDEX IF NOT EXISTS "OnlineOrder_store_idempotency_key" ON "OnlineOrder"("storeId","idempotencyKey")`,
`CREATE INDEX IF NOT EXISTS "OnlineOrder_store_status_idx" ON "OnlineOrder"("storeId","status","createdAt")`,

`CREATE TABLE IF NOT EXISTS "OnlineOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "storeUnitPrice" DECIMAL(14,4) NOT NULL,
  "onlineSurcharge" DECIMAL(14,4) NOT NULL DEFAULT 0.10,
  "onlineUnitPrice" DECIMAL(14,4) NOT NULL,
  "lineTotal" DECIMAL(14,4) NOT NULL,
  "modifiersJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineOrderLine_order_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrderLine_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "OnlineOrderLine_order_idx" ON "OnlineOrderLine"("orderId")`,
`CREATE INDEX IF NOT EXISTS "OnlineOrderLine_product_idx" ON "OnlineOrderLine"("productId")`,

`CREATE TABLE IF NOT EXISTS "OnlineOrderStatusEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "userId" TEXT,
  "employeeId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnlineOrderStatusEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlineOrderStatusEvent_order_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrderStatusEvent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OnlineOrderStatusEvent_employee_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "OnlineOrderStatusEvent_order_idx" ON "OnlineOrderStatusEvent"("orderId","createdAt")`
];

export const KAT_ONLINE_SURCHARGE=0.10;
export const onlineUnitPrice=(storePrice)=>Math.round((Number(storePrice)+KAT_ONLINE_SURCHARGE)*100)/100;

export async function ensureKatOnlineOrderingSchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("KAT online ordering schema bootstrap completed.");
}
