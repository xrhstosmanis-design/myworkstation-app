import {prisma} from "./prisma.js";

const statements=[
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isModifier" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "modifierGroup" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isService" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "eDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "efoodEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "woltEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publishStock" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publishPrices" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "efoodPrice" DECIMAL(14,4)`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "woltPrice" DECIMAL(14,4)`
];

export async function ensureProductDeliverySchema(){
  for(const statement of statements)await prisma.$executeRawUnsafe(statement);
  console.log("Product modifiers / e-delivery schema bootstrap completed.");
}
