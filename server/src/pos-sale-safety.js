import crypto from "crypto";
import {prisma} from "./prisma.js";

let readyPromise;

export async function ensurePosSaleSafetySchema(){
  if(!readyPromise){
    readyPromise=(async()=>{
      await prisma.$executeRawUnsafe(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "clientTransactionId" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saleFingerprint" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "duplicateConfirmed" BOOLEAN NOT NULL DEFAULT false`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Sale_store_client_tx_uq" ON "Sale"("storeId","clientTransactionId") WHERE "clientTransactionId" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Sale_store_fingerprint_recent_idx" ON "Sale"("storeId","saleFingerprint","occurredAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosSaleSafetyAudit" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "saleId" TEXT,
        "relatedSaleId" TEXT,
        "eventType" TEXT NOT NULL,
        "clientTransactionId" TEXT,
        "saleFingerprint" TEXT,
        "actorId" TEXT,
        "actorName" TEXT,
        "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PosSaleSafetyAudit_store_created_idx" ON "PosSaleSafetyAudit"("storeId","createdAt" DESC)`);
    })().catch(error=>{readyPromise=undefined;throw error});
  }
  return readyPromise;
}

export function buildSaleFingerprint({customerId,items,paymentMethod,payments,total,terminalPos}){
  const normalizedItems=[...(items||[])].map(item=>[String(item.productId||item.id||""),Number(item.quantity||item.qty||0),Number(item.lineTotal||0)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const normalizedPayments=[...(payments||[])].map(item=>[String(item.method||""),Number(item.amount||0)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const payload={customerId:customerId||null,items:normalizedItems,paymentMethod:paymentMethod||null,payments:normalizedPayments,total:Number(total||0),terminalPos:String(terminalPos||"MAIN").trim().toUpperCase()};
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function findSaleByClientTransaction(db,{companyId,storeId,clientTransactionId}){
  if(!clientTransactionId)return null;
  const rows=await db.$queryRaw`
    SELECT "id","customerId","subtotal","discount","total","status","fiscalStatus","occurredAt","clientTransactionId","saleFingerprint","duplicateConfirmed"
    FROM "Sale"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "clientTransactionId"=${clientTransactionId}
    LIMIT 1`;
  return rows[0]||null;
}

export async function findRecentSimilarSale(db,{companyId,storeId,saleFingerprint,seconds=45}){
  const since=new Date(Date.now()-Math.max(5,Math.min(300,seconds))*1000);
  const rows=await db.$queryRaw`
    SELECT "id","total","occurredAt","duplicateConfirmed"
    FROM "Sale"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='COMPLETED'
      AND "saleFingerprint"=${saleFingerprint} AND "occurredAt">=${since}
    ORDER BY "occurredAt" DESC LIMIT 1`;
  return rows[0]||null;
}

export async function insertPosSaleSafetyAudit(db,{companyId,storeId,saleId=null,relatedSaleId=null,eventType,clientTransactionId=null,saleFingerprint=null,actorId=null,actorName=null,details={}}){
  await db.$executeRaw`INSERT INTO "PosSaleSafetyAudit" ("id","companyId","storeId","saleId","relatedSaleId","eventType","clientTransactionId","saleFingerprint","actorId","actorName","details") VALUES (${crypto.randomUUID()},${companyId},${storeId},${saleId},${relatedSaleId},${eventType},${clientTransactionId},${saleFingerprint},${actorId},${actorName},${JSON.stringify(details||{})}::jsonb)`;
}
