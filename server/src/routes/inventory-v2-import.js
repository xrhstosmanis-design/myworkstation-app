import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
const router = Router(),
  id = () => crypto.randomUUID(),
  n = (v) => Number(v || 0),
  roles = new Set(["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]);
router.post(
  "/stocktakes/:stocktakeId/import-counts",
  async (req, res, next) => {
    try {
      if (!(roles.has(req.user?.role) || req.user?.isSuperAdmin))
        return res.status(403).json({ error: "Απαιτείται διαχειριστής." });
      const st = (
        await prisma.$queryRaw`SELECT "id","companyId","storeId","status","recountPolicy" FROM "Stocktake" WHERE "id"=${req.params.stocktakeId} AND "companyId"=${req.user.companyId} LIMIT 1`
      )[0];
      if (!st)
        return res.status(404).json({ error: "Δεν βρέθηκε η απογραφή." });
      if (st.status !== "DRAFT")
        return res.status(409).json({ error: "Η απογραφή δεν είναι ανοικτή." });
      const b = z
        .object({
          rows: z
            .array(
              z
                .object({
                  barcode: z.string().trim().optional().default(""),
                  sku: z.string().trim().optional().default(""),
                  quantity: z.coerce.number().min(0),
                })
                .refine((x) => x.barcode || x.sku),
            )
            .min(1)
            .max(20000),
        })
        .parse(req.body || {});
      const result = await prisma.$transaction(async (tx) => {
        let imported = 0;
        const missing = [];
        for (const row of b.rows) {
          const line = (
            await tx.$queryRaw`SELECT sl."id",sl."zoneId",sl."expectedQuantity",sl."countedQuantity" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" WHERE sl."stocktakeId"=${st.id} AND ((${row.sku}<>'' AND p."sku"=${row.sku}) OR (${row.barcode}<>'' AND EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode"=${row.barcode}))) LIMIT 1 FOR UPDATE OF sl`
          )[0];
          if (!line) {
            missing.push(row.barcode || row.sku);
            continue;
          }
          const previous =
              line.countedQuantity === null ? null : n(line.countedQuantity),
            expected = n(line.expectedQuantity),
            eventType = previous === null ? "IMPORT_COUNT" : "IMPORT_RECOUNT",
            recountRequired =
              st.recountPolicy === "ALL"
                ? eventType === "IMPORT_COUNT"
                : st.recountPolicy === "DIFFERENCES" &&
                  eventType === "IMPORT_COUNT" &&
                  Math.abs(row.quantity - expected) > 0.0001,
            clientEventId = `import:${id()}`;
          await tx.$executeRaw`UPDATE "StocktakeLine" SET "countedQuantity"=${row.quantity},"countedByUserId"=${req.user.id},"countedAt"=NOW(),"countVersion"="countVersion"+1,"recountRequired"=${recountRequired},"countSource"='FILE_IMPORT',"updatedAt"=NOW() WHERE "id"=${line.id}`;
          await tx.$executeRaw`INSERT INTO "InventoryCountEvent" ("id","companyId","storeId","stocktakeId","lineId","zoneId","eventType","previousQuantity","countedQuantity","expectedQuantity","actorId","actorName","source","clientEventId") VALUES (${id()},${st.companyId},${st.storeId},${st.id},${line.id},${line.zoneId},${eventType},${previous},${row.quantity},${expected},${req.user.id},${req.user.fullName || req.user.email || "Super Admin"},'FILE_IMPORT',${clientEventId})`;
          imported++;
        }
        return {
          imported,
          missing: missing.slice(0, 100),
          missingCount: missing.length,
        };
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
export default router;
