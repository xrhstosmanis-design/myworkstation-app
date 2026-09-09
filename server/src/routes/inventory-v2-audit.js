import { Router } from "express";
import { prisma } from "../prisma.js";
import {
  companyModuleState,
  effectiveModuleEnabled,
  isPlatformSuperAdmin,
} from "../middleware/module-access.js";
import { storePaidModuleState } from "../store-paid-modules.js";
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
const requireLossDetection = async (req, res, stocktake) => {
  if (isPlatformSuperAdmin(req.user)) return true;
  const [company, storeModule] = await Promise.all([
    companyModuleState(stocktake.companyId),
    storePaidModuleState(stocktake.storeId, "LOSS_DETECTION"),
  ]);
  if (
    company?.licenseAllowed &&
    effectiveModuleEnabled(
      company.activeModules.includes("LOSS_DETECTION"),
      storeModule,
    )
  )
    return true;
  res.status(403).json({
    error:
      "Το επί πληρωμή module «Έλεγχος Απωλειών» δεν είναι ενεργό για αυτό το κατάστημα.",
    code: "MODULE_DISABLED",
    moduleKey: "LOSS_DETECTION",
  });
  return false;
};
router.get("/stocktakes/:stocktakeId/audit", async (req, res, next) => {
  try {
    const st = await access(req, req.params.stocktakeId);
    if (!st) return res.status(404).json({ error: "Δεν βρέθηκε η απογραφή." });
    const [lines, events] = await Promise.all([
      prisma.$queryRaw`SELECT sl."id",p."sku",p."name",pb."barcode",c."name" AS "categoryName",sc."name" AS "subcategoryName",z."name" AS "zoneName",sl."expectedQuantity",sl."countedQuantity",sl."unitCost",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",sl."countedAt",sl."countSource",COALESCE(u."fullName",'—') AS "countedBy" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" LEFT JOIN "StoreProduct" sp ON sp."storeId"=${st.storeId} AND sp."productId"=p."id" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" LEFT JOIN "InventoryZone" z ON z."id"=sl."zoneId" LEFT JOIN "User" u ON u."id"=sl."countedByUserId" LEFT JOIN LATERAL(SELECT "barcode" FROM "ProductBarcode" x WHERE x."productId"=p."id" ORDER BY x."createdAt" LIMIT 1)pb ON TRUE WHERE sl."stocktakeId"=${st.id} ORDER BY p."name"`,
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
        unitCost = n(x.unitCost),
        salePrice = n(x.salePrice);
      return {
        ...x,
        expectedQuantity: expected,
        countedQuantity: counted,
        difference,
        differenceValue: difference === null ? null : difference * unitCost,
        differenceRetailValue: difference === null ? null : difference * salePrice,
        unitCost,
        salePrice,
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
      summary: (() => {
        const counted = normalized.filter((x) => x.countedQuantity !== null),
          shortages = counted.filter((x) => n(x.difference) < 0),
          surpluses = counted.filter((x) => n(x.difference) > 0),
          total = (items, field) => items.reduce((sum, x) => sum + n(x[field]), 0);
        return {
        lineCount: normalized.length,
        countedCount: counted.length,
        eventCount: events.length,
        expectedQuantity: total(counted,"expectedQuantity"),
        countedQuantity: total(counted,"countedQuantity"),
        totalDifference: total(counted,"difference"),
        totalDifferenceValue: total(counted,"differenceValue"),
        totalRetailValue: counted.reduce((sum,x)=>sum+n(x.countedQuantity)*n(x.salePrice),0),
        totalCostValue: counted.reduce((sum,x)=>sum+n(x.countedQuantity)*n(x.unitCost),0),
        shortageQuantity: Math.abs(total(shortages,"difference")),
        shortageCostValue: Math.abs(total(shortages,"differenceValue")),
        shortageRetailValue: Math.abs(total(shortages,"differenceRetailValue")),
        surplusQuantity: total(surpluses,"difference"),
        surplusCostValue: total(surpluses,"differenceValue"),
        surplusRetailValue: total(surpluses,"differenceRetailValue"),
      };})(),
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
router.get("/stocktakes/:stocktakeId/investigation", async (req, res, next) => {
  try {
    const st = await access(req, req.params.stocktakeId);
    if (!st) return res.status(404).json({ error: "Δεν βρέθηκε η απογραφή." });
    if (st.status !== "FINALIZED")
      return res.status(409).json({
        error: "Ο έλεγχος αιτιών είναι διαθέσιμος μετά την οριστικοποίηση.",
      });
    if (!(await requireLossDetection(req, res, st))) return;

    const from = st.startedAt || st.createdAt,
      to = st.finalizedAt || new Date();
    const lines = await prisma.$queryRaw`
      SELECT sl."productId",p."name",p."sku",pb."barcode",sl."expectedQuantity",sl."countedQuantity",
             (sl."countedQuantity"-sl."expectedQuantity") AS "difference",sl."unitCost"
      FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId"
      LEFT JOIN LATERAL(SELECT "barcode" FROM "ProductBarcode" x WHERE x."productId"=p."id" ORDER BY x."createdAt" LIMIT 1)pb ON TRUE
      WHERE sl."stocktakeId"=${st.id} AND sl."countedQuantity" IS NOT NULL
        AND sl."countedQuantity"<>sl."expectedQuantity" ORDER BY ABS(sl."countedQuantity"-sl."expectedQuantity") DESC,p."name"`;

    const items = await Promise.all(
      lines.map(async (line) => {
        const [movements, sales, draftPurchases, possibleDuplicates] =
          await Promise.all([
            prisma.$queryRaw`
              SELECT sm."id",sm."movementType",sm."quantity",sm."sourceType",sm."sourceId",sm."note",sm."createdAt",
                     COALESCE(u."fullName",'—') AS "actorName"
              FROM "StockMovement" sm LEFT JOIN "User" u ON u."id"=sm."createdByUserId"
              WHERE sm."storeId"=${st.storeId} AND sm."productId"=${line.productId}
                AND sm."createdAt">=${from} AND sm."createdAt"<=${to}
                AND NOT (sm."sourceType"='INVENTORY_V2' AND sm."sourceId"=${st.id})
              ORDER BY sm."createdAt" DESC LIMIT 30`,
            prisma.$queryRaw`
              SELECT s."id",s."receiptNumber",s."source",s."status",s."occurredAt",sl."quantity",sl."lineTotal",
                     COALESCE(e."fullName",'POS') AS "actorName"
              FROM "SaleLine" sl JOIN "Sale" s ON s."id"=sl."saleId"
              LEFT JOIN "Employee" e ON e."id"=s."operatorEmployeeId"
              WHERE s."companyId"=${st.companyId} AND s."storeId"=${st.storeId} AND sl."productId"=${line.productId}
                AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
              ORDER BY s."occurredAt" DESC LIMIT 30`,
            prisma.$queryRaw`
              SELECT d."id",d."documentNumber",d."documentDate",d."status",d."sourceType",l."quantity",l."unit",l."unitsPerPackage",
                     COALESCE(sup."name",'Χωρίς προμηθευτή') AS "supplierName",COALESCE(u."fullName",'—') AS "actorName"
              FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
              LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" LEFT JOIN "User" u ON u."id"=d."createdByUserId"
              WHERE d."companyId"=${st.companyId} AND d."storeId"=${st.storeId} AND l."productId"=${line.productId}
                AND d."status"<>'APPROVED' AND d."documentDate"<=${to}
              ORDER BY d."documentDate" DESC LIMIT 20`,
            prisma.$queryRaw`
              SELECT s1."id",s1."receiptNumber",s1."occurredAt",sl1."quantity",COALESCE(e."fullName",'POS') AS "actorName",
                     s2."id" AS "matchingSaleId",s2."receiptNumber" AS "matchingReceiptNumber",s2."occurredAt" AS "matchingOccurredAt"
              FROM "SaleLine" sl1 JOIN "Sale" s1 ON s1."id"=sl1."saleId"
              JOIN "SaleLine" sl2 ON sl2."productId"=sl1."productId" AND sl2."quantity"=sl1."quantity" AND sl2."saleId"<>sl1."saleId"
              JOIN "Sale" s2 ON s2."id"=sl2."saleId" AND s2."storeId"=s1."storeId" AND s2."operatorEmployeeId" IS NOT DISTINCT FROM s1."operatorEmployeeId"
              LEFT JOIN "Employee" e ON e."id"=s1."operatorEmployeeId"
              WHERE s1."companyId"=${st.companyId} AND s1."storeId"=${st.storeId} AND sl1."productId"=${line.productId}
                AND s1."status"='COMPLETED' AND s2."status"='COMPLETED' AND s1."id"<s2."id"
                AND s1."occurredAt">=${from} AND s2."occurredAt"<=${to}
                AND ABS(EXTRACT(EPOCH FROM (s2."occurredAt"-s1."occurredAt")))<=90
              ORDER BY s1."occurredAt" DESC LIMIT 10`,
          ]);
        const evidence = [
          ...draftPurchases.map((row) => ({
            type: "UNPOSTED_PURCHASE",
            severity: "HIGH",
            title: "Παραστατικό αγοράς που δεν έχει εγκριθεί στην αποθήκη",
            at: row.documentDate,
            actorName: row.actorName,
            reference: row.documentNumber || row.id,
            details: `${row.supplierName} · κατάσταση ${row.status} · ποσότητα ${n(row.quantity)}`,
          })),
          ...possibleDuplicates.map((row) => ({
            type: "POSSIBLE_DUPLICATE_SALE",
            severity: "HIGH",
            title: "Δύο όμοιες πωλήσεις σε διάστημα έως 90 δευτερολέπτων",
            at: row.occurredAt,
            actorName: row.actorName,
            reference: `${row.receiptNumber || row.id} / ${row.matchingReceiptNumber || row.matchingSaleId}`,
            details: `Ποσότητα ${n(row.quantity)} · δεύτερη εγγραφή ${new Date(row.matchingOccurredAt).toISOString()}`,
          })),
          ...movements.map((row) => ({
            type: "STOCK_MOVEMENT",
            severity: "INFO",
            title: "Καταγεγραμμένη κίνηση αποθήκης στο διάστημα",
            at: row.createdAt,
            actorName: row.actorName,
            reference: row.sourceId || row.id,
            details: `${row.movementType} · ποσότητα ${n(row.quantity)}${row.note ? ` · ${row.note}` : ""}`,
          })),
          ...sales.map((row) => ({
            type: "SALE",
            severity: "INFO",
            title: "Καταγεγραμμένη πώληση στο διάστημα",
            at: row.occurredAt,
            actorName: row.actorName,
            reference: row.receiptNumber || row.id,
            details: `${row.source} · ${row.status} · ποσότητα ${n(row.quantity)}`,
          })),
        ].sort((a, b) => new Date(b.at) - new Date(a.at));
        return {
          ...line,
          expectedQuantity: n(line.expectedQuantity),
          countedQuantity: n(line.countedQuantity),
          difference: n(line.difference),
          differenceCostValue: n(line.difference) * n(line.unitCost),
          reviewStatus: evidence.some((row) => row.severity === "HIGH")
            ? "EVIDENCE_FOUND"
            : "NO_DOCUMENTED_CAUSE",
          evidence,
        };
      }),
    );
    res.json({
      readOnly: true,
      moduleKey: "LOSS_DETECTION",
      disclaimer:
        "Οι ενδείξεις βασίζονται αποκλειστικά σε καταγεγραμμένα στοιχεία και δεν αποδεικνύουν υπαιτιότητα εργαζομένου. Απαιτείται ανθρώπινος έλεγχος πριν από οποιοδήποτε συμπέρασμα ή ενέργεια.",
      window: { from, to },
      summary: {
        differenceItems: items.length,
        evidenceItems: items.filter((item) => item.reviewStatus === "EVIDENCE_FOUND").length,
        shortageItems: items.filter((item) => item.difference < 0).length,
        surplusItems: items.filter((item) => item.difference > 0).length,
      },
      items,
    });
  } catch (e) {
    next(e);
  }
});
export default router;
