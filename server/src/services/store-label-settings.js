import { prisma } from "../prisma.js";

export const defaultLabelSettings = Object.freeze({widthMm:60,heightMm:38,printerName:""});

let ready;
async function ensureTable(){
  if(!ready)ready=prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreLabelSettings" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"widthMm" INTEGER NOT NULL DEFAULT 60,"heightMm" INTEGER NOT NULL DEFAULT 38,"printerName" TEXT NOT NULL DEFAULT '',"updatedBy" TEXT,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error=>{ready=null;throw error});
  await ready;
}

export async function getStoreLabelSettings(companyId,storeId){
  await ensureTable();
  const rows=await prisma.$queryRaw`SELECT "widthMm","heightMm","printerName" FROM "StoreLabelSettings" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
  return {...defaultLabelSettings,...rows[0]};
}

export async function saveStoreLabelSettings(companyId,storeId,actorId,settings){
  await ensureTable();
  await prisma.$executeRaw`INSERT INTO "StoreLabelSettings" ("companyId","storeId","widthMm","heightMm","printerName","updatedBy") VALUES (${companyId},${storeId},${settings.widthMm},${settings.heightMm},${settings.printerName},${actorId}) ON CONFLICT ("storeId") DO UPDATE SET "widthMm"=EXCLUDED."widthMm","heightMm"=EXCLUDED."heightMm","printerName"=EXCLUDED."printerName","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW() WHERE "StoreLabelSettings"."companyId"=EXCLUDED."companyId"`;
  return getStoreLabelSettings(companyId,storeId);
}
