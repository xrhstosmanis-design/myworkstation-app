import crypto from "crypto";
import {prisma} from "./prisma.js";

let schemaPromise;

export async function ensureKioskReportAuditSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "KioskAuditEvent" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT,
        "eventType" TEXT NOT NULL,
        "productId" TEXT,
        "productName" TEXT,
        "sku" TEXT,
        "quantity" NUMERIC(14,4),
        "unitPrice" NUMERIC(14,4),
        "oldActive" BOOLEAN,
        "newActive" BOOLEAN,
        "reason" TEXT,
        "sourceType" TEXT,
        "sourceId" TEXT,
        "shiftId" TEXT,
        "actorId" TEXT,
        "actorName" TEXT,
        "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KioskAuditEvent_company_event_created_idx" ON "KioskAuditEvent"("companyId","eventType","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KioskAuditEvent_store_created_idx" ON "KioskAuditEvent"("storeId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KioskAuditEvent_product_created_idx" ON "KioskAuditEvent"("productId","createdAt" DESC)`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

export async function insertKioskAuditEvent(event,db=prisma){
  const details=event.details&&typeof event.details==="object"?event.details:{};
  const eventId=event.id||crypto.randomUUID();
  await db.$executeRaw`
    INSERT INTO "KioskAuditEvent"
      ("id","companyId","storeId","eventType","productId","productName","sku","quantity","unitPrice","oldActive","newActive","reason","sourceType","sourceId","shiftId","actorId","actorName","details","createdAt")
    VALUES
      (${eventId},${event.companyId},${event.storeId||null},${event.eventType},${event.productId||null},${event.productName||null},${event.sku||null},${event.quantity??null},${event.unitPrice??null},${event.oldActive??null},${event.newActive??null},${event.reason||null},${event.sourceType||null},${event.sourceId||null},${event.shiftId||null},${event.actorId||null},${event.actorName||null},${JSON.stringify(details)}::jsonb,${event.createdAt||new Date()})
  `;
  return eventId;
}
