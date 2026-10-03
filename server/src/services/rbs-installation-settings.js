import {z} from "zod";

const code=z.string().trim().regex(/^\d{1,2}$/,"Βάλε τον επιβεβαιωμένο κωδικό πληρωμής της RBS (0–99).").transform(value=>String(Number(value)));
export const rbsInstallationSettingsSchema=z.object({
  terminalPos:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/),
  cashCode:code,cardCode:code,deliveryCode:code.or(z.literal("")).default(""),
  workFolder:z.string().trim().min(4).max(240).regex(/^[A-Za-z]:\\[^\r\n]*$/,"Βάλε απόλυτη διαδρομή Windows, π.χ. C:\\capture."),
  confirmed:z.literal(true,{errorMap:()=>({message:"Επιβεβαίωσε τους κωδικούς από τις ρυθμίσεις της συγκεκριμένης RBS."})})
}).refine(row=>row.cashCode!==row.cardCode&&(!row.deliveryCode||![row.cashCode,row.cardCode].includes(row.deliveryCode)),{message:"Οι τρόποι πληρωμής χρειάζονται διαφορετικούς κωδικούς RBS."});

export async function ensureRbsInstallationSettings(db){
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreRbsInstallationSettings" (
    "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"terminalPos" TEXT NOT NULL,
    "fiscalDeviceCode" TEXT NOT NULL,"storeEftposCode" TEXT NOT NULL,"deliveryEftposCode" TEXT,
    "cashCode" TEXT NOT NULL,"cardCode" TEXT NOT NULL,"deliveryCode" TEXT,"workFolder" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,"confirmedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("companyId","storeId","terminalPos"))`);
}

// Read-only: absent configuration must not create a table or imply readiness.
export async function readRbsInstallationSettings(db,{companyId,storeId,terminalPos}){
  const tables=await db.$queryRaw`SELECT to_regclass('public."StoreRbsInstallationSettings"')::text AS settings`;
  if(!tables[0]?.settings)return null;
  const rows=await db.$queryRaw`SELECT s.* FROM "StoreRbsInstallationSettings" s
    JOIN "StoreFiscalDevice" f ON f."companyId"=s."companyId" AND f."storeId"=s."storeId" AND f."terminalPos"=s."terminalPos" AND f."deviceCode"=s."fiscalDeviceCode" AND f."active"=TRUE
    JOIN "StoreEftposDevice" e ON e."companyId"=s."companyId" AND e."storeId"=s."storeId" AND e."fiscalDeviceCode"=s."fiscalDeviceCode" AND e."deviceCode"=s."storeEftposCode" AND e."role"='STORE' AND e."active"=TRUE
    JOIN "StoreInstallationTerminal" t ON t."companyId"=s."companyId" AND t."storeId"=s."storeId" AND t."terminalPos"=s."terminalPos" AND t."active"=TRUE
    WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."terminalPos"=${terminalPos}
    AND (s."deliveryCode" IS NULL OR EXISTS (SELECT 1 FROM "StoreEftposDevice" d WHERE d."companyId"=s."companyId" AND d."storeId"=s."storeId" AND d."fiscalDeviceCode"=s."fiscalDeviceCode" AND d."deviceCode"=s."deliveryEftposCode" AND d."role"='DELIVERY' AND d."active"=TRUE)) LIMIT 1`;
  if(!rows[0]){
    const saved=await db.$queryRaw`SELECT 1 FROM "StoreRbsInstallationSettings" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "terminalPos"=${terminalPos} LIMIT 1`;
    if(saved.length){const error=new Error("Η αντιστοίχιση εξοπλισμού άλλαξε. Επιβεβαίωσε ξανά τις ρυθμίσεις CAPDriver για αυτό το POS.");error.status=409;throw error}
  }
  return rows[0]||null;
}
