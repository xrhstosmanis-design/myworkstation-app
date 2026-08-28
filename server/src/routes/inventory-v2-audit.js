import { Router } from "express";
import { prisma } from "../prisma.js";
const router = Router(),
  n = (v) => Number(v || 0),
  roles = new Set(["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]);
const access = async (req, id) => {
  if (!(roles.has(req.user?.role) || req.user?.isSuperAdmin)) return null;
  return (
    (
      await prisma.$queryRaw`SELECT st.*,s."name" AS "storeName",u."fullName" AS "createdByName",fu."fullName" AS "finalizedByName" FROM "Stocktake" st JOIN "Store" s ON s."id"=st."storeId" LEFT JOIN "User" u ON u."id"=st."createdByUserId" LEFT JOIN "User" fu ON fu."id"=st."finalizedByUserId" WHERE st."id"=${id} AND st."companyId"=${req.user.companyId} LIMIT 1`
    )[0] || null
  );
};
router.get("/stocktakes/:stocktakeId/audit", async (req, res, next) => {
  try {
    const st = await access(req, req.params.stocktakeId);
    if (!st) return res.status(404).json({ error: "Δεν βρέθηκε η απογραφή." });
    const [lines, events] = await Promise.all([
      prisma.$queryRaw`SELECT sl."id",p."sku",p."name",pb."barcode",c."name" AS "categoryName",sc."name" AS "subcategoryName",z."name" AS "zoneName",sl."expectedQuantity",sl."countedQuantity",sl."unitCost",sl."countedAt",sl."countSource",COALESCE(u."fullName",'—') AS "countedBy" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" LEFT JOIN "InventoryZone" z ON z."id"=sl."zoneId" LEFT JOIN "User" u ON u."id"=sl."countedByUserId" LEFT JOIN LATERAL(SELECT "barcode" FROM "ProductBarcode" x WHERE x."productId"=p."id" ORDER BY x."createdAt" LIMIT 1)pb ON TRUE WHERE sl."stocktakeId"=${st.id} ORDER BY p."name"`,
      prisma.$queryRaw`SELECT "lineId","eventType","previousQuantity","countedQuantity","expectedQuantity","actorName","deviceId","source","createdAt" FROM "InventoryCountEvent" WHERE "stocktakeId"=${st.id} ORDER BY "createdAt","id"`,
    ]);
    const grouped = new Map();
    for (const e of events) {
      if (!grouped.has(e.lineId)) grouped.set(e.lineId, []);
      grouped
        .get(e.lineId)
        .push({
          ...e,
          previousQuantity:
            e.previousQuantity === null ? null : n(e.previousQuantity),
          countedQuantity: n(e.countedQuantity),
          expectedQuantity: n(e.expectedQuantity),
        });
    }
    const normalized = lines.map((x) => {
      const expected = n(x.expectedQuantity),
        counted = x.countedQuantity === null ? null : n(x.countedQuantity),
        difference = counted === null ? null : counted - expected,
        unitCost = n(x.unitCost);
      return {
        ...x,
        expectedQuantity: expected,
        countedQuantity: counted,
        difference,
        differenceValue: difference === null ? null : difference * unitCost,
        unitCost,
        events: grouped.get(x.id) || [],
      };
    });
    res.json({
      header: {
        id: st.id,
        name: st.name,
        storeName: st.storeName,
        status: st.status,
        scopeType: st.scopeType,
        scope: st.scopeJson,
        startedAt: st.startedAt,
        finalizedAt: st.finalizedAt,
        createdBy: st.createdByName || "—",
        finalizedBy: st.finalizedByName || null,
        snapshot: st.snapshotJson,
      },
      summary: {
        lineCount: normalized.length,
        countedCount: normalized.filter((x) => x.countedQuantity !== null)
          .length,
        eventCount: events.length,
        totalDifference: normalized.reduce((s, x) => s + n(x.difference), 0),
        totalDifferenceValue: normalized.reduce(
          (s, x) => s + n(x.differenceValue),
          0,
        ),
      },
      lines: normalized,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/stocktakes/:stocktakeId/audit.csv", async (req, res, next) => {
  try {
    const st = await access(req, req.params.stocktakeId);
    if (!st) return res.status(404).json({ error: "Δεν βρέθηκε η απογραφή." });
    const rows =
      await prisma.$queryRaw`SELECT p."sku",p."name",pb."barcode",COALESCE(z."name",'') AS "zone",sl."expectedQuantity",sl."countedQuantity",(sl."countedQuantity"-sl."expectedQuantity") AS "difference",sl."unitCost",((sl."countedQuantity"-sl."expectedQuantity")*sl."unitCost") AS "differenceValue",COALESCE(u."fullName",'') AS "counter",sl."countSource",sl."countedAt" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" LEFT JOIN "InventoryZone" z ON z."id"=sl."zoneId" LEFT JOIN "User" u ON u."id"=sl."countedByUserId" LEFT JOIN LATERAL(SELECT "barcode" FROM "ProductBarcode" x WHERE x."productId"=p."id" ORDER BY x."createdAt" LIMIT 1)pb ON TRUE WHERE sl."stocktakeId"=${st.id} ORDER BY p."name"`;
    const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`,
      header = [
        "SKU",
        "Barcode",
        "Περιγραφή",
        "Ζώνη",
        "Θεωρητικό",
        "Καταμέτρηση",
        "Διαφορά",
        "Κόστος",
        "Αξία διαφοράς",
        "Καταμετρητής",
        "Πηγή",
        "Ημερομηνία",
      ],
      csv = [
        header,
        ...rows.map((x) => [
          x.sku,
          x.barcode,
          x.name,
          x.zone,
          x.expectedQuantity,
          x.countedQuantity,
          x.difference,
          x.unitCost,
          x.differenceValue,
          x.counter,
          x.countSource,
          x.countedAt?.toISOString(),
        ]),
      ]
        .map((r) => r.map(quote).join(";"))
        .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventory-audit-${st.id}.csv"`,
    );
    res.send(`\ufeff${csv}`);
  } catch (e) {
    next(e);
  }
});
export default router;
