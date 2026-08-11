import {prisma} from "./prisma.js";

let readyPromise;

export async function ensurePosPricingSchema(){
  if(!readyPromise){
    readyPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CustomerWholesalePrice" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "wholesalePrice" NUMERIC(14,4) NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("companyId","customerId","productId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerWholesalePrice_customer_idx" ON "CustomerWholesalePrice"("customerId","active")`);
    })().catch(error=>{readyPromise=undefined;throw error});
  }
  return readyPromise;
}
