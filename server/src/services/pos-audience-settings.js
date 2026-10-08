import {prisma} from "../prisma.js";
import {normalizeAudienceSettings} from "../../../shared/pos-audience-settings.mjs";

export async function readPosAudienceSettings(companyId, storeId) {
  const rows = await prisma.$queryRaw`SELECT "layoutJson"->'audienceSettings' AS "settings"
    FROM "StorePosLayout" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
  return normalizeAudienceSettings(rows[0]?.settings);
}

export async function requirePosAudienceEnabled(companyId, storeId) {
  const settings = await readPosAudienceSettings(companyId, storeId);
  if (!settings.enabled) throw Object.assign(new Error("Οι δικαιούχοι έκπτωσης δεν είναι ενεργοί στο κατάστημα. Κάνε ανανέωση του POS."), {status:409});
  return settings;
}
